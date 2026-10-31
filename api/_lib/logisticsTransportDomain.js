import { Prisma } from "@prisma/client";
import { calculateLogisticsPlan, canonicalHash, isTransportPolicy, logisticsFail } from "./logisticsEngineContract.js";
import { loadCanonicalLogisticsFacts } from "./logisticsEngineDomain.js";
import { calculateTransportResult, normalizeTransportCalculate, normalizeTransportInput, normalizeTransportPublish, selectTransportZone, TRANSPORT_CONTRACT, transportRef } from "./logisticsTransportContract.js";
import { latestLogisticsRevision, normalizeTransportContext, transportContextOf } from "./logisticsTransportContext.js";
import { authorizeTransportContext, loadTransportZones, revalidateTransportActor, withTransportTransaction } from "./logisticsTransportZones.js";

const READ = Object.freeze(["logistics:plan:view", "costing:view"]);
export const TRANSPORT_PLAN_PERMISSIONS = Object.freeze({
  VIEW: READ,
  CALCULATE: Object.freeze([...READ, "logistics:plan:calculate", "costing:calculate"]),
  PUBLISH: Object.freeze([...READ, "logistics:plan:publish", "costing:publish"]),
});
const Decimal = Prisma.Decimal.clone({ precision: 48 });
const actorFields = (context) => ({ actorMembershipId: context.membershipId, actorUserId: context.userId });
const contextFor = (input) => ({ contract: TRANSPORT_CONTRACT, purpose: input.purpose, contextRef: input.contextRef });
function caseScope(context) { const tenantWide = ["logistics:plan:tenant", "costing:tenant"].every((permission) => context.effectivePermissions?.includes(permission) && !context.deniedPermissions?.includes(permission)); return tenantWide ? {} : { ownerMembershipId: context.membershipId, ownerUserId: context.userId }; }
async function resolveCase(tx, context, caseRef) {
  const row = await tx.pipelineCase.findFirst({ where: { tenantId: context.tenantId, publicRef: transportRef(caseRef), ...caseScope(context) }, select: { id: true, publicRef: true, caseCode: true, mode: true, routeContractVersion: true, routeRevision: true, destinationStatus: true } });
  if (!row) logisticsFail("LOGISTICS_PLAN_NOT_FOUND", 404);
  return row;
}
async function visitFor(tx, context, pipelineCase, input) {
  if (input.purpose !== "VISIT") return null;
  const latest = await tx.surveyEvaluationDecision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { version: "desc" }, select: { id: true, decisionRef: true, version: true, method: true, commercialState: true, routeVersion: true, serviceRevisionId: true } });
  if (!latest || latest.decisionRef !== input.contextRef || latest.method !== "IN_PERSON" || ["CANCELLED", "NOT_REQUIRED"].includes(latest.commercialState) || latest.routeVersion !== pipelineCase.routeRevision) logisticsFail("TRANSPORT_VISIT_CONTEXT_STALE", 409);
  return latest;
}
async function canonicalFacts(tx, context, pipelineCase, input, visit) {
  if (input.purpose !== "VISIT") return loadCanonicalLogisticsFacts(tx, context, input.caseRef, input.intervalStart, input.intervalEnd);
  // A visit needs the actual case/service decision, but no completed Survey,
  // inventory plan or quotation. Never synthesize a service selection UUID.
  const service = await tx.pipelineCaseServiceRevision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id, ...(visit.serviceRevisionId ? { id: visit.serviceRevisionId } : {}) }, orderBy: { revision: "desc" }, include: { items: { orderBy: { position: "asc" } } } });
  if (!service) logisticsFail("LOGISTICS_SERVICE_REVISION_REQUIRED", 409);
  return {
    caseRef: input.caseRef, mode: pipelineCase.mode,
    route: { version: pipelineCase.routeRevision, contractVersion: pipelineCase.routeContractVersion, destinationStatus: pipelineCase.destinationStatus, distanceKm: null, distanceStatus: "PENDING", stops: [] },
    services: { selectionRef: service.selectionRef, revision: service.revision, mode: service.modeSnapshot, codes: service.items.map((row) => row.codeSnapshot), items: service.items.map((row) => ({ serviceRef: row.serviceRefSnapshot, code: row.codeSnapshot, kind: row.kind, catalogVersion: row.catalogVersionSnapshot })) },
    survey: { publicationRef: null, logicalSha256: null, volumeM3: 0, weightKg: 0, itemCount: 0, accessFlags: [] }, materials: { requirementRef: null, logicalSha256: null, lines: [] }, assets: [], vehicles: [], externalOffers: [],
    availabilityObservedAt: new Date().toISOString(), interval: { start: input.intervalStart, end: input.intervalEnd },
  };
}
async function currentOperationalRules(tx, tenantId, at) {
  const rows = await tx.logisticsRule.findMany({ where: { tenantId, state: "ACTIVE", AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: at } }] }, { OR: [{ validTo: null }, { validTo: { gt: at } }] }] }, orderBy: [{ priority: "desc" }, { specificity: "desc" }, { version: "desc" }, { ruleRef: "asc" }] });
  return rows.filter((row) => !isTransportPolicy(row));
}
async function selectedVehicles(tx, context, input) {
  const refs = [...new Set(input.journeys.map((row) => row.vehicleRef).filter(Boolean))];
  const rows = refs.length ? await tx.vehicle.findMany({ where: { tenant_id: context.tenantId, id: { in: refs } }, select: { id: true, vehicle_type: true, operational_status: true, available_for_calculation: true, row_version: true, effective_from: true, effective_to: true, retired_at: true } }) : [];
  if (rows.length !== refs.length) logisticsFail("TRANSPORT_VEHICLE_NOT_FOUND", 404);
  return rows.sort((a, b) => a.id.localeCompare(b.id)).map((row) => ({ vehicleRef: row.id, vehicleType: row.vehicle_type, operationalStatus: row.operational_status, active: row.available_for_calculation, version: row.row_version, effectiveFrom: row.effective_from.toISOString(), effectiveTo: row.effective_to?.toISOString() ?? null, retiredAt: row.retired_at?.toISOString() ?? null }));
}
function operationalTransportItems(result, input, zones) {
  return result.lines.map((line) => {
    const journey = input.journeys.find((row) => row.journeyRef === line.journeyRef);
    const originZone = journey.origin ? selectTransportZone(zones, { ...journey, destination: journey.origin }, input.purpose).zone : null;
    return ({
    family: ["PER_DIEM", "ALLOWANCE"].includes(line.kind) ? "TRAVEL" : "TRANSPORT", kind: line.kind, label: line.concept,
    quantity: line.quantity, unit: line.basis, estimatedHours: null, trips: input.journeys.find((journey) => journey.journeyRef === line.journeyRef).trips,
    requiredQuantity: line.quantity, availableQuantity: null, reservedQuantity: null, shortageQuantity: null, availability: "NOT_APPLICABLE", priceStatus: line.unitCost === null ? "PENDING" : "REFERENCED",
    source: "ADMIN_RULE", sourceRef: line.zoneRuleRef, sourceVersion: line.zoneVersion,
    snapshot: { zoneType: line.zoneType, zoneCode: line.zoneCode, destinationZoneType: line.zoneType, ...(originZone ? { originZoneType: originZone.zoneType, originZoneCode: originZone.code } : {}), transport: { contract: TRANSPORT_CONTRACT, zoneRuleRef: line.zoneRuleRef, zoneVersion: line.zoneVersion, componentCode: line.componentCode, costRuleRef: line.costRuleRef, costRuleVersion: line.costRuleVersion, journeyRef: line.journeyRef, factor: line.factor } },
  }); });
}
async function prepareCalculation(tx, context, input, pipelineCase = null) {
  const scope = pipelineCase ?? await resolveCase(tx, context, input.caseRef);
  if (!scope.routeRevision) logisticsFail("TRANSPORT_ROUTE_REQUIRED", 409);
  const visit = await visitFor(tx, context, scope, input);
  const [rawFacts, zones, vehicles, rules] = await Promise.all([
    canonicalFacts(tx, context, scope, input, visit),
    // Rates are the current configuration at calculation time. Published
    // snapshots preserve their own tariff versions permanently.
    loadTransportZones(tx, context.tenantId, new Date()),
    selectedVehicles(tx, context, input),
    input.purpose === "VISIT" ? Promise.resolve([]) : currentOperationalRules(tx, context.tenantId, new Date(input.intervalStart)),
  ]);
  const facts = { ...rawFacts,
    assets: [...rawFacts.assets].sort((a, b) => a.modelRef.localeCompare(b.modelRef)),
    vehicles: [...rawFacts.vehicles].sort((a, b) => a.vehicleType.localeCompare(b.vehicleType)),
    externalOffers: [...rawFacts.externalOffers].sort((a, b) => a.offerRef.localeCompare(b.offerRef)),
  };
  const transport = calculateTransportResult(input, zones);
  for (const journey of input.journeys) {
    const vehicle = vehicles.find((row) => row.vehicleRef === journey.vehicleRef);
    if (vehicle && (vehicle.vehicleType !== journey.vehicleType || !vehicle.active || vehicle.operationalStatus !== "AVAILABLE" || vehicle.retiredAt || vehicle.effectiveFrom > input.intervalStart || vehicle.effectiveTo !== null && vehicle.effectiveTo < input.intervalEnd)) transport.issues.push({ code: "TRANSPORT_VEHICLE_UNAVAILABLE", message: "El vehículo elegido no está habilitado para este tipo y período; revise la flota o seleccione el perfil sin vehículo asignado.", journeyRef: journey.journeyRef, severity: "BLOCKER" });
  }
  const allDistances = input.journeys.every((journey) => journey.distanceKm !== null && journey.distanceSource);
  const operationalFacts = { ...facts, route: { ...facts.route, distanceStatus: allDistances ? "KNOWN" : "PENDING", distanceKm: allDistances ? input.journeys.reduce((sum, journey) => sum.plus(new Decimal(journey.distanceKm).mul(journey.returnToOrigin ? 2 : 1).mul(journey.trips)), new Decimal(0)).toNumber() : null } };
  const base = input.purpose === "VISIT" ? { items: [], issues: [], rules: [] } : calculateLogisticsPlan(operationalFacts, rules);
  const overlap = base.items.some((item) => ["TRANSPORT", "TRAVEL"].includes(item.family));
  if (overlap) transport.issues.push({ code: "TRANSPORT_LEGACY_RULE_CONFLICT", message: "Hay renglones generales de transporte o gastos de viaje que también aplican. Revise esas reglas antes de publicar para evitar cargos duplicados.", journeyRef: null, severity: "BLOCKER" });
  for (const issue of base.issues.filter((row) => row.severity === "BLOCKER")) transport.issues.push({ code: issue.code, message: issue.message, journeyRef: null, severity: "BLOCKER" });
  transport.complete = transport.complete && !transport.issues.some((row) => row.severity === "BLOCKER");
  const selectedZones = [...new Map(input.journeys.flatMap((journey) => [selectTransportZone(zones, journey, input.purpose).zone, journey.origin ? selectTransportZone(zones, { ...journey, destination: journey.origin }, input.purpose).zone : null]).filter(Boolean).map((zone) => [zone.ruleRef, zone])).values()].sort((a, b) => a.ruleRef.localeCompare(b.ruleRef));
  const { availabilityObservedAt, ...stableFacts } = operationalFacts;
  const transportContext = contextFor(input);
  const inputSnapshot = JSON.parse(JSON.stringify({ ...operationalFacts, transportContext, transportInput: input, transportVehicles: vehicles, transportVisit: visit ? { decisionRef: visit.decisionRef, version: visit.version, routeVersion: visit.routeVersion, serviceRevisionId: visit.serviceRevisionId, method: visit.method, commercialState: visit.commercialState } : null }));
  const zoneRefs = selectedZones.map((zone) => ({ ruleRef: zone.ruleRef, seriesRef: zone.seriesRef, family: "ZONE", code: zone.code, priority: zone.priority, specificity: zone.vehicleType === null ? 0 : 1, version: zone.version }));
  const rulesSnapshot = [...base.rules, ...zoneRefs];
  const resultSnapshot = JSON.parse(JSON.stringify({
    items: [...base.items, ...operationalTransportItems(transport, input, zones)].map((item, position) => ({ ...item, position })),
    issues: [...base.issues.filter((row) => row.severity !== "BLOCKER"), ...transport.issues.map((issue) => ({ code: issue.code, severity: issue.severity, family: "TRANSPORT", message: issue.message, source: "ADMIN_RULE", sourceSnapshot: { transportContext, journeyRef: issue.journeyRef } }))],
    rules: rulesSnapshot, transport,
  }));
  const inputHash = canonicalHash({ contract: TRANSPORT_CONTRACT, facts: stableFacts, input, vehicles, visit: inputSnapshot.transportVisit, zones: selectedZones, rules: rules.map((rule) => ({ ruleRef: rule.ruleRef, version: rule.version, conditionHash: rule.conditionHash, result: rule.result })), transport });
  return { scope, facts: operationalFacts, inputSnapshot, rulesSnapshot, resultSnapshot, inputHash, resultHash: canonicalHash(resultSnapshot), availabilityObservedAt };
}
async function replay(tx, context, input) {
  const row = await tx.logisticsMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
  if (!row) return null;
  if (row.operation !== input.operation || row.payloadHash !== input.payloadHash) logisticsFail("LOGISTICS_IDEMPOTENCY_CONFLICT", 409);
  return row.resultJson;
}
async function persist(tx, context, command, targetRef, result, entity) {
  await tx.logisticsMutationCommand.create({ data: { tenantId: context.tenantId, requestId: command.requestId, operation: command.operation, payloadHash: command.payloadHash, targetRef, resultJson: result, ...actorFields(context) } });
  await tx.commercialAuditLog.create({ data: { tenant_id: context.tenantId, actor_user_id: context.userId, actor_membership_id: context.membershipId, role_snapshot: context.role, action: command.operation, entity, entityId: targetRef, after_json: { contract: TRANSPORT_CONTRACT, targetRef, context: result.result?.context ?? result.context, inputHash: result.inputHash ?? null, resultHash: result.resultHash ?? null }, source: "V17_LOGISTICS_TRANSPORT", request_id: command.requestId, correlation_id: command.requestId, critical: true } });
  return result;
}
function mapPublication(row) {
  return { revisionRef: row.revisionRef, revision: row.revision, publishedAt: row.publishedAt.toISOString(), context: transportContextOf(row.inputSnapshot), calculationRef: row.calculation.calculationRef, result: row.resultSnapshot.transport, input: row.inputSnapshot.transportInput };
}
export async function calculateTransport(prisma, context, raw) {
  authorizeTransportContext(context, TRANSPORT_PLAN_PERMISSIONS.CALCULATE);
  const command = normalizeTransportCalculate(raw);
  const { operation: _operation, requestId: _request, payloadHash: _hash, ...input } = command;
  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, TRANSPORT_PLAN_PERMISSIONS.CALCULATE);
    const scope = await resolveCase(tx, actor, input.caseRef);
    const previous = await replay(tx, actor, command); if (previous) return previous;
    const prepared = await prepareCalculation(tx, actor, input, scope);
    const row = await tx.logisticsCalculation.create({ data: {
      tenantId: actor.tenantId, pipelineCaseId: scope.id, routeVersion: prepared.facts.route.version, serviceSelectionRef: prepared.facts.services.selectionRef, serviceRevision: prepared.facts.services.revision,
      surveyPublicationRef: prepared.facts.survey.publicationRef, surveyLogicalSha256: prepared.facts.survey.logicalSha256, materialRequirementRef: prepared.facts.materials.requirementRef, materialLogicalSha256: prepared.facts.materials.logicalSha256,
      intervalStart: new Date(input.intervalStart), intervalEnd: new Date(input.intervalEnd), availabilityObservedAt: new Date(prepared.availabilityObservedAt),
      inputSnapshot: prepared.inputSnapshot, rulesSnapshot: prepared.rulesSnapshot, resultSnapshot: prepared.resultSnapshot, inputHash: prepared.inputHash, resultHash: prepared.resultHash, status: prepared.resultSnapshot.transport.complete ? "VALID" : "CONFLICT", requestId: command.requestId, payloadHash: command.payloadHash, ...actorFields(actor),
    } });
    const result = { calculationRef: row.calculationRef, status: row.status, inputHash: row.inputHash, resultHash: row.resultHash, calculatedAt: row.createdAt.toISOString(), input, result: prepared.resultSnapshot.transport };
    return persist(tx, actor, command, row.calculationRef, result, "LogisticsCalculation");
  }, { retryUnique: true });
}

// Used by Costing before publishing. This checks actual current rules, route,
// selected vehicles and the same context; immutable quoted history stays intact.
export async function assertTransportRevisionCurrent(tx, context, revision) {
  if (!Object.hasOwn(revision.inputSnapshot ?? {}, "transportInput")) return;
  const input = normalizeTransportInput(revision.inputSnapshot.transportInput);
  if (canonicalHash(contextFor(input)) !== canonicalHash(transportContextOf(revision.inputSnapshot))) logisticsFail("TRANSPORT_CONTEXT_INVALID", 409);
  const prepared = await prepareCalculation(tx, context, input);
  const calculation = await tx.logisticsCalculation.findFirst({ where: { tenantId: context.tenantId, id: revision.calculationId }, select: { inputHash: true } });
  if (!calculation || !prepared.resultSnapshot.transport.complete || calculation.inputHash !== prepared.inputHash) logisticsFail("LOGISTICS_INPUT_STALE", 409);
}
export async function publishTransport(prisma, context, raw) {
  authorizeTransportContext(context, TRANSPORT_PLAN_PERMISSIONS.PUBLISH);
  const command = normalizeTransportPublish(raw);
  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, TRANSPORT_PLAN_PERMISSIONS.PUBLISH);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${command.calculationRef}:logistics-publish`}, 0))`);
    const calculation = await tx.logisticsCalculation.findFirst({ where: { tenantId: actor.tenantId, calculationRef: command.calculationRef }, include: { pipelineCase: { select: { publicRef: true } }, publishedRevision: true } });
    if (!calculation) logisticsFail("LOGISTICS_CALCULATION_NOT_FOUND", 404);
    const scope = await resolveCase(tx, actor, calculation.pipelineCase.publicRef);
    const prior = await replay(tx, actor, command); if (prior) return prior;
    if (calculation.publishedRevision) logisticsFail("LOGISTICS_CALCULATION_ALREADY_PUBLISHED", 409);
    if (!calculation.inputSnapshot?.transportInput || !calculation.resultSnapshot?.transport || !normalizeTransportContext(calculation.inputSnapshot.transportContext)) logisticsFail("TRANSPORT_CONTEXT_INVALID", 409);
    if (!calculation.resultSnapshot.transport.complete || calculation.status !== "VALID") logisticsFail("TRANSPORT_CALCULATION_INCOMPLETE", 409);
    const input = normalizeTransportInput(calculation.inputSnapshot.transportInput);
    if (input.caseRef !== scope.publicRef || canonicalHash(contextFor(input)) !== canonicalHash(calculation.inputSnapshot.transportContext)) logisticsFail("TRANSPORT_CONTEXT_INVALID", 409);
    const prepared = await prepareCalculation(tx, actor, input, scope);
    if (prepared.inputHash !== calculation.inputHash || !prepared.resultSnapshot.transport.complete || canonicalHash(calculation.resultSnapshot) !== calculation.resultHash) logisticsFail("LOGISTICS_INPUT_STALE", 409);
    const plan = await tx.logisticsPlan.upsert({ where: { tenantId_pipelineCaseId: { tenantId: actor.tenantId, pipelineCaseId: scope.id } }, update: {}, create: { tenantId: actor.tenantId, pipelineCaseId: scope.id } });
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${plan.id}:logistics-revision`}, 0))`);
    const latest = await tx.logisticsPlanRevision.findFirst({ where: { tenantId: actor.tenantId, planId: plan.id }, orderBy: { revision: "desc" }, select: { revision: true } });
    const row = await tx.logisticsPlanRevision.create({ data: {
      tenantId: actor.tenantId, planId: plan.id, calculationId: calculation.id, revision: (latest?.revision ?? 0) + 1,
      inputSnapshot: calculation.inputSnapshot, rulesSnapshot: calculation.rulesSnapshot, resultSnapshot: calculation.resultSnapshot,
      logicalSha256: canonicalHash({ input: calculation.inputSnapshot, rules: calculation.rulesSnapshot, result: calculation.resultSnapshot }), publishedByMembershipId: actor.membershipId, publishedByUserId: actor.userId,
      items: { create: calculation.resultSnapshot.items }, issues: { create: calculation.resultSnapshot.issues },
    }, include: { calculation: { select: { calculationRef: true } } } });
    return persist(tx, actor, command, row.revisionRef, mapPublication(row), "LogisticsPlanRevision");
  }, { retryUnique: true });
}
function exactQuery(query, keys) {
  if (!query || typeof query !== "object" || Array.isArray(query) || Object.keys(query).some((key) => !keys.includes(key)) || Object.values(query).some((value) => typeof value !== "string")) logisticsFail("TRANSPORT_QUERY_INVALID", 400);
}
export async function getTransportPublication(prisma, context, query = {}) {
  authorizeTransportContext(context, READ); exactQuery(query, ["caseRef", "purpose", "contextRef"]);
  const requested = normalizeTransportContext({ contract: TRANSPORT_CONTRACT, purpose: query.purpose, contextRef: query.contextRef ?? null });
  if (!requested) logisticsFail("TRANSPORT_CONTEXT_INVALID", 400);
  transportRef(query.caseRef);
  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, READ);
    const scope = await resolveCase(tx, actor, query.caseRef);
    const row = await latestLogisticsRevision(tx, { where: { tenantId: actor.tenantId, plan: { pipelineCaseId: scope.id } }, context: requested, include: { calculation: { select: { calculationRef: true } } } });
    if (!row || !row.inputSnapshot?.transportInput || !row.resultSnapshot?.transport) return null;
    return mapPublication(row);
  });
}
export async function getTransportWorkspace(prisma, context, query = {}) {
  authorizeTransportContext(context, READ); exactQuery(query, ["caseRef", "search"]);
  if (query.caseRef !== undefined) transportRef(query.caseRef);
  if (query.search !== undefined && (query.search.length > 120 || query.search !== query.search.trim())) logisticsFail("TRANSPORT_QUERY_INVALID", 400);
  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, READ);
    const scopedCase = query.caseRef ? await resolveCase(tx, actor, query.caseRef) : null;
    const [cases, vehicles, decision] = await Promise.all([
      tx.pipelineCase.findMany({ where: { tenantId: actor.tenantId, ...caseScope(actor), ...(query.search ? { OR: [{ caseCode: { contains: query.search, mode: "insensitive" } }, { clientName: { contains: query.search, mode: "insensitive" } }] } : {}) }, select: { publicRef: true, caseCode: true, mode: true }, orderBy: [{ updatedAt: "desc" }, { publicRef: "asc" }], take: 50 }),
      tx.vehicle.findMany({ where: { tenant_id: actor.tenantId, operational_status: "AVAILABLE", available_for_calculation: true, retired_at: null }, select: { id: true, business_code: true, vehicle_type: true }, orderBy: { normalized_code: "asc" }, take: 500 }),
      scopedCase ? tx.surveyEvaluationDecision.findFirst({ where: { tenantId: actor.tenantId, pipelineCaseId: scopedCase.id }, orderBy: { version: "desc" }, select: { decisionRef: true, version: true, method: true, commercialState: true, routeVersion: true } }) : Promise.resolve(null),
    ]);
    if (scopedCase && !cases.some((row) => row.publicRef === scopedCase.publicRef)) cases.unshift({ publicRef: scopedCase.publicRef, caseCode: scopedCase.caseCode, mode: scopedCase.mode });
    return { cases: cases.map((row) => ({ caseRef: row.publicRef, label: row.caseCode, mode: row.mode })), vehicles: vehicles.map((row) => ({ vehicleRef: row.id, businessCode: row.business_code, vehicleType: row.vehicle_type })), visits: decision && decision.method === "IN_PERSON" && !["CANCELLED", "NOT_REQUIRED"].includes(decision.commercialState) && decision.routeVersion === scopedCase.routeRevision ? [{ contextRef: decision.decisionRef, label: `Visita presencial · decisión ${decision.version}` }] : [] };
  });
}
