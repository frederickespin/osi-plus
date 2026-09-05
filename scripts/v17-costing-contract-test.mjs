import assert from "node:assert/strict";
import {
  COSTING_CLASSES,
  COSTING_FAMILIES,
  COSTING_SOURCES,
  calculateCostingSnapshot,
  costingHash,
  normalizeCostingAuthorization,
  normalizeCostingCalculate,
  normalizeCostingExchangeRate,
  normalizeCostingOverride,
  normalizeCostingPublish,
  normalizeCostingRule,
} from "../api/_lib/costingContract.js";

const ref = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const item = (n, family, source = "ADMIN_RULE", extra = {}) => ({ itemRef: ref(n), family, kind: `${family}_${n}`, label: `${family} ${n}`, quantity: 1, unit: "UNIT", priceStatus: "CONFIRMED", source, sourceRef: ref(100 + n), sourceVersion: 1, snapshot: { requirementRef: ref(200 + n) }, ...extra });
const authority = (n, family, classification, unitCost, currency = "DOP", extra = {}) => ({ logisticsItemRef: ref(n), family, classification, source: classification === "EX" ? "PROVIDER" : "ADMIN", sourceRef: ref(300 + n), sourceVersion: 1, unitCost, currency, minimumMarginBps: classification === "PR" ? 2000 : null, recommendedMarginBps: classification === "PR" ? 2500 : null, logicalSha256: "a".repeat(64), authoritySnapshot: { versionRef: ref(300 + n) }, ...extra });
const plan = (items, issues = []) => ({ revisionRef: ref(900), status: "PUBLISHED", items, issues });

assert.equal(COSTING_FAMILIES.length, 13);
assert.deepEqual(COSTING_CLASSES, ["PR", "EX", "DE"]);
for (const source of ["SURVEY", "SERVICE", "COMBO", "ADMIN", "MOTOR", "PROVIDER"]) assert.ok(COSTING_SOURCES.includes(source));

const local = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(1, "LABOR", "ADMIN_RULE", { quantity: 2 }), item(2, "TRANSPORT"), item(3, "MATERIAL", "INVENTORY", { quantity: 4 })]), authorities: [authority(1, "LABOR", "PR", "100"), authority(2, "TRANSPORT", "PR", "200"), authority(3, "MATERIAL", "PR", "50", "DOP", { source: "MATERIAL_COST" })] });
assert.equal(local.lines.length, 3); assert.equal(local.totals.ownCosts, "600"); assert.equal(local.totals.suggestedPrice, "800.000001"); assert.equal(local.totals.expectedMarginBps, 2500);
assert.equal(local.lines[2].snapshot.logisticsSnapshot.requirementRef, ref(203)); assert.equal(local.lines[2].snapshot.costAuthority.versionRef, ref(303));

const withExternal = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(4, "THIRD_PARTY", "PROVIDER")]), authorities: [authority(4, "THIRD_PARTY", "EX", "800")] });
assert.equal(withExternal.totals.externalCosts, "800"); assert.equal(withExternal.totals.suggestedPrice, "800");

const pendingProvider = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(5, "THIRD_PARTY", "PROVIDER", { priceStatus: "PENDING" })]), authorities: [] });
assert.deepEqual(pendingProvider.issues.map((row) => row.code).sort(), ["EXTERNAL_REFERENCE_MISSING", "PROVIDER_PRICE_PENDING"]);

const exportPlan = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(6, "MATERIAL"), item(7, "CRATING"), item(8, "FREIGHT", "PROVIDER"), item(9, "PERMIT")]), authorities: [authority(6, "MATERIAL", "PR", "100"), authority(7, "CRATING", "PR", "200"), authority(8, "FREIGHT", "EX", "10", "USD"), authority(9, "PERMIT", "DE", "300")], rates: [{ baseCurrency: "USD", quoteCurrency: "DOP", rate: "60", rateRef: ref(950), version: 4, source: "ADMIN" }] });
assert.deepEqual(exportPlan.lines.map((row) => row.family), ["MATERIAL", "CRATING", "FREIGHT", "PERMIT"]); assert.equal(exportPlan.totals.externalCosts, "600"); assert.equal(exportPlan.totals.disbursements, "300"); assert.equal(exportPlan.lines[2].exchangeRateVersion, 4);

const imported = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(10, "TRANSPORT"), item(11, "THIRD_PARTY"), item(12, "CUSTOMS")]), authorities: [authority(10, "TRANSPORT", "PR", "100"), authority(11, "THIRD_PARTY", "EX", "200"), authority(12, "CUSTOMS", "DE", "300")] });
assert.deepEqual(imported.lines.map((row) => row.classification), ["PR", "EX", "DE"]);

const fxMissing = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(13, "FREIGHT")]), authorities: [authority(13, "FREIGHT", "EX", "10", "USD")] });
assert.equal(fxMissing.issues[0].code, "CURRENCY_RATE_MISSING"); assert.equal(fxMissing.lines.length, 0);
const inverse = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(14, "FREIGHT")]), authorities: [authority(14, "FREIGHT", "EX", "600", "DOP", { currency: "DOP" })], rates: [] });
assert.equal(inverse.lines[0].exchangeRate, "1");
const compensated = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([item(15, "LABOR")]), authorities: [authority(15, "LABOR", "PR", "100")], compensationRules: [{ ruleRef: ref(960), version: 2, name: "Compensación USD", basisPoints: 500, appliesTo: ["PR"], classification: "DE", minimumMarginBps: null, recommendedMarginBps: null }] });
assert.equal(compensated.totals.currencyCompensation, "5"); assert.equal(compensated.lines.at(-1).family, "CURRENCY_COMPENSATION");
const logisticsBlocked = calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: plan([], [{ issueRef: ref(970), code: "DISTANCE_PENDING", severity: "BLOCKER", status: "OPEN" }]) });
assert.equal(logisticsBlocked.issues[0].code, "LOGISTICS_BLOCKER_PRESENT");
assert.throws(() => calculateCostingSnapshot({ baseCurrency: "DOP", logisticsRevision: { status: "DRAFT" } }), /COSTING_LOGISTICS_REVISION_REQUIRED/);

function signed(operation, payload) { const requestId = ref(980); return { requestId, payloadHash: costingHash({ operation, requestId, ...payload }), ...payload }; }
assert.doesNotThrow(() => normalizeCostingCalculate(signed("COSTING_CALCULATE", { caseRef: ref(1), logisticsPlanRevisionRef: ref(2), baseCurrency: "DOP" })));
assert.doesNotThrow(() => normalizeCostingPublish(signed("COSTING_PUBLISH", { calculationRef: ref(3) })));
assert.doesNotThrow(() => normalizeCostingOverride(signed("COSTING_OVERRIDE", { revisionRef: ref(4), lineRef: ref(5), kind: "SUGGESTED_PRICE", expectedSuggested: { amount: "100" }, finalValue: { amount: "90" }, reason: "Autorización comercial documentada" })));
assert.doesNotThrow(() => normalizeCostingAuthorization(signed("COSTING_MARGIN_AUTHORIZE", { overrideRef: ref(6), decision: "AUTHORIZED", reason: "Autorización económica documentada" })));
assert.doesNotThrow(() => normalizeCostingRule(signed("COSTING_RULE_VERSION", { seriesRef: null, family: "LABOR", code: "LABOR_STD", name: "Personal estándar", classification: "PR", source: "ADMIN", priority: 10, specificity: 5, conditions: {}, unitCost: "150", currency: "DOP", minimumMarginBps: 2000, recommendedMarginBps: 2500, result: { unit: "HOUR" }, state: "ACTIVE", validFrom: null, validTo: null })));
assert.doesNotThrow(() => normalizeCostingExchangeRate(signed("COSTING_EXCHANGE_RATE_VERSION", { seriesRef: null, baseCurrency: "USD", quoteCurrency: "DOP", rate: "60", source: "Banco administrado", state: "ACTIVE", effectiveAt: "2026-09-01T00:00:00.000Z", validTo: null })));
assert.throws(() => normalizeCostingCalculate({ ...signed("COSTING_CALCULATE", { caseRef: ref(1), logisticsPlanRevisionRef: ref(2), baseCurrency: "DOP" }), payloadHash: "0".repeat(64) }), /COSTING_PAYLOAD_HASH_MISMATCH/);
assert.throws(() => normalizeCostingCalculate(signed("COSTING_CALCULATE", { caseRef: "cuid-interno", logisticsPlanRevisionRef: ref(2), baseCurrency: "DOP" })), /COSTING_REFERENCE_INVALID/);
assert.throws(() => normalizeCostingRule(signed("COSTING_RULE_VERSION", { seriesRef: null, family: "LABOR", code: "X", name: "X", classification: "PR", source: "ADMIN", priority: 1, specificity: 1, conditions: {}, unitCost: "1", currency: "DOP", minimumMarginBps: 3000, recommendedMarginBps: 2000, result: {}, state: "ACTIVE", validFrom: null, validTo: null })), /COSTING_MARGIN_POLICY_INVALID/);
process.stdout.write(JSON.stringify({ ok: true, scenarios: ["LOCAL_SIMPLE", "LOCAL_EXTERNAL", "PROVIDER_PENDING", "EXPORT", "IMPORT"], families: 13, productionApiEnabled: false }) + "\n");
