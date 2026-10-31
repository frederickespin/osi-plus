import assert from "node:assert/strict";
import { calculateCostingSnapshot, costingHash, isProtectedTransportCostingRule, normalizeCostingRule } from "../api/_lib/costingContract.js";
import { calculateCosting, listCostingRules, publishCosting, versionCostingRule } from "../api/_lib/costingDomain.js";
import { resolveTransportCostingAuthority } from "../api/_lib/costingTransportAuthority.js";
import { findCrmPipelineCase } from "../api/_lib/crmPipelineRead.js";
import { createQuoteProposal } from "../api/_lib/quoteDomain.js";
import { eligibleCostingLines } from "../shared/quoteCostingSelection.js";
import {
  isLegacyTransportContext, latestCostingRevision, latestLogisticsRevision, latestLogisticsRevisionsByPlan,
  QUOTE_TRANSPORT_CONTEXT, SERVICE_TRANSPORT_CONTEXT, sameTransportContext,
  TRANSPORT_CONTEXT_CONTRACT, transportContextOf,
} from "../api/_lib/logisticsTransportContext.js";

const ref = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const visitContext = { contract: TRANSPORT_CONTEXT_CONTRACT, purpose: "VISIT", contextRef: ref(1) };
assert.deepEqual(transportContextOf({ route: { version: 1 } }), QUOTE_TRANSPORT_CONTEXT);
assert.equal(isLegacyTransportContext({}), true);
assert.equal(isLegacyTransportContext({ transportContext: null }), false);
for (const value of [null, {}, { ...visitContext, contextRef: null }, { ...QUOTE_TRANSPORT_CONTEXT, contextRef: ref(1) }, { ...visitContext, contract: "UNKNOWN" }]) {
  assert.equal(transportContextOf({ transportContext: value }), null);
}
assert.equal(sameTransportContext(visitContext, { ...visitContext, contextRef: ref(2) }), false);
assert.equal(sameTransportContext(visitContext, visitContext), true);

function matches(row, where) {
  return (!where.AND || where.AND.every((part) => matches(row, part)))
    && (!where.OR || where.OR.some((part) => matches(row, part)))
    && (!where.tenantId || row.tenantId === where.tenantId)
    && (!where.planId?.in || where.planId.in.includes(row.planId))
    && (!where.pipelineCaseId || row.pipelineCaseId === where.pipelineCaseId)
    && (!where.plan || row.pipelineCaseId === where.plan.pipelineCaseId)
    && (!where.status || row.status === where.status)
    && (where.id == null || typeof where.id === "string" ? where.id == null || row.id === where.id : (!where.id.in || where.id.in.includes(row.id)) && (!where.id.lt || row.id < where.id.lt))
    && (typeof where.revision !== "number" || row.revision === where.revision)
    && (!where.revision?.lt || row.revision < where.revision.lt);
}

function revisionModel(rows) {
  const queries = [];
  return {
    queries,
    async findMany(query) {
      queries.push(query);
      assert.deepEqual(query.select, { id: true, revision: true, inputSnapshot: true });
      return rows.filter((row) => matches(row, query.where)).sort((a, b) => b.revision - a.revision).slice(0, query.take).map(({ id, revision, inputSnapshot }) => ({ id, revision, inputSnapshot }));
    },
    async findFirst(query) {
      queries.push(query);
      return rows.find((row) => matches(row, query.where)) || null;
    },
  };
}

const row = (revision, context, extra = {}) => ({ id: ref(revision + 100), revision, tenantId: "tenant-a", pipelineCaseId: "case-a", status: "PUBLISHED", inputSnapshot: context ? { transportContext: context } : {}, ...extra });
const revisions = [row(1, visitContext), row(2, null), row(3, QUOTE_TRANSPORT_CONTEXT), ...Array.from({ length: 305 }, (_, i) => row(i + 4, SERVICE_TRANSPORT_CONTEXT)), row(400, visitContext, { tenantId: "other-tenant" }), row(401, visitContext, { pipelineCaseId: "other-case" })];
const model = revisionModel(revisions);
const scope = { tenantId: "tenant-a", plan: { pipelineCaseId: "case-a" } };
const visit = await latestLogisticsRevision({ logisticsPlanRevision: model }, { where: scope, context: visitContext, fallbackContext: QUOTE_TRANSPORT_CONTEXT, fallbackLegacyOnly: true });
assert.equal(visit.revision, 1, "The primary visit survives more than 300 revisions of other contexts and a newer fallback");
assert.equal(model.queries.filter((query) => query.take).length, 4);
assert.equal(model.queries.filter((query) => !query.take).length, 1, "Only the chosen full revision is read");
const fallbackModel = revisionModel(revisions.filter((value) => value.revision !== 1));
const fallback = await latestLogisticsRevision({ logisticsPlanRevision: fallbackModel }, { where: scope, context: visitContext, fallbackContext: QUOTE_TRANSPORT_CONTEXT, fallbackLegacyOnly: true });
assert.equal(fallback.revision, 2, "Scheduling fallback excludes new quotation transport and every service");
const costingModel = revisionModel(revisions);
const quote = await latestCostingRevision({ costingRevision: costingModel }, { where: { tenantId: "tenant-a", pipelineCaseId: "case-a" } });
assert.equal(quote.revision, 3, "Default costing readers expose only quotation revisions");
assert.equal(await latestLogisticsRevision({ logisticsPlanRevision: revisionModel([row(1, SERVICE_TRANSPORT_CONTEXT), row(2, QUOTE_TRANSPORT_CONTEXT)]) }, { where: scope, context: visitContext, fallbackContext: QUOTE_TRANSPORT_CONTEXT, fallbackLegacyOnly: true }), null);
await assert.rejects(() => latestLogisticsRevision({ logisticsPlanRevision: model }, { where: {}, context: visitContext }), /TRANSPORT_CONTEXT_SELECTOR_INVALID/);

const batchPlanIds = Array.from({ length: 51 }, (_, i) => ref(2001 + i));
const batchRows = batchPlanIds.flatMap((planId, i) => [
  { ...row(2, SERVICE_TRANSPORT_CONTEXT), planId, id: ref(3001 + i) },
  { ...row(1, QUOTE_TRANSPORT_CONTEXT), planId, id: ref(4001 + i), inputSnapshot: { transportContext: QUOTE_TRANSPORT_CONTEXT, route: { version: 3 } }, items: [{ snapshot: { originZoneType: "METRO", destinationZoneType: "INTERIOR" } }] },
]);
const batchQueries = [];
const batchModel = { async findMany(query) {
  batchQueries.push(query);
  const rows = batchRows.filter((value) => matches(value, query.where)).sort((a, b) => b.revision - a.revision || b.id.localeCompare(a.id)).slice(0, query.take);
  if (query.take) {
    assert.deepEqual(query.select, { id: true, planId: true, revision: true, inputSnapshot: true });
    return rows.map(({ id, planId, revision, inputSnapshot }) => ({ id, planId, revision, inputSnapshot }));
  }
  return rows;
} };
const batch = await latestLogisticsRevisionsByPlan({ logisticsPlanRevision: batchModel }, { tenantId: "tenant-a", planIds: batchPlanIds });
assert.equal(batch.size, 51, "Composite metadata cursor keeps revisions tied at the page boundary across plans");
assert.equal(batchQueries.length, 3, "Inbox uses two metadata pages and one full batch, not one query per case");
assert.ok([...batch.values()].every((value) => value.revision === 1));
let routeVersion = 3;
const readPrisma = { logisticsPlanRevision: batchModel, logisticsPlan: { async findMany({ where, select }) {
  assert.deepEqual(where, { tenantId: "tenant-a", planRef: { in: [ref(5002)] } });
  assert.deepEqual(select, { id: true, planRef: true });
  return [{ id: batchPlanIds[0], planRef: ref(5002) }];
} }, pipelineCase: { async findFirst({ where, select }) {
  assert.equal(where.tenantId, "tenant-a");
  assert.deepEqual(select.logisticsPlans.select, { planRef: true }, "Public case projection never selects the private plan key");
  return { publicRef: ref(5001), caseCode: "SYNTHETIC", version: 1, routeRevision: routeVersion, routeSnapshots: [
    { routeVersion, role: "ORIGIN", stopOrder: 0, countryCode: "DO", cityMunicipality: "Synthetic origin" },
    { routeVersion, role: "DESTINATION", stopOrder: 0, countryCode: "DO", cityMunicipality: "Synthetic destination" },
  ], logisticsPlans: [{ planRef: ref(5002) }], _count: {} };
} } };
const routeCase = await findCrmPipelineCase(readPrisma, { tenantId: "tenant-a", role: "A", caseRef: ref(5001) });
assert.equal(routeCase.route.origin.area, "METRO");
assert.equal(routeCase.route.destination.area, "INTERIOR", "New transport component snapshots preserve destination classification without VISIT_ZONE items");
assert.equal(routeCase.route.destination.areaSource, "PUBLISHED_LOGISTICS");
assert.equal(JSON.stringify(routeCase).includes(batchPlanIds[0]), false, "Private grouping key is not serialized into the case DTO");
routeVersion = 4;
const changedRouteCase = await findCrmPipelineCase(readPrisma, { tenantId: "tenant-a", role: "A", caseRef: ref(5001) });
assert.equal(changedRouteCase.route.destination.area, "UNAVAILABLE", "A new route cannot inherit the previous route's geographic classification");

const namespace = { transportContract: TRANSPORT_CONTEXT_CONTRACT, zoneSeriesRef: ref(20), componentCode: "BASE" };
const transport = { contract: TRANSPORT_CONTEXT_CONTRACT, zoneRuleRef: ref(21), zoneVersion: 2, componentCode: "BASE", costRuleRef: ref(22), costRuleVersion: 2, journeyRef: "journey-one", factor: "1.25" };
const component = { code: "BASE", label: "Base", kind: "BASE", basis: "TRIP", includedConcepts: [], costRuleRef: ref(22), costRuleVersion: 2 };
const zone = { tenantId: "tenant-a", ruleRef: ref(21), seriesRef: ref(20), version: 2, family: "ZONE", state: "SUPERSEDED", conditions: { transportContract: TRANSPORT_CONTEXT_CONTRACT, zoneSeriesRef: ref(20), vehicleType: null }, result: { kind: "TRANSPORT_ZONE_POLICY", contract: TRANSPORT_CONTEXT_CONTRACT, purposes: ["QUOTE", "SERVICE", "VISIT"], mode: "FACTOR", factor: "1.25", currency: "DOP", components: [component] } };
zone.conditionHash = costingHash(zone.conditions);
const rule = { tenantId: "tenant-a", ruleRef: ref(22), seriesRef: ref(23), version: 2, state: "SUPERSEDED", code: `TZ_${costingHash({ zoneSeriesRef: ref(20), componentCode: "BASE" }).slice(0, 40)}`, source: "MOTOR", family: "TRANSPORT", classification: "PR", unitCost: "100.125", currency: "DOP", minimumMarginBps: 1000, recommendedMarginBps: 1500, conditions: namespace, result: namespace, conditionHash: costingHash(namespace) };
const item = { itemRef: ref(24), family: "TRANSPORT", kind: "BASE", unit: "TRIP", quantity: "2", source: "ADMIN_RULE", sourceRef: ref(21), sourceVersion: 2, snapshot: { transport } };
const line = { ...transport, kind: "BASE", unit: "TRIP", quantity: "2", unitCost: "125.15625", currency: "DOP" };
const journey = { journeyRef: "journey-one", vehicleType: "SYNTHETIC", distanceKm: "100", returnToOrigin: true, trips: 2, people: 1, days: "1", quantities: {} };
const revision = { inputSnapshot: { transportContext: QUOTE_TRANSPORT_CONTEXT, transportInput: { purpose: "QUOTE", contextRef: null, journeys: [journey] } }, resultSnapshot: { transport: { context: QUOTE_TRANSPORT_CONTEXT, lines: [line] } } };
const trusted = { tenantId: "tenant-a", membershipId: "member-a", userId: "user-a", effectivePermissions: ["costing:rules:view", "costing:rules:manage"] };
function authorityTx(zoneValue = zone, ruleValue = rule) {
  return {
    logisticsRule: { async findFirst({ where }) { assert.equal(where.tenantId, trusted.tenantId); assert.equal(where.ruleRef, transport.zoneRuleRef); assert.equal(where.version, transport.zoneVersion); return zoneValue; } },
    costingRule: { async findFirst({ where }) { assert.equal(where.tenantId, trusted.tenantId); assert.equal(where.ruleRef, transport.costRuleRef); assert.equal(where.version, transport.costRuleVersion); return ruleValue; } },
  };
}
const authority = await resolveTransportCostingAuthority(authorityTx(), trusted, item, revision);
assert.equal(authority.unitCost, "125.15625", "Factor uses integer decimal arithmetic at the same precision as Costing");
assert.equal(authority.source, "MOTOR");
assert.equal(authority.sourceRef, rule.ruleRef);
assert.equal(authority.minimumMarginBps, 1000);
assert.equal(authority.recommendedMarginBps, 1500);
assert.equal(authority.authoritySnapshot.transport.originalUnitCost, "100.125");
const noMargin = await resolveTransportCostingAuthority(authorityTx(zone, { ...rule, minimumMarginBps: null, recommendedMarginBps: null }), trusted, item, revision);
assert.equal(noMargin.minimumMarginBps, null, "No invented commercial margin");
const rejected = (tx, value = item, revisionValue = revision) => assert.rejects(() => resolveTransportCostingAuthority(tx, trusted, value, revisionValue), { code: "COSTING_TRANSPORT_AUTHORITY_INVALID" });
await rejected(authorityTx(null));
await rejected(authorityTx({ ...zone, tenantId: "other-tenant" }));
await rejected(authorityTx(zone, { ...rule, tenantId: "other-tenant" }));
await rejected(authorityTx(zone, { ...rule, code: "GENERIC_RULE" }));
await rejected(authorityTx(zone, { ...rule, version: 3 }));
await rejected(authorityTx(zone, { ...rule, result: { ...namespace, unitCost: "1" } }));
await rejected(authorityTx(zone, { ...rule, unitCost: "1" }));
await rejected(authorityTx(), { ...item, sourceVersion: 1 });
await rejected(authorityTx(), { ...item, quantity: "3" });
await rejected(authorityTx(), { ...item, quantity: "2.00001" });
await rejected(authorityTx(), item, { ...revision, inputSnapshot: { ...revision.inputSnapshot, transportInput: { ...revision.inputSnapshot.transportInput, journeys: [{ ...journey, trips: 3 }] } } });
await rejected(authorityTx(), { ...item, snapshot: { transport: { ...transport, unitCost: "0" } } });
await rejected(authorityTx(), item, { ...revision, resultSnapshot: { transport: { context: SERVICE_TRANSPORT_CONTEXT, lines: [line] } } });
await rejected(authorityTx(), item, { ...revision, resultSnapshot: { transport: { context: QUOTE_TRANSPORT_CONTEXT, lines: [line, line] } } });

assert.equal(isProtectedTransportCostingRule(rule), true);
for (const value of [{ code: "TZ_RESERVED" }, { conditions: { transportContract: "UNKNOWN" } }, { result: namespace }]) assert.equal(isProtectedTransportCostingRule(value), true);
assert.throws(() => normalizeCostingRule({ code: "TZ_RESERVED" }), { code: "COSTING_TRANSPORT_RULE_PROTECTED" });
const generic = { seriesRef: rule.seriesRef, family: "TRANSPORT", code: "GENERIC", name: "Generic rule", classification: "PR", source: "ADMIN", priority: 0, specificity: 0, conditions: {}, unitCost: "1", currency: "DOP", minimumMarginBps: null, recommendedMarginBps: null, result: {}, state: "ACTIVE", validFrom: null, validTo: null };
const requestId = ref(40);
const command = { requestId, ...generic, payloadHash: costingHash({ operation: "COSTING_RULE_VERSION", requestId, ...generic }) };
let wrote = false;
const mutationTx = { $executeRaw: async () => {}, costingMutationCommand: { findUnique: async () => null }, costingRule: { findFirst: async () => rule, update: async () => { wrote = true; }, create: async () => { wrote = true; } } };
await assert.rejects(() => versionCostingRule({ $transaction: (work) => work(mutationTx) }, trusted, command), { code: "COSTING_TRANSPORT_RULE_PROTECTED" });
assert.equal(wrote, false, "A renamed payload cannot edit a protected transport series");
const listed = await listCostingRules({ costingRule: { findMany: async () => [rule, { ...generic, ruleRef: ref(41), version: 1 }] } }, trusted);
assert.equal(listed.length, 1);
assert.equal(listed[0].code, "GENERIC");

// Exercise the real Costing calculate/publish path: a newer SERVICE revision
// cannot invalidate a quotation calculation, but a newer quotation must do so.
function costingFixture(newerQuote = false) {
  const legacy = { ...row(1, null), id: ref(1000), revisionRef: ref(1001), planId: ref(1002), plan: { id: ref(1002), planRef: ref(1003) }, items: [{ itemRef: ref(1004), family: "TRANSPORT", kind: "VEHICLE", label: "Synthetic transport", quantity: "2", unit: "TRIP", requiredQuantity: null, source: "ADMIN_RULE", sourceRef: ref(1005), sourceVersion: 1, priceStatus: "CONFIRMED", snapshot: {}, position: 0 }], issues: [], logicalSha256: "a".repeat(64) };
  const rows = [legacy, { ...row(2, SERVICE_TRANSPORT_CONTEXT), revisionRef: ref(1006) }, ...(newerQuote ? [{ ...row(3, QUOTE_TRANSPORT_CONTEXT), revisionRef: ref(1007) }] : [])];
  const metadata = revisionModel(rows);
  const genericRule = { ...generic, ruleRef: ref(1010), seriesRef: ref(1011), classification: "DE", conditions: { logisticsFamilies: ["TRANSPORT"] }, conditionHash: "b".repeat(64), unitCost: "50", version: 1 };
  let calculation;
  let createdRevision;
  const tx = {
    $executeRaw: async () => {},
    pipelineCase: { findFirst: async ({ where }) => { assert.equal(where.tenantId, "tenant-a"); return { id: "case-a", publicRef: ref(1008) }; } },
    logisticsPlanRevision: { findMany: metadata.findMany, findFirst: async (query) => query.where.revisionRef === legacy.revisionRef ? legacy : metadata.findFirst(query) },
    costingRule: { findMany: async () => [genericRule] },
    costingCalculation: {
      create: async ({ data }) => { calculation = { ...data, id: ref(1020), calculationRef: ref(1021), status: "DRAFT" }; return calculation; },
      findFirst: async () => ({ ...calculation, pipelineCase: { publicRef: ref(1008) }, logisticsRevision: { revisionRef: legacy.revisionRef, planId: legacy.planId, inputSnapshot: legacy.inputSnapshot }, publishedRevision: null }),
    },
    costingRevision: {
      findFirst: async ({ where, select }) => { assert.deepEqual(select, { revision: true }); assert.equal(where.pipelineCaseId, "case-a"); return { revision: 7 }; },
      create: async ({ data }) => { createdRevision = { ...data, revisionRef: ref(1030), status: "PUBLISHED", publishedAt: new Date("2026-10-01T00:00:00Z"), lines: data.lines.create.map((value, i) => ({ ...value, lineRef: ref(1031 + i) })), issues: data.issues.create, overrides: [] }; return createdRevision; },
    },
    costingMutationCommand: { findUnique: async () => null, create: async () => {} },
    commercialAuditLog: { create: async () => {} },
  };
  return { prisma: { $transaction: (work) => work(tx) }, get createdRevision() { return createdRevision; }, caseRef: ref(1008), revisionRef: legacy.revisionRef };
}
function signed(operation, payload, request = ref(1100)) {
  return { requestId: request, payloadHash: costingHash({ operation, requestId: request, ...payload }), ...payload };
}
const costActor = { ...trusted, effectivePermissions: ["costing:calculate", "costing:publish"] };
const currentFixture = costingFixture();
const calculation = await calculateCosting(currentFixture.prisma, costActor, signed("COSTING_CALCULATE", { caseRef: currentFixture.caseRef, logisticsPlanRevisionRef: currentFixture.revisionRef, baseCurrency: "DOP" }));
const published = await publishCosting(currentFixture.prisma, costActor, signed("COSTING_PUBLISH", { calculationRef: calculation.calculationRef }, ref(1101)));
assert.equal(published.revision, 8, "Context filtering does not alter the global immutable revision sequence");
assert.equal(published.totals.totalCost, "100");
assert.deepEqual(currentFixture.createdRevision.inputSnapshot.transportContext, QUOTE_TRANSPORT_CONTEXT);
const staleFixture = costingFixture(true);
const staleCalculation = await calculateCosting(staleFixture.prisma, costActor, signed("COSTING_CALCULATE", { caseRef: staleFixture.caseRef, logisticsPlanRevisionRef: staleFixture.revisionRef, baseCurrency: "DOP" }));
await assert.rejects(() => publishCosting(staleFixture.prisma, costActor, signed("COSTING_PUBLISH", { calculationRef: staleCalculation.calculationRef }, ref(1102))), { code: "COSTING_INPUT_STALE" });
assert.equal(staleFixture.createdRevision, undefined);

const quotationInput = {
  caseRef: ref(1200), costingRevisionRef: ref(1201), position: 1, proposalName: "Synthetic transport quotation", currency: "DOP", issueDate: "2026-10-01", validUntil: "2026-12-01",
  commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null },
  payer: { kind: "CLIENT", reference: "SYNTHETIC", displayName: "Synthetic client", sourceVersion: 1, validFrom: null, validUntil: null, conditions: null },
  terms: { paymentTerms: "Synthetic terms", scope: "Synthetic scope", exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null },
  exchange: null, discount: null, marginAuthorizationRef: null,
  lines: [{ sourceKind: "COSTING", costingLineRef: ref(1202), concept: "Transport", quantity: "1", unit: "TRIP", economicClass: "DE", quotedPrice: "100", currency: "DOP", reason: null, manualAuthority: null }],
};
function quoteFixture(costContext, logisticsContext) {
  const tx = {
    $executeRaw: async () => {},
    quoteMutationCommand: { findUnique: async () => null },
    pipelineCase: { findFirst: async () => ({ id: "case-a" }) },
    pipelineCaseCommercialContextVersion: { findFirst: async () => null },
    costingRevision: { findFirst: async () => ({ id: ref(1201), inputSnapshot: costContext ? { transportContext: costContext } : {}, logisticsRevision: { inputSnapshot: logisticsContext ? { transportContext: logisticsContext } : {} } }) },
    pipelineCaseQuote: { findFirst: async () => { throw new Error("QUOTATION_CONTEXT_ACCEPTED"); } },
  };
  return { $transaction: (work) => work(tx) };
}
const quoteActor = { ...trusted, effectivePermissions: ["quote:create"] };
for (const [costContext, logisticsContext] of [[SERVICE_TRANSPORT_CONTEXT, SERVICE_TRANSPORT_CONTEXT], [QUOTE_TRANSPORT_CONTEXT, visitContext], [visitContext, QUOTE_TRANSPORT_CONTEXT]]) {
  await assert.rejects(() => createQuoteProposal(quoteFixture(costContext, logisticsContext), quoteActor, signed("QUOTE_PROPOSAL_CREATE", quotationInput)), { code: "QUOTE_COSTING_CONTEXT_INVALID" });
}
for (const context of [null, QUOTE_TRANSPORT_CONTEXT]) await assert.rejects(() => createQuoteProposal(quoteFixture(context, context), quoteActor, signed("QUOTE_PROPOSAL_CREATE", quotationInput)), /QUOTATION_CONTEXT_ACCEPTED/);

const zeroTransportItem = { ...item, kind: "TOLL", quantity: "0.0000", unit: "PASS" };
const zeroSnapshot = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: { status: "PUBLISHED", items: [zeroTransportItem] }, authorities: [noMargin] });
assert.equal(zeroSnapshot.lines.length, 1, "Zero passes remain in the immutable internal Costing snapshot");
assert.equal(zeroSnapshot.lines[0].quantity, "0.0000");
assert.equal(zeroSnapshot.lines[0].totalCost, "0");
assert.equal(zeroSnapshot.lines[0].minimumMarginBps, null);
assert.equal(zeroSnapshot.issues.some((issue) => issue.code === "MARGIN_POLICY_MISSING"), false, "No commercial margin is needed for an expense that did not occur");
const positiveSnapshot = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: { status: "PUBLISHED", items: [{ ...zeroTransportItem, quantity: "1" }] }, authorities: [noMargin] });
assert.equal(positiveSnapshot.issues.some((issue) => issue.code === "MARGIN_POLICY_MISSING"), true, "Positive quantities still require configured margins");
const selectable = ["0", "0.0000", "0.0001", "1", "99999999999999.9999"].map((quantity, i) => ({ lineRef: ref(1300 + i), quantity, suggestedPrice: "0" }));
const selected = eligibleCostingLines(selectable);
assert.deepEqual(selected.map((value) => value.quantity), ["0.0001", "1", "99999999999999.9999"]);
assert.equal(selectable.length, 5);
assert.equal(eligibleCostingLines([{ lineRef: ref(1310), quantity: "NaN", suggestedPrice: "0" }]).length, 0);

const sourceLine = { ...quotationInput.lines[0], lineRef: ref(1202), classification: "DE", suggestedPrice: "100", totalCost: "100", sourceRef: ref(1320), sourceVersion: 1 };
const sourceCosting = { id: ref(1201), revisionRef: ref(1201), revision: 1, status: "PUBLISHED", baseCurrency: "DOP", publishedAt: new Date("2026-10-01T00:00:00Z"), logicalSha256: "d".repeat(64), inputSnapshot: { transportContext: QUOTE_TRANSPORT_CONTEXT }, logisticsRevision: { revisionRef: ref(1330), inputSnapshot: { transportContext: QUOTE_TRANSPORT_CONTEXT } }, lines: [sourceLine, { ...sourceLine, lineRef: ref(1321), concept: "Unused toll", quantity: "0", suggestedPrice: "0", totalCost: "0" }], issues: [], overrides: [] };
const subsetTx = {
  $executeRaw: async () => {},
  quoteMutationCommand: { findUnique: async () => null },
  pipelineCase: { findFirst: async () => ({ id: "case-a", publicRef: ref(1200), caseCode: "SYNTHETIC", mode: "LOCAL", destinationStatus: "CONFIRMED", routeRevision: 1, routeSnapshots: [], client: null }) },
  pipelineCaseCommercialContextVersion: { findFirst: async () => null },
  costingRevision: { findFirst: async () => sourceCosting },
  pipelineCaseQuote: { findFirst: async () => ({ id: ref(1340) }) },
  quoteProposal: { count: async () => 0, create: async () => ({ id: ref(1341), currentRevision: 0 }) },
  quoteReferenceCounter: { upsert: async () => ({ value: 1 }) },
  quoteProposalRevision: { create: async ({ data }) => { assert.equal(data.lines.create.length, 1); assert.equal(data.lines.create[0].costingLineRef, ref(1202)); throw new Error("QUOTATION_SUBSET_VALIDATED"); } },
};
await assert.rejects(() => createQuoteProposal({ $transaction: (work) => work(subsetTx) }, quoteActor, signed("QUOTE_PROPOSAL_CREATE", quotationInput)), /QUOTATION_SUBSET_VALIDATED/);

process.stdout.write(`${JSON.stringify({ ok: true, contexts: true, unboundedPagination: true, legacyFallback: true, batchInboxContext: true, tariffAuthority: true, decimalFactor: true, protectedRules: true, costingPublicationContext: true, quotationContext: true, zeroQuantityQuotation: true })}\n`);
