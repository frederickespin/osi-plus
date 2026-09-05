import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  LogisticsEngineError, calculateLogisticsPlan, canonicalHash, canonicalJson,
  logisticsFail, normalizeCalculate, normalizeIssueResolution, normalizeOverride,
  normalizePublish, normalizeRuleCreate,
} from "./logisticsEngineContract.js";

export const LOGISTICS_PERMISSIONS = Object.freeze({
  PLAN_VIEW: "logistics:plan:view",
  PLAN_CALCULATE: "logistics:plan:calculate",
  PLAN_PUBLISH: "logistics:plan:publish",
  PLAN_TENANT: "logistics:plan:tenant",
  PLAN_OVERRIDE: "logistics:plan:override",
  PLAN_RESOLVE: "logistics:plan:resolve",
  RULES_VIEW: "logistics:rules:view",
  RULES_MANAGE: "logistics:rules:manage",
});

function requirePermission(context, permission) {
  if (!context?.tenantId || !context?.membershipId || !context?.userId || !context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission)) logisticsFail("LOGISTICS_FORBIDDEN", 403);
}
function actor(context) { return { actorMembershipId: context.membershipId, actorUserId: context.userId }; }
function audit(context, action, entity, entityId, requestId, after) { return { tenant_id: context.tenantId, actor_user_id: context.userId, actor_membership_id: context.membershipId, role_snapshot: context.role, action, entity, entityId: String(entityId), after_json: after, source: "V17_LOGISTICS_ENGINE", request_id: requestId, correlation_id: requestId, critical: true }; }
function numeric(value, fallback = 0) { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : fallback; }
function publicCaseScope(context) {
  const tenantWide = context.effectivePermissions?.includes(LOGISTICS_PERMISSIONS.PLAN_TENANT) && !context.deniedPermissions?.includes(LOGISTICS_PERMISSIONS.PLAN_TENANT);
  return tenantWide ? {} : { ownerMembershipId: context.membershipId, ownerUserId: context.userId };
}
async function resolveCase(tx, context, caseRef) {
  const row = await tx.pipelineCase.findFirst({ where: { tenantId: context.tenantId, publicRef: caseRef, ...publicCaseScope(context) }, select: { id: true, publicRef: true, mode: true, routeContractVersion: true, routeRevision: true, destinationStatus: true } });
  if (!row) logisticsFail("LOGISTICS_PLAN_NOT_FOUND", 404);
  return row;
}
function sumMovement(rows) {
  const positive = new Set(["RECEIPT", "TRANSFER_IN", "RETURN", "ADJUSTMENT_POSITIVE"]);
  return rows.reduce((total, row) => total + numeric(row.quantityBase) * (positive.has(row.movementType) ? 1 : -1), 0);
}
function surveyMetrics(publication) {
  if (!publication) return { publicationRef: null, logicalSha256: null, volumeM3: 0, weightKg: 0, itemCount: 0, accessFlags: [], cratingCandidates: 0 };
  const totals = publication.totalsSnapshot || {};
  const accessFlags = [...new Set(publication.accessSnapshots.flatMap((row) => {
    const facts = row.factsSnapshot || {};
    return Object.entries(facts).filter(([, value]) => value === true).map(([key]) => `${row.side}:${key}`);
  }))].sort();
  const items = publication.items || [];
  return {
    publicationRef: publication.publicationRef,
    logicalSha256: publication.logicalSha256,
    volumeM3: numeric(totals.totalVolumeM3 ?? totals.volumeM3 ?? items.reduce((sum, item) => sum + numeric(item.unitVolumeM3) * item.quantity, 0)),
    weightKg: numeric(totals.totalWeightKg ?? totals.weightKg ?? items.reduce((sum, item) => sum + numeric(item.unitWeightKg) * item.quantity, 0)),
    itemCount: numeric(totals.itemCount ?? items.reduce((sum, item) => sum + item.quantity, 0)),
    accessFlags,
    cratingCandidates: items.filter((item) => item.flags?.some((flag) => ["FRAGILE", "OVERSIZED", "CRATING_CANDIDATE"].includes(flag))).length,
  };
}
async function currentRules(tx, tenantId, at) {
  return tx.logisticsRule.findMany({ where: { tenantId, state: "ACTIVE", AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: at } }] }, { OR: [{ validTo: null }, { validTo: { gt: at } }] }] }, orderBy: [{ priority: "desc" }, { specificity: "desc" }, { version: "desc" }, { ruleRef: "asc" }] });
}
function inputFingerprint(facts, rules) {
  const { availabilityObservedAt: _observedAt, ...stableFacts } = facts;
  return canonicalHash({ facts: stableFacts, rules: rules.map((rule) => ({ ruleRef: rule.ruleRef, version: rule.version, conditionHash: rule.conditionHash, result: rule.result })) });
}

export async function loadCanonicalLogisticsFacts(tx, context, caseRef, intervalStart, intervalEnd) {
  const pipelineCase = await resolveCase(tx, context, caseRef);
  const start = new Date(intervalStart); const end = new Date(intervalEnd); const observedAt = new Date();
  const [routeRows, service, publication, requirement, models, vehicles, offers] = await Promise.all([
    tx.pipelineCaseRouteSnapshot.findMany({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id, routeVersion: pipelineCase.routeRevision }, select: { role: true, stopOrder: true, countryCode: true, provinceState: true, cityMunicipality: true }, orderBy: [{ role: "asc" }, { stopOrder: "asc" }] }),
    tx.pipelineCaseServiceRevision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { revision: "desc" }, include: { items: { orderBy: { position: "asc" } } } }),
    tx.surveyPublication.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id, status: "CURRENT" }, orderBy: { publishedAt: "desc" }, include: { items: { orderBy: { position: "asc" } }, accessSnapshots: true } }),
    tx.materialRequirementSnapshot.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id, status: "CURRENT" }, orderBy: { createdAt: "desc" }, include: { lines: { include: { material: { select: { id: true, materialRef: true, name: true, costs: { where: { validTo: null }, orderBy: { version: "desc" }, take: 1 } } }, unit: { select: { code: true } } }, orderBy: { position: "asc" } } } }),
    tx.assetModel.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE" }, include: { instances: { where: { operationalStatus: { notIn: ["OUT_OF_SERVICE", "LOST", "RETIRED"] } }, include: { reservations: { where: { status: "ACTIVE", startsAt: { lt: end }, endsAt: { gt: start } } }, assignments: { where: { status: "ACTIVE" } }, maintenanceOrders: { where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledStart: { lt: end }, scheduledEnd: { gt: start } } } } } } }),
    tx.vehicle.findMany({ where: { tenant_id: context.tenantId, operational_status: "AVAILABLE", available_for_calculation: true, effective_from: { lte: start }, OR: [{ effective_to: null }, { effective_to: { gt: start } }] }, select: { vehicle_type: true, capacity_volume: true, capacity_weight: true, row_version: true } }),
    tx.externalResourceOffer.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE", OR: [{ validFrom: null }, { validFrom: { lte: end } }], AND: [{ OR: [{ validTo: null }, { validTo: { gt: start } }] }] }, include: { reservations: { where: { status: { in: ["REQUESTED", "CONFIRMED"] }, startsAt: { lt: end }, endsAt: { gt: start } } } } }),
  ]);
  if (!service) logisticsFail("LOGISTICS_SERVICE_REVISION_REQUIRED", 409);
  const materialIds = requirement?.lines.map((line) => line.material.id) || [];
  const [movements, reservations] = materialIds.length ? await Promise.all([
    tx.materialInventoryMovement.findMany({ where: { tenantId: context.tenantId, materialId: { in: materialIds }, occurredAt: { lte: observedAt } }, select: { materialId: true, movementType: true, quantityBase: true } }),
    tx.materialReservation.findMany({ where: { tenantId: context.tenantId, materialId: { in: materialIds }, status: { in: ["RESERVED", "ASSIGNED"] } }, select: { materialId: true, quantityBase: true } }),
  ]) : [[], []];
  const byType = new Map(); for (const row of vehicles) { const current = byType.get(row.vehicle_type) || { vehicleType: row.vehicle_type, available: 0, maxVolumeM3: 0, maxWeightKg: 0, sourceVersion: 0 }; current.available += 1; current.maxVolumeM3 = Math.max(current.maxVolumeM3, numeric(row.capacity_volume)); current.maxWeightKg = Math.max(current.maxWeightKg, numeric(row.capacity_weight)); current.sourceVersion = Math.max(current.sourceVersion, row.row_version); byType.set(row.vehicle_type, current); }
  const survey = surveyMetrics(publication);
  const distanceKm = numeric((publication?.contextSnapshot || {}).distanceKm, Number.NaN);
  const route = { contractVersion: pipelineCase.routeContractVersion, version: pipelineCase.routeRevision, destinationStatus: pipelineCase.destinationStatus || "CONFIRMED", distanceStatus: Number.isFinite(distanceKm) ? "KNOWN" : "PENDING", distanceKm: Number.isFinite(distanceKm) ? distanceKm : null, stops: routeRows.map((row) => ({ role: row.role, order: row.stopOrder, countryCode: row.countryCode, provinceState: row.provinceState, cityMunicipality: row.cityMunicipality })) };
  const services = { selectionRef: service.selectionRef, revision: service.revision, mode: service.modeSnapshot, codes: service.items.map((item) => item.codeSnapshot), items: service.items.map((item) => ({ serviceRef: item.serviceRefSnapshot, code: item.codeSnapshot, kind: item.kind, catalogVersion: item.catalogVersionSnapshot })) };
  const materials = { requirementRef: requirement?.requirementRef || null, logicalSha256: requirement?.logicalSha256 || null, lines: (requirement?.lines || []).map((line) => { const available = sumMovement(movements.filter((row) => row.materialId === line.material.id)); const reserved = reservations.filter((row) => row.materialId === line.material.id).reduce((sum, row) => sum + numeric(row.quantityBase), 0); return { materialRef: line.material.materialRef, name: line.material.name, unit: line.unit.code, required: numeric(line.requiredQuantity), available, reserved, costVersion: line.material.costs[0]?.version || null }; }) };
  const assets = models.map((model) => ({ modelRef: model.modelRef, code: model.code, name: model.name, family: model.family, resourceType: model.resourceType, version: model.version, available: model.instances.filter((instance) => instance.operationalStatus === "AVAILABLE" && instance.reservations.length === 0 && instance.assignments.length === 0 && instance.maintenanceOrders.length === 0).length, observed: model.instances.length }));
  const externalOffers = offers.map((offer) => { const capacity = numeric(offer.capacity?.quantity, 1); const reserved = offer.reservations.reduce((sum, row) => sum + row.quantity, 0); const free = Math.max(0, capacity - reserved); return { offerRef: offer.offerRef, kind: offer.assetModelId ? "EXTERNAL_ASSET" : "EXTERNAL_RESOURCE", label: offer.resourceDescription, providerName: offer.providerNameSnapshot, quantity: 1, unit: "unidad", availableQuantity: capacity, reservedQuantity: reserved, shortageQuantity: free > 0 ? 0 : 1, availability: offer.availabilityStatus === "AVAILABLE" && free > 0 ? "AVAILABLE" : offer.availabilityStatus === "UNAVAILABLE" ? "UNAVAILABLE" : "PENDING_CONFIRMATION", priceStatus: offer.rateAmount == null ? "PENDING" : "REFERENCED", version: offer.version }; });
  return Object.freeze({ caseRef: pipelineCase.publicRef, mode: pipelineCase.mode, route, services, survey, materials, assets, vehicles: [...byType.values()], externalOffers, availabilityObservedAt: observedAt.toISOString(), interval: { start: start.toISOString(), end: end.toISOString() } });
}

async function replay(tx, context, input) {
  const row = await tx.logisticsMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
  if (!row) return null;
  if (row.operation !== input.operation || row.payloadHash !== input.payloadHash) logisticsFail("LOGISTICS_IDEMPOTENCY_CONFLICT", 409);
  return Object.freeze(row.resultJson);
}
async function persist(tx, context, input, targetRef, result, action, entity) {
  await tx.logisticsMutationCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: String(targetRef), resultJson: result, ...actor(context) } });
  await tx.commercialAuditLog.create({ data: audit(context, action, entity, targetRef, input.requestId, result) });
  return Object.freeze(result);
}

export async function calculateLogistics(prisma, context, raw) {
  requirePermission(context, LOGISTICS_PERMISSIONS.PLAN_CALCULATE); const input = normalizeCalculate(raw);
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const facts = await loadCanonicalLogisticsFacts(tx, context, input.caseRef, input.intervalStart, input.intervalEnd);
    const rules = await currentRules(tx, context.tenantId, new Date(input.intervalStart));
    const resultSnapshot = calculateLogisticsPlan(facts, rules);
    const inputHash = inputFingerprint(facts, rules);
    const row = await tx.logisticsCalculation.create({ data: { tenantId: context.tenantId, pipelineCaseId: (await resolveCase(tx, context, input.caseRef)).id, routeVersion: facts.route.version, serviceSelectionRef: facts.services.selectionRef, serviceRevision: facts.services.revision, surveyPublicationRef: facts.survey.publicationRef, surveyLogicalSha256: facts.survey.logicalSha256, materialRequirementRef: facts.materials.requirementRef, materialLogicalSha256: facts.materials.logicalSha256, availabilityObservedAt: new Date(facts.availabilityObservedAt), intervalStart: new Date(input.intervalStart), intervalEnd: new Date(input.intervalEnd), inputSnapshot: facts, rulesSnapshot: resultSnapshot.rules, resultSnapshot, inputHash, resultHash: canonicalHash(resultSnapshot), requestId: input.requestId, payloadHash: input.payloadHash, ...actor(context) } });
    const result = { calculationRef: row.calculationRef, status: row.status, inputHash: row.inputHash, resultHash: row.resultHash, availabilityObservedAt: row.availabilityObservedAt.toISOString(), result: resultSnapshot };
    return persist(tx, context, input, row.calculationRef, result, "LOGISTICS_CALCULATE", "LogisticsCalculation");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function publishLogistics(prisma, context, raw) {
  requirePermission(context, LOGISTICS_PERMISSIONS.PLAN_PUBLISH); const input = normalizePublish(raw);
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.calculationRef}:logistics-publish`}, 0))`);
    const calculation = await tx.logisticsCalculation.findFirst({ where: { tenantId: context.tenantId, calculationRef: input.calculationRef }, include: { pipelineCase: { select: { publicRef: true } }, publishedRevision: true } });
    if (!calculation) logisticsFail("LOGISTICS_CALCULATION_NOT_FOUND", 404);
    if (calculation.publishedRevision) logisticsFail("LOGISTICS_CALCULATION_ALREADY_PUBLISHED", 409);
    await resolveCase(tx, context, calculation.pipelineCase.publicRef);
    const facts = await loadCanonicalLogisticsFacts(tx, context, calculation.pipelineCase.publicRef, calculation.intervalStart.toISOString(), calculation.intervalEnd.toISOString());
    const rules = await currentRules(tx, context.tenantId, calculation.intervalStart);
    const currentHash = inputFingerprint(facts, rules);
    if (currentHash !== calculation.inputHash) logisticsFail("LOGISTICS_INPUT_STALE", 409);
    const plan = await tx.logisticsPlan.upsert({ where: { tenantId_pipelineCaseId: { tenantId: context.tenantId, pipelineCaseId: calculation.pipelineCaseId } }, update: {}, create: { tenantId: context.tenantId, pipelineCaseId: calculation.pipelineCaseId } });
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${plan.id}:logistics-revision`}, 0))`);
    const latest = await tx.logisticsPlanRevision.findFirst({ where: { tenantId: context.tenantId, planId: plan.id }, orderBy: { revision: "desc" }, select: { revision: true } });
    const revision = (latest?.revision || 0) + 1; const snapshot = calculation.resultSnapshot;
    const row = await tx.logisticsPlanRevision.create({ data: { tenantId: context.tenantId, planId: plan.id, calculationId: calculation.id, revision, inputSnapshot: calculation.inputSnapshot, rulesSnapshot: calculation.rulesSnapshot, resultSnapshot: snapshot, logicalSha256: canonicalHash({ input: calculation.inputSnapshot, rules: calculation.rulesSnapshot, result: snapshot }), publishedByMembershipId: context.membershipId, publishedByUserId: context.userId, items: { create: snapshot.items }, issues: { create: snapshot.issues } }, include: { items: true, issues: true } });
    const result = mapRevision(plan.planRef, row);
    return persist(tx, context, input, row.revisionRef, result, revision === 1 ? "LOGISTICS_PUBLISH" : "LOGISTICS_RECALCULATE_PUBLISH", "LogisticsPlanRevision");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

function mapRevision(planRef, row) { return { planRef, revisionRef: row.revisionRef, revision: row.revision, status: row.status, logicalSha256: row.logicalSha256, publishedAt: row.publishedAt.toISOString(), items: row.items.map(({ itemRef, family, kind, label, quantity, unit, estimatedHours, trips, requiredQuantity, availableQuantity, reservedQuantity, shortageQuantity, availability, priceStatus, source, sourceRef, sourceVersion, snapshot, position }) => ({ itemRef, family, kind, label, quantity: quantity == null ? null : Number(quantity), unit, estimatedHours: estimatedHours == null ? null : Number(estimatedHours), trips, requiredQuantity: requiredQuantity == null ? null : Number(requiredQuantity), availableQuantity: availableQuantity == null ? null : Number(availableQuantity), reservedQuantity: reservedQuantity == null ? null : Number(reservedQuantity), shortageQuantity: shortageQuantity == null ? null : Number(shortageQuantity), availability, priceStatus, source, sourceRef, sourceVersion, snapshot, position })), issues: row.issues.map(({ issueRef, code, severity, family, message, source, sourceSnapshot, status, resolvedReason, resolvedAt, version }) => ({ issueRef, code, severity, family, message, source, sourceSnapshot, status, resolvedReason, resolvedAt: resolvedAt?.toISOString() || null, version })), overrides: (row.overrides || []).map(({ overrideRef, itemId, suggestedValue, finalValue, reason, createdAt }) => ({ overrideRef, itemRef: row.items.find((item) => item.id === itemId)?.itemRef || null, suggestedValue, finalValue, reason, createdAt: createdAt.toISOString() })) }; }

export async function getLogisticsPlan(prisma, context, caseRef) {
  requirePermission(context, LOGISTICS_PERMISSIONS.PLAN_VIEW); const pipelineCase = await resolveCase(prisma, context, caseRef);
  const plan = await prisma.logisticsPlan.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id }, include: { revisions: { orderBy: { revision: "desc" }, take: 1, include: { items: { orderBy: { position: "asc" } }, issues: true, overrides: true } } } });
  return plan?.revisions[0] ? mapRevision(plan.planRef, plan.revisions[0]) : null;
}

export async function listLogisticsRules(prisma, context, query = {}) {
  requirePermission(context, LOGISTICS_PERMISSIONS.RULES_VIEW);
  const rows = await prisma.logisticsRule.findMany({ where: { tenantId: context.tenantId, ...(query.family ? { family: String(query.family) } : {}), ...(query.state ? { state: String(query.state) } : {}) }, orderBy: [{ family: "asc" }, { priority: "desc" }, { specificity: "desc" }, { version: "desc" }] });
  return rows.map(({ ruleRef, seriesRef, family, code, name, priority, specificity, conditions, result, state, version, validFrom, validTo }) => ({ ruleRef, seriesRef, family, code, name, priority, specificity, conditions, result, state, version, validFrom: validFrom?.toISOString() || null, validTo: validTo?.toISOString() || null }));
}

export async function versionLogisticsRule(prisma, context, raw) {
  requirePermission(context, LOGISTICS_PERMISSIONS.RULES_MANAGE); const input = normalizeRuleCreate(raw);
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const seriesRef = input.seriesRef || randomUUID();
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${seriesRef}:logistics-rule`}, 0))`);
    const current = await tx.logisticsRule.findFirst({ where: { tenantId: context.tenantId, seriesRef }, orderBy: { version: "desc" } });
    if (current) await tx.logisticsRule.update({ where: { id: current.id }, data: { state: "SUPERSEDED", validTo: input.validFrom ? new Date(input.validFrom) : new Date() } });
    const row = await tx.logisticsRule.create({ data: { tenantId: context.tenantId, seriesRef, family: input.family, code: input.code, name: input.name, priority: input.priority, specificity: input.specificity, conditions: input.conditions, conditionHash: canonicalHash(input.conditions), result: input.result, state: input.state, version: (current?.version || 0) + 1, validFrom: input.validFrom ? new Date(input.validFrom) : null, validTo: input.validTo ? new Date(input.validTo) : null, replacesRuleId: current?.id, requestId: input.requestId, payloadHash: input.payloadHash, ...actor(context) } });
    const result = { ruleRef: row.ruleRef, seriesRef: row.seriesRef, family: row.family, code: row.code, name: row.name, priority: row.priority, specificity: row.specificity, state: row.state, version: row.version, conditionHash: row.conditionHash };
    return persist(tx, context, input, row.ruleRef, result, current ? "LOGISTICS_RULE_VERSION" : "LOGISTICS_RULE_CREATE", "LogisticsRule");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createLogisticsOverride(prisma, context, raw) {
  requirePermission(context, LOGISTICS_PERMISSIONS.PLAN_OVERRIDE); const input = normalizeOverride(raw);
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const revision = await tx.logisticsPlanRevision.findFirst({ where: { tenantId: context.tenantId, revisionRef: input.revisionRef }, include: { plan: { include: { pipelineCase: { select: { publicRef: true } } } }, items: { where: { itemRef: input.itemRef } } } });
    if (!revision || revision.items.length !== 1) logisticsFail("LOGISTICS_PLAN_NOT_FOUND", 404); await resolveCase(tx, context, revision.plan.pipelineCase.publicRef);
    const item = revision.items[0]; const suggested = { quantity: item.quantity == null ? null : Number(item.quantity), estimatedHours: item.estimatedHours == null ? null : Number(item.estimatedHours), trips: item.trips };
    if (canonicalJson(suggested) !== canonicalJson(input.expectedSuggested)) logisticsFail("LOGISTICS_OVERRIDE_CONFLICT", 409);
    const row = await tx.logisticsPlanOverride.create({ data: { tenantId: context.tenantId, revisionId: revision.id, itemId: item.id, suggestedValue: suggested, finalValue: input.finalValue, reason: input.reason, ...actor(context) } });
    const result = { overrideRef: row.overrideRef, revisionRef: revision.revisionRef, itemRef: item.itemRef, suggestedValue: row.suggestedValue, finalValue: row.finalValue, reason: row.reason };
    return persist(tx, context, input, row.overrideRef, result, "LOGISTICS_OVERRIDE", "LogisticsPlanOverride");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveLogisticsIssue(prisma, context, raw) {
  requirePermission(context, LOGISTICS_PERMISSIONS.PLAN_RESOLVE); const input = normalizeIssueResolution(raw);
  return prisma.$transaction(async (tx) => {
    const prior = await replay(tx, context, input); if (prior) return prior;
    const revision = await tx.logisticsPlanRevision.findFirst({ where: { tenantId: context.tenantId, revisionRef: input.revisionRef }, include: { plan: { include: { pipelineCase: { select: { publicRef: true } } } } } });
    if (!revision) logisticsFail("LOGISTICS_PLAN_NOT_FOUND", 404); await resolveCase(tx, context, revision.plan.pipelineCase.publicRef);
    const changed = await tx.logisticsPlanIssue.updateMany({ where: { tenantId: context.tenantId, revisionId: revision.id, issueRef: input.issueRef, status: "OPEN", version: input.expectedVersion }, data: { status: "RESOLVED", resolvedReason: input.reason, resolvedByMembershipId: context.membershipId, resolvedByUserId: context.userId, resolvedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) logisticsFail("LOGISTICS_ISSUE_CONFLICT", 409);
    const row = await tx.logisticsPlanIssue.findFirst({ where: { tenantId: context.tenantId, issueRef: input.issueRef } }); const result = { issueRef: row.issueRef, status: row.status, version: row.version, resolvedAt: row.resolvedAt.toISOString() };
    return persist(tx, context, input, row.issueRef, result, "LOGISTICS_BLOCKER_RESOLVE", "LogisticsPlanIssue");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function mapLogisticsDatabaseError(error) {
  if (error instanceof LogisticsEngineError) return error;
  const message = String(error?.message || "");
  if (message.includes("logistics_rules_no_equal_conflict")) return new LogisticsEngineError("LOGISTICS_RULE_CONFLICT", 409);
  if (message.includes("LOGISTICS_APPEND_ONLY") || message.includes("LOGISTICS_IDENTITY_IMMUTABLE")) return new LogisticsEngineError("LOGISTICS_HISTORY_IMMUTABLE", 409);
  if (error?.code === "P2002") return new LogisticsEngineError("LOGISTICS_CONCURRENCY_CONFLICT", 409);
  return error;
}
