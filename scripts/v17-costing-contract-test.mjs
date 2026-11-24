import assert from "node:assert/strict";
import { assertPackagePricingRule, packageResourceLines } from "../api/_lib/costingPackages.js";
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
import { calculateCosting, getCostingPackageOptions } from "../api/_lib/costingDomain.js";
import { PACKAGE_PRICING_KIND, packageMeasures, packageQuantity } from "../shared/servicePackagePricing.js";

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
const air = packageMeasures(1, 100, { mode: "AIR", factor: 6000, roundKg: 0.5 });
assert.equal(air.grossKg, 100);
assert.equal(air.chargeableKg, 167);
assert.ok(Math.abs(air.volumetricKg - 166.6667) < 0.0001);
assert.equal(packageMeasures(1, 180, { mode: "AIR", factor: 6000, roundKg: 1 }).chargeableKg, 180);
assert.equal(packageMeasures(1, null, { mode: "AIR", factor: 6000, roundKg: 1 }).chargeableKg, 167);
const noProfileMeasures = packageMeasures(1, null, { mode: "NONE", factor: null, roundKg: 0 });
assert.equal(noProfileMeasures.volumetricKg, null);
assert.equal(packageQuantity({ basis: "CWT", factor: 1, minimumQuantity: 0 }, noProfileMeasures), null);

const packageVersionRef = ref(2010);
const seaProfile = { mode: "SEA", factor: 100, roundKg: 0 };
const roadProfile = { mode: "ROAD", factor: 125, roundKg: 0 };
const packageCost = {
  seriesRef: null, expectedVersion: 0, family: "ADDITIONAL", code: "PACKAGE_DEMO",
  name: "Mudanza de prueba", currency: "DOP", classification: "PR", source: "COMBO", priority: 100, specificity: 1,
  conditions: { packageVersionRef }, unitCost: null, minimumMarginBps: 2000, recommendedMarginBps: 2500,
  state: "ACTIVE", validFrom: null, validTo: null,
  result: {
    kind: PACKAGE_PRICING_KIND,
    includeRouteTransport: false, shipment: seaProfile, minimumSale: "32000",
    volumeTiers: [{ maxM3: 20, minimumSale: "22000" }, { maxM3: 30, minimumSale: "32000" }, { maxM3: null, minimumSale: "45000" }],
    components: [
      { ruleSeriesRef: ref(2021), concept: "Personal", unit: "hora", basis: "M3", factor: 1, minimumQuantity: 8, roundUp: false },
      { ruleSeriesRef: ref(2022), concept: "Camión", unit: "viaje", basis: "CAPACITY", factor: 18, minimumQuantity: 1, roundUp: false },
      { ruleSeriesRef: ref(2023), concept: "Materiales", unit: "caja", basis: "M3", factor: 1, minimumQuantity: 1, roundUp: true },
      { ruleSeriesRef: ref(2024), concept: "Permiso", unit: "servicio", basis: "FIXED", factor: 1, minimumQuantity: 1, roundUp: false },
    ],
  },
};
assert.equal(normalizeCostingRule(signed("COSTING_RULE_VERSION", packageCost)).result.kind, PACKAGE_PRICING_KIND);
const roadCost = (shipment) => ({ ...packageCost, result: { ...packageCost.result, shipment } });
assert.deepEqual(normalizeCostingRule(signed("COSTING_RULE_VERSION", roadCost(roadProfile))).result.shipment, roadProfile);
assert.throws(() => normalizeCostingRule(signed("COSTING_RULE_VERSION", roadCost({ ...roadProfile, factor: null }))), /COSTING_PACKAGE_RULE_INVALID/);
assert.throws(() => normalizeCostingRule(signed("COSTING_RULE_VERSION", roadCost({ ...roadProfile, roundKg: 0.5 }))), /COSTING_PACKAGE_RULE_INVALID/);
assert.throws(() => normalizeCostingRule(signed("COSTING_RULE_VERSION", {
  ...packageCost, result: { ...packageCost.result, components: [packageCost.result.components[0], packageCost.result.components[0]] },
})), /COSTING_PACKAGE_RULE_INVALID/);
assert.throws(() => normalizeCostingRule(signed("COSTING_RULE_VERSION", {
  ...packageCost, result: { ...packageCost.result, volumeTiers: [{ maxM3: 20, minimumSale: "22000" }, { maxM3: 18, minimumSale: "32000" }] },
})), /COSTING_PACKAGE_TIERS_INVALID/);
assert.equal(packageQuantity(packageCost.result.components[0], packageMeasures(5, null, seaProfile)), "8");
assert.deepEqual([18, 18.01, 30].map((m3) => packageQuantity(packageCost.result.components[1], packageMeasures(m3, null, seaProfile))), ["1", "2", "2"]);
assert.equal(packageQuantity({ ...packageCost.result.components[1], factor: 0.02 }, packageMeasures(0.14, null, seaProfile)), "7");
for (const [profile, volumetricKg] of [[seaProfile, 240], [roadProfile, 300]]) {
  const withoutGross = packageMeasures(2.4, null, profile);
  assert.equal(withoutGross.volumetricKg, volumetricKg);
  assert.equal(withoutGross.chargeableKg, null);
  assert.equal(withoutGross.cwtBasis, "ESTIMATED");
  assert.equal(withoutGross.cwt, volumetricKg / 45.359237);
  const withGross = packageMeasures(2.4, 175, profile);
  assert.equal(withGross.volumetricKg, volumetricKg);
  assert.equal(withGross.chargeableKg, null);
  assert.equal(withGross.cwtBasis, "GROSS");
  assert.equal(withGross.cwt, 175 / 45.359237);
}
const airQuote = packageMeasures(1, 100, { mode: "AIR", factor: 6000, roundKg: 1 });
assert.equal(airQuote.cwtBasis, "CHARGEABLE");
assert.equal(packageQuantity({ basis: "CWT", factor: 1, minimumQuantity: 0, roundUp: false }, airQuote), "3.6817");

const caseRecord = { id: "case-id", publicRef: ref(1100), mode: "EXPORT", routeRevision: 2, estimatedCbm: 20 };
const logisticsRef = ref(1101);
const selectionRef = ref(1102);
const context = {
  tenantId: "synthetic-tenant", userId: "staff-id", membershipId: "membership-id", role: "A",
  effectivePermissions: ["costing:calculate", "costing:view", "costing:tenant"],
};
const resourceRule = (n, family, unitCost, classification = "PR") => ({
  ruleRef: ref(2010 + n), seriesRef: ref(2020 + n), version: 1, family, unitCost, currency: "DOP",
  classification, source: "ADMIN", code: family, conditions: { packageComponentCode: family }, result: {},
  minimumMarginBps: classification === "PR" ? 2000 : null, recommendedMarginBps: classification === "PR" ? 2000 : null,
  conditionHash: "f".repeat(64),
});
const packageRules = [
  resourceRule(1, "LABOR", "450"), resourceRule(2, "TRANSPORT", "3000"),
  resourceRule(3, "MATERIAL", "100"), resourceRule(4, "PERMIT", "600", "DE"),
  { ...packageCost, ruleRef: ref(2099), seriesRef: ref(2098), version: 1, conditionHash: "e".repeat(64) },
];
const oldSurveyTotals = { totalVolumeM3: 30, totalWeightKg: 9200 };
const travelRule = resourceRule(5, "TRAVEL", "500");
const routePackage = {
  ...packageCost,
  result: {
    ...packageCost.result,
    includeRouteTransport: true,
    components: [packageCost.result.components[0], { ...packageCost.result.components[3], ruleSeriesRef: travelRule.seriesRef, concept: "Dieta del chofer" }],
  },
};
const packageConfiguration = { servicePackageVersion: { findFirst: async () => ({ id: "package-id" }) } };
await assert.doesNotReject(() => assertPackagePricingRule(packageConfiguration, context.tenantId, routePackage, null, [packageRules[0], travelRule]));
const { items: routeItems, issues: routeIssues } = packageResourceLines({ versionRef: packageVersionRef, version: 1, rule: routePackage }, {
  includeRouteTransport: true,
  measures: packageMeasures(30, null, seaProfile),
}, [packageRules[0], travelRule], "EXPORT", ["MOVING"]);
assert.deepEqual(routeItems.map((item) => item.family), ["LABOR", "TRAVEL"]);
assert.deepEqual(routeIssues, []);
await assert.rejects(() => assertPackagePricingRule(packageConfiguration, context.tenantId, {
  ...routePackage, result: { ...routePackage.result, components: [packageCost.result.components[1]] },
}, null, [packageRules[1]]), /COSTING_PACKAGE_TRANSPORT_DUPLICATE/);
let latestRules = packageRules;
let storedBasis;
let currentPreference = null;
let publishedSurveyTotals = oldSurveyTotals;
const tx = {
  $executeRaw: async () => {},
  pipelineCase: { findFirst: async ({ where }) => {
    assert.equal(where.tenantId, context.tenantId);
    return where.publicRef === caseRecord.publicRef ? caseRecord : null;
  } },
  pipelineCaseServiceRevision: { findFirst: async () => ({ selectionRef, revision: 2, modeSnapshot: "EXPORT", items: [{ serviceId: "service-id", kind: "PRIMARY", codeSnapshot: "MOVING" }] }) },
  caseServiceConfigurationRevision: { findFirst: async ({ where }) => {
    assert.equal(where.serviceSelectionRef, selectionRef);
    return currentPreference ? { preferenceSnapshot: currentPreference, packageVersion: { versionRef: packageVersionRef } } : null;
  } },
  surveyPublication: { findFirst: async ({ select }) => select.totalsSnapshot && publishedSurveyTotals ? ({ totalsSnapshot: publishedSurveyTotals }) : null },
  servicePackageVersion: { findMany: async ({ where }) => {
    assert.equal(where.tenantId, context.tenantId);
    assert.equal(where.services.some.serviceId, "service-id");
    return [{ versionRef: packageVersionRef, version: 2, name: "Mudanza de prueba" }];
  } },
  logisticsPlanRevision: { findFirst: async ({ where }) => {
    if (where.inputSnapshot?.path?.[0] === "basisHash") return storedBasis ?? null;
    if (where.planId) return { revision: 2 };
    assert.equal(where.plan.pipelineCaseId, caseRecord.id);
    return {
      id: "logistics-id", revisionRef: logisticsRef, revision: 2, status: "PUBLISHED", logicalSha256: "a".repeat(64), plan: { planRef: ref(1103) },
      inputSnapshot: {
        services: { selectionRef, revision: 2, codes: ["MOVING"] }, route: { version: 2 },
        survey: { publicationRef: ref(1104), volumeM3: oldSurveyTotals.totalVolumeM3, weightKg: oldSurveyTotals.totalWeightKg },
      },
      items: [item(99, "LABOR", "ADMIN_RULE", { quantity: 99 })], issues: [],
    };
  }, create: async ({ data }) => {
    storedBasis = { ...data, id: "basis-id", status: "PUBLISHED", revisionRef: ref(2250) };
    return storedBasis;
  } },
  logisticsPlan: { upsert: async () => ({ id: "plan-id", planRef: ref(1103) }) },
  logisticsCalculation: { create: async ({ data }) => {
    assert.equal(data.inputSnapshot.transportContext, null);
    assert.equal(data.routeVersion, 2);
    assert.equal(data.serviceSelectionRef, selectionRef);
    return { id: "basis-calculation-id" };
  } },
  costingRule: { findMany: async () => latestRules },
  costingMutationCommand: { findUnique: async () => null, create: async () => {} },
  commercialAuditLog: { create: async () => {} },
  costingCalculation: { create: async ({ data }) => ({ ...data, calculationRef: ref(2200), status: "VALID" }) },
};
const database = { ...tx, $transaction: async (operation) => operation(tx) };
const options = await getCostingPackageOptions(database, context, caseRecord.publicRef);
assert.equal(options.volumeM3, 30);
assert.equal(options.packages[0].versionRef, packageVersionRef);
assert.equal(Object.hasOwn(options, "grossKg"), false);
currentPreference = { quickQuote: { volumeM3: 32 } };
const preparedOptions = await getCostingPackageOptions(database, context, caseRecord.publicRef);
assert.equal(preparedOptions.volumeM3, 32);
assert.equal(preparedOptions.selectedPackageVersionRef, packageVersionRef);
currentPreference.directQuote = { source: "ESTIMATE", volumeM3: 18.75 };
assert.equal((await getCostingPackageOptions(database, context, caseRecord.publicRef)).volumeM3, 30);
publishedSurveyTotals = null;
assert.equal((await getCostingPackageOptions(database, context, caseRecord.publicRef)).volumeM3, 18.75);
currentPreference.directQuote = { source: "CLIENT_LIST", clientList: "4 sofás", volumeM3: null };
assert.equal((await getCostingPackageOptions(database, context, caseRecord.publicRef)).volumeM3, null);
currentPreference = null;
const unpreparedOptions = await getCostingPackageOptions(database, context, caseRecord.publicRef);
assert.equal(unpreparedOptions.volumeM3, 20);
assert.equal(unpreparedOptions.selectedPackageVersionRef, undefined);
publishedSurveyTotals = oldSurveyTotals;
const packageCommand = signed("COSTING_CALCULATE", {
  caseRef: caseRecord.publicRef, logisticsPlanRevisionRef: logisticsRef, baseCurrency: "DOP",
  packageEstimate: { versionRef: packageVersionRef, volumeM3: "30", grossKg: null },
});
const calculatedPackage = (await calculateCosting(database, context, packageCommand)).result;
assert.deepEqual(calculatedPackage.lines.map((row) => row.quantity), ["30", "2", "30", "1", "1"]);
assert.equal(calculatedPackage.totals.totalCost, "23100");
assert.equal(calculatedPackage.totals.suggestedPrice, "32000");
assert.equal(calculatedPackage.totals.disbursements, "600");
assert.deepEqual(calculatedPackage.issues, []);
assert.equal(calculatedPackage.lines.at(-1).suggestedPrice, "1400");
assert.equal(calculatedPackage.packagePricing.measures.volumetricKg, 3000);
assert.ok(Math.abs(calculatedPackage.packagePricing.measures.cwt - 66.1387) < 0.0001);
const { requestId: _request, payloadHash: _hash, ...packageInput } = packageCommand;
const configuredOnly = (await calculateCosting(database, context, signed("COSTING_CALCULATE", {
  ...packageInput, logisticsPlanRevisionRef: null, packageEstimate: { ...packageInput.packageEstimate, volumeM3: "20" },
}))).result;
assert.equal(configuredOnly.packagePricing.minimumSale, "22000");
assert.equal(configuredOnly.packagePricing.maxM3, 20);
assert.equal(configuredOnly.lines.find((line) => line.family === "TRANSPORT").quantity, "2");
const nextTier = (await calculateCosting(database, context, signed("COSTING_CALCULATE", {
  ...packageInput, logisticsPlanRevisionRef: null, packageEstimate: { ...packageInput.packageEstimate, volumeM3: "20.01" },
}))).result;
assert.equal(nextTier.packagePricing.minimumSale, "32000");
assert.equal(storedBasis.inputSnapshot.kind, "PACKAGE_QUOTATION");
latestRules = [...packageRules.slice(0, -1), {
  ...packageRules.at(-1), result: { ...packageCost.result, shipment: roadProfile },
}];
const roadOptions = await getCostingPackageOptions(database, context, caseRecord.publicRef);
const roadOption = roadOptions.packages.find((option) => option.versionRef === packageVersionRef);
assert.deepEqual(roadOption.shipment, roadProfile);
assert.equal(roadOption.needsWeight, false);
const roadQuote = (await calculateCosting(database, context, signed("COSTING_CALCULATE", {
  ...packageInput, packageEstimate: { versionRef: roadOption.versionRef, volumeM3: String(roadOptions.volumeM3), grossKg: null },
}))).result;
assert.equal(roadQuote.packagePricing.measures.volumetricKg, 3750);
assert.equal(roadQuote.packagePricing.measures.chargeableKg, null);
assert.deepEqual(roadQuote.totals, calculatedPackage.totals);
latestRules = [...packageRules.slice(0, -1), {
  ...packageRules.at(-1), result: { ...packageCost.result, shipment: { mode: "AIR", factor: 6000, roundKg: 0.5 } },
}];
const airQuoteWithoutWeighing = (await calculateCosting(database, context, packageCommand)).result;
assert.equal(airQuoteWithoutWeighing.packagePricing.measures.grossKg, null);
assert.equal(airQuoteWithoutWeighing.packagePricing.measures.chargeableKg, 5000);
const airQuoteWithWeighing = (await calculateCosting(database, context, signed("COSTING_CALCULATE", {
  ...packageInput, packageEstimate: { ...packageInput.packageEstimate, grossKg: "5400.1" },
}))).result;
assert.equal(airQuoteWithWeighing.packagePricing.measures.grossKg, 5400.1);
assert.equal(airQuoteWithWeighing.packagePricing.measures.chargeableKg, 5400.5);
latestRules = packageRules.filter((rule) => rule.family !== "PERMIT");
const incompletePackage = (await calculateCosting(database, context, packageCommand)).result;
assert.equal(incompletePackage.issues[0].code, "COSTING_PACKAGE_COMPONENT_MISSING");
assert.equal(incompletePackage.lines.length, 3);
process.stdout.write(JSON.stringify({ ok: true, scenarios: ["LOCAL_SIMPLE", "LOCAL_EXTERNAL", "PROVIDER_PENDING", "EXPORT", "IMPORT", "SERVICE_PACKAGES"], families: 13, productionApiEnabled: false }) + "\n");
