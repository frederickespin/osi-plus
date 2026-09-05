import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  CostingError,
  calculateCostingSnapshot,
  canonicalCostingJson,
  costingFail,
  costingHash,
  normalizeCostingAuthorization,
  normalizeCostingCalculate,
  normalizeCostingExchangeRate,
  normalizeCostingIssueResolution,
  normalizeCostingOverride,
  normalizeCostingPublish,
  normalizeCostingRule,
} from "./costingContract.js";

export const COSTING_PERMISSIONS = Object.freeze({
  VIEW: "costing:view",
  CALCULATE: "costing:calculate",
  PUBLISH: "costing:publish",
  TENANT: "costing:tenant",
  OVERRIDE: "costing:override",
  AUTHORIZE_MARGIN: "costing:authorize-margin",
  RESOLVE: "costing:resolve",
  RULES_VIEW: "costing:rules:view",
  RULES_MANAGE: "costing:rules:manage",
});

function requirePermission(context, permission) {
  if (!context?.tenantId || !context?.membershipId || !context?.userId || !context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission)) costingFail("COSTING_FORBIDDEN", 403);
}

function actor(context) {
  return { actorMembershipId: context.membershipId, actorUserId: context.userId };
}

function audit(context, action, entity, entityId, requestId, after) {
  return { tenant_id: context.tenantId, actor_user_id: context.userId, actor_membership_id: context.membershipId, role_snapshot: context.role, action, entity, entityId: String(entityId), after_json: after, source: "V17_COSTING", request_id: requestId, correlation_id: requestId, critical: true };
}

async function serializable(prisma, work, timeout = 5_000) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout });
    } catch (error) {
      if (error?.code !== "P2034" || attempt === 3) throw error;
    }
  }
  costingFail("COSTING_CONCURRENCY_CONFLICT", 409);
}

function caseScope(context) {
  const tenantWide = context.effectivePermissions?.includes(COSTING_PERMISSIONS.TENANT) && !context.deniedPermissions?.includes(COSTING_PERMISSIONS.TENANT);
  return tenantWide ? {} : { ownerMembershipId: context.membershipId, ownerUserId: context.userId };
}

async function resolveCase(tx, context, caseRef) {
  const row = await tx.pipelineCase.findFirst({
    where: { tenantId: context.tenantId, publicRef: caseRef, ...caseScope(context) },
    select: { id: true, publicRef: true, caseCode: true },
  });
  if (!row) costingFail("COSTING_NOT_FOUND", 404);
  return row;
}

function ruleMatchesItem(rule, item, logisticsInput) {
  const conditions = rule.conditions || {};
  const serviceCodes = logisticsInput?.services?.codes || [];
  if (conditions.logisticsFamilies && !conditions.logisticsFamilies.includes(item.family)) return false;
  if (conditions.logisticsKinds && !conditions.logisticsKinds.includes(item.kind)) return false;
  if (conditions.logisticsSources && !conditions.logisticsSources.includes(item.source)) return false;
  if (conditions.serviceCodes && !conditions.serviceCodes.every((code) => serviceCodes.includes(code))) return false;
  if (conditions.modes && !conditions.modes.includes(logisticsInput?.mode)) return false;
  return !conditions.compensationBasis;
}

async function currentRules(tx, tenantId, at = new Date()) {
  return tx.costingRule.findMany({
    where: { tenantId, state: "ACTIVE", AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: at } }] }, { OR: [{ validTo: null }, { validTo: { gt: at } }] }] },
    orderBy: [{ priority: "desc" }, { specificity: "desc" }, { version: "desc" }, { ruleRef: "asc" }],
  });
}

async function currentRates(tx, tenantId, currencies, baseCurrency, at = new Date()) {
  const needed = [...new Set(currencies.filter((currency) => currency && currency !== baseCurrency))];
  if (!needed.length) return [];
  return tx.costingExchangeRate.findMany({
    where: {
      tenantId,
      state: "ACTIVE",
      effectiveAt: { lte: at },
      OR: [
        { baseCurrency: { in: needed }, quoteCurrency: baseCurrency },
        { baseCurrency, quoteCurrency: { in: needed } },
      ],
      AND: [{ OR: [{ validTo: null }, { validTo: { gt: at } }] }],
    },
    orderBy: [{ effectiveAt: "desc" }, { version: "desc" }],
  });
}

function ruleAuthority(rule, item) {
  if (!rule || rule.unitCost == null) return null;
  return {
    logisticsItemRef: item.itemRef,
    family: rule.family,
    classification: rule.classification,
    source: rule.source,
    sourceRef: rule.ruleRef,
    sourceVersion: rule.version,
    unitCost: String(rule.unitCost),
    currency: rule.currency,
    unit: rule.result?.unit || item.unit || "UNIT",
    minimumMarginBps: rule.minimumMarginBps,
    recommendedMarginBps: rule.recommendedMarginBps,
    authoritySnapshot: { kind: "COSTING_RULE", ruleRef: rule.ruleRef, seriesRef: rule.seriesRef, code: rule.code, version: rule.version },
    logicalSha256: costingHash({ ruleRef: rule.ruleRef, version: rule.version, conditionHash: rule.conditionHash, unitCost: String(rule.unitCost), currency: rule.currency, margins: [rule.minimumMarginBps, rule.recommendedMarginBps] }),
  };
}

async function resolveMaterialAuthority(tx, context, item, rule) {
  if (item.source !== "INVENTORY" || !item.sourceRef) return null;
  const material = await tx.materialCatalogItem.findFirst({
    where: { tenantId: context.tenantId, materialRef: item.sourceRef },
    select: { materialRef: true, costs: { where: { validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }, orderBy: [{ version: "desc" }], take: 1, select: { costVersionRef: true, amount: true, currency: true, version: true, source: true } } },
  });
  const cost = material?.costs[0];
  if (!material || !cost) return null;
  return { logisticsItemRef: item.itemRef, family: "MATERIAL", classification: rule?.classification || "PR", source: "MATERIAL_COST", sourceRef: cost.costVersionRef, sourceVersion: cost.version, unitCost: String(cost.amount), currency: cost.currency, unit: item.unit || "UNIT", minimumMarginBps: rule?.minimumMarginBps ?? null, recommendedMarginBps: rule?.recommendedMarginBps ?? null, authoritySnapshot: { kind: "MATERIAL_COST_VERSION", materialRef: material.materialRef, requirementRef: item.snapshot?.requirementRef || null, costVersionRef: cost.costVersionRef, version: cost.version, source: cost.source }, logicalSha256: costingHash({ materialRef: material.materialRef, costVersionRef: cost.costVersionRef, version: cost.version, amount: String(cost.amount), currency: cost.currency, source: cost.source }) };
}

async function resolveAssetAuthority(tx, context, item, rule) {
  if (item.source !== "ASSET" || !item.sourceRef) return null;
  const model = await tx.assetModel.findFirst({
    where: { tenantId: context.tenantId, modelRef: item.sourceRef },
    select: { modelRef: true, costVersions: { where: { costType: "INTERNAL_RATE", validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }, orderBy: [{ version: "desc" }], take: 1, select: { costRef: true, amount: true, currency: true, temporalUnit: true, version: true, source: true } } },
  });
  const cost = model?.costVersions[0];
  if (!model || !cost) return null;
  return { logisticsItemRef: item.itemRef, family: "ASSET", classification: rule?.classification || "PR", source: "ASSET_COST", sourceRef: cost.costRef, sourceVersion: cost.version, unitCost: String(cost.amount), currency: cost.currency, unit: cost.temporalUnit || item.unit || "UNIT", minimumMarginBps: rule?.minimumMarginBps ?? null, recommendedMarginBps: rule?.recommendedMarginBps ?? null, authoritySnapshot: { kind: "ASSET_COST_VERSION", modelRef: model.modelRef, costRef: cost.costRef, version: cost.version, source: cost.source }, logicalSha256: costingHash({ modelRef: model.modelRef, costRef: cost.costRef, version: cost.version, amount: String(cost.amount), currency: cost.currency, source: cost.source }) };
}

async function resolveProviderAuthority(tx, context, item, rule) {
  if (item.source !== "PROVIDER" || !item.sourceRef) return null;
  const offer = await tx.externalResourceOffer.findFirst({ where: { tenantId: context.tenantId, offerRef: item.sourceRef, status: "ACTIVE" }, select: { offerRef: true, rateAmount: true, currency: true, temporalUnit: true, contractualReference: true, version: true, validFrom: true, validTo: true } });
  if (!offer || offer.rateAmount == null || !offer.currency || !offer.contractualReference) return null;
  return { logisticsItemRef: item.itemRef, family: rule?.family || "THIRD_PARTY", classification: rule?.classification || "EX", source: "PROVIDER", sourceRef: offer.offerRef, sourceVersion: offer.version, unitCost: String(offer.rateAmount), currency: offer.currency, unit: offer.temporalUnit || item.unit || "UNIT", minimumMarginBps: null, recommendedMarginBps: null, authoritySnapshot: { kind: "EXTERNAL_RESOURCE_OFFER", offerRef: offer.offerRef, version: offer.version, contractualReferencePresent: true, validFrom: offer.validFrom?.toISOString() || null, validTo: offer.validTo?.toISOString() || null }, logicalSha256: costingHash({ offerRef: offer.offerRef, version: offer.version, rateAmount: String(offer.rateAmount), currency: offer.currency, contractualReferencePresent: true, validFrom: offer.validFrom?.toISOString() || null, validTo: offer.validTo?.toISOString() || null }) };
}

async function loadCalculationInput(tx, context, caseRef, logisticsRevisionRef, baseCurrency) {
  const pipelineCase = await resolveCase(tx, context, caseRef);
  const logisticsRevision = await tx.logisticsPlanRevision.findFirst({
    where: { tenantId: context.tenantId, revisionRef: logisticsRevisionRef, status: "PUBLISHED", plan: { pipelineCaseId: pipelineCase.id } },
    include: { items: { orderBy: { position: "asc" } }, issues: true, plan: { select: { id: true, planRef: true } } },
  });
  if (!logisticsRevision) costingFail("COSTING_LOGISTICS_REVISION_NOT_FOUND", 404);
  const rules = await currentRules(tx, context.tenantId);
  const authorities = [];
  for (const item of logisticsRevision.items) {
    const matching = rules.filter((rule) => ruleMatchesItem(rule, item, logisticsRevision.inputSnapshot));
    if (matching.length > 1 && matching[0].priority === matching[1].priority && matching[0].specificity === matching[1].specificity) costingFail("COSTING_RULE_CONFLICT", 409);
    const rule = matching[0] || null;
    const authority = await resolveMaterialAuthority(tx, context, item, rule)
      || await resolveAssetAuthority(tx, context, item, rule)
      || await resolveProviderAuthority(tx, context, item, rule)
      || ruleAuthority(rule, item);
    if (authority) authorities.push(authority);
  }
  const rates = await currentRates(tx, context.tenantId, authorities.map((row) => row.currency), baseCurrency);
  const compensationRules = rules.filter((rule) => rule.family === "CURRENCY_COMPENSATION" && rule.conditions?.compensationBasis).map((rule) => ({ ruleRef: rule.ruleRef, version: rule.version, name: rule.name, basisPoints: Number(rule.result?.basisPoints || 0), appliesTo: rule.conditions.compensationBasis, classification: rule.classification, minimumMarginBps: rule.minimumMarginBps, recommendedMarginBps: rule.recommendedMarginBps }));
  const logistics = {
    revisionRef: logisticsRevision.revisionRef,
    planRef: logisticsRevision.plan.planRef,
    revision: logisticsRevision.revision,
    status: logisticsRevision.status,
    logicalSha256: logisticsRevision.logicalSha256,
    serviceSelectionRef: logisticsRevision.inputSnapshot?.services?.selectionRef || null,
    serviceRevision: logisticsRevision.inputSnapshot?.services?.revision || null,
    routeRevision: logisticsRevision.inputSnapshot?.route?.version || null,
    surveyPublicationRef: logisticsRevision.inputSnapshot?.survey?.publicationRef || null,
    materialRequirementRef: logisticsRevision.inputSnapshot?.materials?.requirementRef || null,
    items: logisticsRevision.items.map(({ itemRef, family, kind, label, quantity, unit, requiredQuantity, priceStatus, source, sourceRef, sourceVersion, snapshot, position }) => ({ itemRef, family, kind, label, quantity: quantity == null ? null : String(quantity), unit, requiredQuantity: requiredQuantity == null ? null : String(requiredQuantity), priceStatus, source, sourceRef, sourceVersion, snapshot, position })),
    issues: logisticsRevision.issues.map(({ issueRef, code, severity, family, status }) => ({ issueRef, code, severity, family, status })),
  };
  const result = calculateCostingSnapshot({ baseCurrency, logisticsRevision: logistics, authorities, rates, compensationRules });
  const snapshots = {
    input: { caseRef: pipelineCase.publicRef, logistics, authorities: authorities.map((row) => ({ ...row })) },
    rules: rules.map((rule) => ({ ruleRef: rule.ruleRef, seriesRef: rule.seriesRef, family: rule.family, version: rule.version, conditionHash: rule.conditionHash, unitCost: rule.unitCost == null ? null : String(rule.unitCost), currency: rule.currency, minimumMarginBps: rule.minimumMarginBps, recommendedMarginBps: rule.recommendedMarginBps, resultHash: costingHash(rule.result) })),
    rates: rates.map((rate) => ({ rateRef: rate.rateRef, seriesRef: rate.seriesRef, baseCurrency: rate.baseCurrency, quoteCurrency: rate.quoteCurrency, rate: String(rate.rate), source: rate.source, version: rate.version, effectiveAt: rate.effectiveAt.toISOString(), logicalSha256: rate.logicalSha256 })),
  };
  return { pipelineCase, logisticsRevision, result, snapshots, inputHash: costingHash(snapshots) };
}

async function replay(tx, context, input) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.requestId}:costing-command`}, 0))`);
  const row = await tx.costingMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
  if (!row) return null;
  if (row.operation !== input.operation || row.payloadHash !== input.payloadHash) costingFail("COSTING_IDEMPOTENCY_CONFLICT", 409);
  return Object.freeze(row.resultJson);
}

async function persist(tx, context, input, targetRef, result, action, entity) {
  await tx.costingMutationCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef: String(targetRef), resultJson: result, ...actor(context) } });
  await tx.commercialAuditLog.create({ data: audit(context, action, entity, targetRef, input.requestId, result) });
  return Object.freeze(result);
}

export async function calculateCosting(prisma, context, raw) {
  requirePermission(context, COSTING_PERMISSIONS.CALCULATE);
  const input = normalizeCostingCalculate(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const loaded = await loadCalculationInput(tx, context, input.caseRef, input.logisticsPlanRevisionRef, input.baseCurrency);
    const row = await tx.costingCalculation.create({ data: { tenantId: context.tenantId, pipelineCaseId: loaded.pipelineCase.id, logisticsRevisionId: loaded.logisticsRevision.id, baseCurrency: input.baseCurrency, inputSnapshot: loaded.snapshots.input, rulesSnapshot: loaded.snapshots.rules, ratesSnapshot: loaded.snapshots.rates, resultSnapshot: loaded.result, inputHash: loaded.inputHash, resultHash: costingHash(loaded.result), requestId: input.requestId, payloadHash: input.payloadHash, ...actor(context) } });
    const result = { calculationRef: row.calculationRef, status: row.status, baseCurrency: row.baseCurrency, inputHash: row.inputHash, resultHash: row.resultHash, result: loaded.result };
    return persist(tx, context, input, row.calculationRef, result, "COSTING_CALCULATE", "CostingCalculation");
  }, 30_000);
}

function lineCreate(line) {
  return { logisticsItemRef: line.logisticsItemRef, family: line.family, concept: line.concept, classification: line.classification, source: line.source, sourceRef: line.sourceRef, sourceVersion: line.sourceVersion, quantity: line.quantity, unit: line.unit, originalCurrency: line.originalCurrency, originalUnitCost: line.originalUnitCost, exchangeRateRef: line.exchangeRateRef, exchangeRateVersion: line.exchangeRateVersion, exchangeRate: line.exchangeRate, baseCurrency: line.baseCurrency, baseUnitCost: line.baseUnitCost, totalCost: line.totalCost, minimumMarginBps: line.minimumMarginBps, recommendedMarginBps: line.recommendedMarginBps, suggestedPrice: line.suggestedPrice, priceStatus: line.priceStatus, snapshot: { ...line.snapshot, exchangeRateSource: line.exchangeRateSource }, position: line.position };
}

function issueCreate(row) {
  return { code: row.code, severity: row.severity, family: row.family, message: row.message, source: row.source, sourceSnapshot: row.sourceSnapshot, status: row.status, version: row.version };
}

export async function publishCosting(prisma, context, raw) {
  requirePermission(context, COSTING_PERMISSIONS.PUBLISH);
  const input = normalizeCostingPublish(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.calculationRef}:costing-publish`}, 0))`);
    const calculation = await tx.costingCalculation.findFirst({ where: { tenantId: context.tenantId, calculationRef: input.calculationRef }, include: { pipelineCase: { select: { publicRef: true } }, logisticsRevision: { select: { revisionRef: true, planId: true } }, publishedRevision: true } });
    if (!calculation) costingFail("COSTING_CALCULATION_NOT_FOUND", 404);
    if (calculation.publishedRevision) costingFail("COSTING_CALCULATION_ALREADY_PUBLISHED", 409);
    await resolveCase(tx, context, calculation.pipelineCase.publicRef);
    const latestLogistics = await tx.logisticsPlanRevision.findFirst({ where: { tenantId: context.tenantId, planId: calculation.logisticsRevision.planId, status: "PUBLISHED" }, orderBy: { revision: "desc" }, select: { revisionRef: true } });
    const loaded = await loadCalculationInput(tx, context, calculation.pipelineCase.publicRef, calculation.logisticsRevision.revisionRef, calculation.baseCurrency);
    if ((latestLogistics && latestLogistics.revisionRef !== calculation.logisticsRevision.revisionRef) || loaded.inputHash !== calculation.inputHash) costingFail("COSTING_INPUT_STALE", 409);
    const blockers = (calculation.resultSnapshot?.issues || []).filter((row) => row.severity === "BLOCKER" && row.status === "OPEN");
    if (blockers.length) costingFail("COSTING_BLOCKERS_PRESENT", 409);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${calculation.pipelineCaseId}:costing-revision`}, 0))`);
    const latest = await tx.costingRevision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: calculation.pipelineCaseId }, orderBy: { revision: "desc" }, select: { revision: true } });
    const revision = (latest?.revision || 0) + 1;
    const row = await tx.costingRevision.create({ data: { tenantId: context.tenantId, pipelineCaseId: calculation.pipelineCaseId, logisticsRevisionId: calculation.logisticsRevisionId, calculationId: calculation.id, revision, baseCurrency: calculation.baseCurrency, inputSnapshot: calculation.inputSnapshot, rulesSnapshot: calculation.rulesSnapshot, ratesSnapshot: calculation.ratesSnapshot, totalsSnapshot: calculation.resultSnapshot.totals, logicalSha256: costingHash({ input: calculation.inputSnapshot, rules: calculation.rulesSnapshot, rates: calculation.ratesSnapshot, result: calculation.resultSnapshot }), publishedByMembershipId: context.membershipId, publishedByUserId: context.userId, lines: { create: calculation.resultSnapshot.lines.map(lineCreate) }, issues: { create: calculation.resultSnapshot.issues.map(issueCreate) } }, include: { lines: { orderBy: { position: "asc" } }, issues: true, overrides: { include: { authorizations: true } } } });
    const result = mapRevision(row);
    return persist(tx, context, input, row.revisionRef, result, revision === 1 ? "COSTING_PUBLISH" : "COSTING_RECALCULATE_PUBLISH", "CostingRevision");
  }, 30_000);
}

function mapRevision(row) {
  return {
    revisionRef: row.revisionRef,
    revision: row.revision,
    status: row.status,
    baseCurrency: row.baseCurrency,
    logicalSha256: row.logicalSha256,
    publishedAt: row.publishedAt.toISOString(),
    totals: row.totalsSnapshot,
    lines: row.lines.map(({ lineRef, logisticsItemRef, family, concept, classification, source, sourceRef, sourceVersion, quantity, unit, originalCurrency, originalUnitCost, exchangeRateRef, exchangeRateVersion, exchangeRate, baseCurrency, baseUnitCost, totalCost, minimumMarginBps, recommendedMarginBps, suggestedPrice, priceStatus, snapshot, position }) => ({ lineRef, logisticsItemRef, family, concept, classification, source, sourceRef, sourceVersion, quantity: String(quantity), unit, originalCurrency, originalUnitCost: String(originalUnitCost), exchangeRateRef, exchangeRateVersion, exchangeRate: String(exchangeRate), baseCurrency, baseUnitCost: String(baseUnitCost), totalCost: String(totalCost), minimumMarginBps, recommendedMarginBps, suggestedPrice: suggestedPrice == null ? null : String(suggestedPrice), priceStatus, snapshot, position })),
    issues: row.issues.map(({ issueRef, code, severity, family, message, source, sourceSnapshot, status, resolvedReason, resolvedAt, version }) => ({ issueRef, code, severity, family, message, source, sourceSnapshot, status, resolvedReason, resolvedAt: resolvedAt?.toISOString() || null, version })),
    overrides: (row.overrides || []).map(({ overrideRef, lineId, kind, suggestedValue, finalValue, reason, status, createdAt, authorizations }) => ({ overrideRef, lineRef: row.lines.find((line) => line.id === lineId)?.lineRef || null, kind, suggestedValue, finalValue, reason, status, createdAt: createdAt.toISOString(), authorization: authorizations[0] ? { authorizationRef: authorizations[0].authorizationRef, decision: authorizations[0].decision, reason: authorizations[0].reason, createdAt: authorizations[0].createdAt.toISOString() } : null })),
  };
}

export async function getCosting(prisma, context, caseRef) {
  requirePermission(context, COSTING_PERMISSIONS.VIEW);
  const pipelineCase = await resolveCase(prisma, context, caseRef);
  const row = await prisma.costingRevision.findFirst({ where: { tenantId: context.tenantId, pipelineCaseId: pipelineCase.id }, orderBy: { revision: "desc" }, include: { lines: { orderBy: { position: "asc" } }, issues: true, overrides: { include: { authorizations: true } } } });
  return row ? mapRevision(row) : null;
}

export async function listCostingRules(prisma, context, query = {}) {
  requirePermission(context, COSTING_PERMISSIONS.RULES_VIEW);
  const rows = await prisma.costingRule.findMany({ where: { tenantId: context.tenantId, ...(query.family ? { family: String(query.family) } : {}), ...(query.state ? { state: String(query.state) } : {}) }, orderBy: [{ family: "asc" }, { priority: "desc" }, { specificity: "desc" }, { version: "desc" }] });
  return rows.map(({ ruleRef, seriesRef, family, code, name, classification, source, priority, specificity, conditions, unitCost, currency, minimumMarginBps, recommendedMarginBps, result, state, version, validFrom, validTo }) => ({ ruleRef, seriesRef, family, code, name, classification, source, priority, specificity, conditions, unitCost: unitCost == null ? null : String(unitCost), currency, minimumMarginBps, recommendedMarginBps, result, state, version, validFrom: validFrom?.toISOString() || null, validTo: validTo?.toISOString() || null }));
}

export async function versionCostingRule(prisma, context, raw) {
  requirePermission(context, COSTING_PERMISSIONS.RULES_MANAGE);
  const input = normalizeCostingRule(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const seriesRef = input.seriesRef || randomUUID();
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${seriesRef}:costing-rule`}, 0))`);
    const current = await tx.costingRule.findFirst({ where: { tenantId: context.tenantId, seriesRef }, orderBy: { version: "desc" } });
    if (current) await tx.costingRule.update({ where: { id: current.id }, data: { state: "SUPERSEDED", validTo: input.validFrom ? new Date(input.validFrom) : new Date() } });
    const row = await tx.costingRule.create({ data: { tenantId: context.tenantId, seriesRef, family: input.family, code: input.code, name: input.name, classification: input.classification, source: input.source, priority: input.priority, specificity: input.specificity, conditions: input.conditions, conditionHash: costingHash(input.conditions), unitCost: input.unitCost, currency: input.currency, minimumMarginBps: input.minimumMarginBps, recommendedMarginBps: input.recommendedMarginBps, result: input.result, state: input.state, version: (current?.version || 0) + 1, validFrom: input.validFrom ? new Date(input.validFrom) : null, validTo: input.validTo ? new Date(input.validTo) : null, replacesRuleId: current?.id, requestId: input.requestId, payloadHash: input.payloadHash, ...actor(context) } });
    const result = { ruleRef: row.ruleRef, seriesRef: row.seriesRef, family: row.family, classification: row.classification, state: row.state, version: row.version, conditionHash: row.conditionHash };
    return persist(tx, context, input, row.ruleRef, result, current ? "COSTING_RULE_VERSION" : "COSTING_RULE_CREATE", "CostingRule");
  });
}

export async function listCostingExchangeRates(prisma, context) {
  requirePermission(context, COSTING_PERMISSIONS.RULES_VIEW);
  const rows = await prisma.costingExchangeRate.findMany({ where: { tenantId: context.tenantId }, orderBy: [{ baseCurrency: "asc" }, { quoteCurrency: "asc" }, { effectiveAt: "desc" }] });
  return rows.map(({ rateRef, seriesRef, baseCurrency, quoteCurrency, rate, source, state, version, effectiveAt, validTo, logicalSha256 }) => ({ rateRef, seriesRef, baseCurrency, quoteCurrency, rate: String(rate), source, state, version, effectiveAt: effectiveAt.toISOString(), validTo: validTo?.toISOString() || null, logicalSha256 }));
}

export async function versionCostingExchangeRate(prisma, context, raw) {
  requirePermission(context, COSTING_PERMISSIONS.RULES_MANAGE);
  const input = normalizeCostingExchangeRate(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const seriesRef = input.seriesRef || randomUUID();
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${seriesRef}:costing-rate`}, 0))`);
    const current = await tx.costingExchangeRate.findFirst({ where: { tenantId: context.tenantId, seriesRef }, orderBy: { version: "desc" } });
    if (current) await tx.costingExchangeRate.update({ where: { id: current.id }, data: { state: "SUPERSEDED", validTo: new Date(input.effectiveAt) } });
    const logicalSha256 = costingHash({ seriesRef, baseCurrency: input.baseCurrency, quoteCurrency: input.quoteCurrency, rate: input.rate, source: input.source, version: (current?.version || 0) + 1, effectiveAt: input.effectiveAt, validTo: input.validTo });
    const row = await tx.costingExchangeRate.create({ data: { tenantId: context.tenantId, seriesRef, baseCurrency: input.baseCurrency, quoteCurrency: input.quoteCurrency, rate: input.rate, source: input.source, state: input.state, version: (current?.version || 0) + 1, effectiveAt: new Date(input.effectiveAt), validTo: input.validTo ? new Date(input.validTo) : null, replacesRateId: current?.id, logicalSha256, requestId: input.requestId, payloadHash: input.payloadHash, ...actor(context) } });
    const result = { rateRef: row.rateRef, seriesRef: row.seriesRef, baseCurrency: row.baseCurrency, quoteCurrency: row.quoteCurrency, rate: String(row.rate), source: row.source, state: row.state, version: row.version, effectiveAt: row.effectiveAt.toISOString(), logicalSha256 };
    return persist(tx, context, input, row.rateRef, result, current ? "COSTING_EXCHANGE_RATE_VERSION" : "COSTING_EXCHANGE_RATE_CREATE", "CostingExchangeRate");
  });
}

export async function createCostingOverride(prisma, context, raw) {
  requirePermission(context, COSTING_PERMISSIONS.OVERRIDE);
  const input = normalizeCostingOverride(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const revision = await tx.costingRevision.findFirst({ where: { tenantId: context.tenantId, revisionRef: input.revisionRef }, include: { pipelineCase: { select: { publicRef: true } }, lines: input.lineRef ? { where: { lineRef: input.lineRef } } : true } });
    if (!revision || (input.lineRef && revision.lines.length !== 1)) costingFail("COSTING_NOT_FOUND", 404);
    await resolveCase(tx, context, revision.pipelineCase.publicRef);
    const line = input.lineRef ? revision.lines[0] : null;
    const suggested = line ? { totalCost: String(line.totalCost), suggestedPrice: line.suggestedPrice == null ? null : String(line.suggestedPrice), classification: line.classification, minimumMarginBps: line.minimumMarginBps, recommendedMarginBps: line.recommendedMarginBps } : { totals: revision.totalsSnapshot };
    if (canonicalCostingJson(suggested) !== canonicalCostingJson(input.expectedSuggested)) costingFail("COSTING_OVERRIDE_CONFLICT", 409);
    let status = "APPLIED";
    if (input.kind === "SUGGESTED_PRICE" && line?.classification === "PR" && line.minimumMarginBps != null) {
      const amount = Number(input.finalValue.amount);
      const cost = Number(line.totalCost);
      const actualMarginBps = amount > 0 ? Math.round(((amount - cost) / amount) * 10000) : -1;
      if (!Number.isFinite(amount) || amount < 0) costingFail("COSTING_OVERRIDE_VALUE_INVALID");
      if (actualMarginBps < line.minimumMarginBps) status = "AUTHORIZATION_REQUIRED";
    }
    const row = await tx.costingOverride.create({ data: { tenantId: context.tenantId, revisionId: revision.id, lineId: line?.id || null, kind: input.kind, suggestedValue: suggested, finalValue: input.finalValue, reason: input.reason, status, ...actor(context) } });
    const result = { overrideRef: row.overrideRef, revisionRef: revision.revisionRef, lineRef: line?.lineRef || null, kind: row.kind, suggestedValue: row.suggestedValue, finalValue: row.finalValue, reason: row.reason, status: row.status };
    return persist(tx, context, input, row.overrideRef, result, status === "AUTHORIZATION_REQUIRED" ? "COSTING_MARGIN_AUTHORIZATION_REQUIRED" : "COSTING_OVERRIDE", "CostingOverride");
  });
}

export async function authorizeCostingMargin(prisma, context, raw) {
  requirePermission(context, COSTING_PERMISSIONS.AUTHORIZE_MARGIN);
  const input = normalizeCostingAuthorization(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.overrideRef}:costing-authorization`}, 0))`);
    const override = await tx.costingOverride.findFirst({ where: { tenantId: context.tenantId, overrideRef: input.overrideRef }, include: { revision: { include: { pipelineCase: { select: { publicRef: true } } } }, authorizations: true } });
    if (!override) costingFail("COSTING_NOT_FOUND", 404);
    await resolveCase(tx, context, override.revision.pipelineCase.publicRef);
    if (override.status !== "AUTHORIZATION_REQUIRED" || override.authorizations.length) costingFail("COSTING_AUTHORIZATION_CONFLICT", 409);
    const row = await tx.costingMarginAuthorization.create({ data: { tenantId: context.tenantId, overrideId: override.id, decision: input.decision, reason: input.reason, ...actor(context) } });
    const status = input.decision === "AUTHORIZED" ? "AUTHORIZED" : "REJECTED";
    const result = { authorizationRef: row.authorizationRef, overrideRef: override.overrideRef, decision: row.decision, reason: row.reason, status };
    return persist(tx, context, input, row.authorizationRef, result, "COSTING_MARGIN_AUTHORIZATION", "CostingMarginAuthorization");
  });
}

export async function resolveCostingIssue(prisma, context, raw) {
  requirePermission(context, COSTING_PERMISSIONS.RESOLVE);
  const input = normalizeCostingIssueResolution(raw);
  return serializable(prisma, async (tx) => {
    const prior = await replay(tx, context, input);
    if (prior) return prior;
    const revision = await tx.costingRevision.findFirst({ where: { tenantId: context.tenantId, revisionRef: input.revisionRef }, include: { pipelineCase: { select: { publicRef: true } } } });
    if (!revision) costingFail("COSTING_NOT_FOUND", 404);
    await resolveCase(tx, context, revision.pipelineCase.publicRef);
    const changed = await tx.costingIssue.updateMany({ where: { tenantId: context.tenantId, revisionId: revision.id, issueRef: input.issueRef, status: "OPEN", version: input.expectedVersion }, data: { status: "RESOLVED", resolvedReason: input.reason, resolvedByMembershipId: context.membershipId, resolvedByUserId: context.userId, resolvedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) costingFail("COSTING_ISSUE_CONFLICT", 409);
    const row = await tx.costingIssue.findFirst({ where: { tenantId: context.tenantId, issueRef: input.issueRef } });
    const result = { issueRef: row.issueRef, status: row.status, version: row.version, resolvedAt: row.resolvedAt.toISOString() };
    return persist(tx, context, input, row.issueRef, result, "COSTING_ISSUE_RESOLVE", "CostingIssue");
  });
}

export function mapCostingDatabaseError(error) {
  if (error instanceof CostingError) return error;
  const message = String(error?.message || "");
  if (message.includes("costing_rules_no_equal_conflict")) return new CostingError("COSTING_RULE_CONFLICT", 409);
  if (message.includes("costing_exchange_rates_no_overlap")) return new CostingError("COSTING_EXCHANGE_RATE_CONFLICT", 409);
  if (message.includes("COSTING_APPEND_ONLY") || message.includes("COSTING_IDENTITY_IMMUTABLE")) return new CostingError("COSTING_HISTORY_IMMUTABLE", 409);
  if (error?.code === "P2002") return new CostingError("COSTING_CONCURRENCY_CONFLICT", 409);
  if (error?.code === "P2003") return new CostingError("COSTING_TENANT_REFERENCE_INVALID", 409);
  return error;
}
