import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { planSurveySummary, currentPlanSurvey } from "../api/_lib/planSurveySummary.js";
import { normalizeCaseConfigurationSave, normalizeCaseIntakeSave, normalizeCatalogModesSave, normalizeConfigurationConflictResolve, normalizeMaterialPolicySave, normalizeModeSave, normalizePackageSave, serviceConfigurationPayloadHash } from "../api/_lib/servicePackagesContract.js";

let checks = 0; const pass = (condition, message) => { assert.ok(condition, message); checks += 1; };
const signed = (operation, value) => { const payload = { operation, ...value }; return { ...value, payloadHash: serviceConfigurationPayloadHash(payload) }; };
const id = () => randomUUID(); const requestId = () => `service-package-${id()}`;
const resign = (operation, value, overrides) => signed(operation, { ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== "payloadHash")), ...overrides });
const mode = signed("MODE_SAVE", { requestId: requestId(), modeRef: null, expectedVersion: null, code: "LOCAL", name: "Local / Nacional", description: null, state: "PUBLISHED", sortOrder: 0 });
pass(normalizeModeSave(mode).code === "LOCAL", "modo extensible cerrado");
assert.throws(() => normalizeModeSave({ ...mode, code: "local" }), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
const automaticMode = resign("MODE_SAVE", mode, { code: null, scope: "LOCAL" });
pass(normalizeModeSave(automaticMode).scope === "LOCAL", "modalidad nueva asigna su código desde un alcance canónico explícito");
pass(normalizeModeSave(resign("MODE_SAVE", mode, { modeRef: id(), expectedVersion: 1, code: null })).code === null, "modalidad existente puede conservar código en servidor");
assert.throws(() => normalizeModeSave({ ...automaticMode, scope: "EXPORT" }), /SERVICE_PACKAGES_PAYLOAD_HASH_INVALID/); checks += 1;
assert.throws(() => normalizeModeSave(resign("MODE_SAVE", mode, { code: null })), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
assert.throws(() => normalizeModeSave(resign("MODE_SAVE", mode, { code: null, scope: "CUSTOM" })), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
assert.throws(() => normalizeModeSave(resign("MODE_SAVE", mode, { scope: "EXPORT" })), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
assert.throws(() => normalizeModeSave(resign("MODE_SAVE", mode, { modeRef: id(), expectedVersion: 1, code: null, scope: "EXPORT" })), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
const catalogModes = signed("CATALOG_MODES_SAVE", { requestId: requestId(), serviceRef: id(), modeRefs: [id()] });
pass(normalizeCatalogModesSave(catalogModes).modeRefs.length === 1, "compatibilidad se declara por referencia");
const packageInput = signed("PACKAGE_SAVE", { requestId: requestId(), packageRef: null, expectedVersion: null, code: "LOC-MOVE-STD", name: "Mudanza local estándar", description: null, category: "MUDANZA", tags: ["ESTANDAR"], modeRefs: [id()], primaryServiceRef: id(), complementaryRefs: [id()], requirements: [{ kind: "DURATION", code: "DURATION", name: "Duración", quantity: null, unitCode: null, hours: 8, days: 1, phaseCode: null, materialRef: null, assetModelRef: null, capabilityRef: null, disposition: null, chargeType: null, configuration: {} }], state: "PUBLISHED", validFrom: null, validTo: null });
pass(normalizePackageSave(packageInput).requirements[0].hours === 8, "paquete conserva duración sin scheduling");
pass(normalizePackageSave(resign("PACKAGE_SAVE", packageInput, { code: null })).code === null, "combinación nueva admite código automático");
pass(normalizePackageSave(resign("PACKAGE_SAVE", packageInput, { packageRef: id(), expectedVersion: 1, code: null })).code === null, "combinación versionada conserva identidad");
const automaticRequirement = normalizePackageSave(resign("PACKAGE_SAVE", packageInput, { requirements: [{ ...packageInput.requirements[0], code: null }] }));
pass(automaticRequirement.requirements[0].code === null, "concepto nuevo se deriva de la autoridad o tipo sin código manual");
assert.throws(() => normalizePackageSave({ ...packageInput, tenantId: "forbidden" }), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
assert.throws(() => normalizePackageSave({ ...packageInput, payloadHash: "0".repeat(64) }), /SERVICE_PACKAGES_PAYLOAD_HASH_INVALID/); checks += 1;
const invalidPerson = structuredClone(packageInput); invalidPerson.requirements = [{ ...invalidPerson.requirements[0], kind: "PERSONNEL" }]; invalidPerson.payloadHash = serviceConfigurationPayloadHash({ operation: "PACKAGE_SAVE", ...Object.fromEntries(Object.entries(invalidPerson).filter(([key]) => key !== "payloadHash")) });
assert.throws(() => normalizePackageSave(invalidPerson), /SERVICE_PACKAGES_REQUIREMENT_AUTHORITY_INVALID/); checks += 1;
const policy = signed("MATERIAL_POLICY_SAVE", { requestId: requestId(), policyRef: null, expectedVersion: null, code: "LOCAL-REUSE", name: "Local reutilizable", packageVersionRef: id(), serviceRef: null, modeRef: null, preferenceCode: "REUSABLE_ALLOWED", standardCode: "STANDARD", state: "DRAFT", validFrom: null, validTo: null, lines: [{ materialRef: id(), assetModelRef: null, materialClass: "CARDBOARD", disposition: "CONSUMED", proportion: 0.5, chargeType: "SALE", preparationRule: {}, maintenanceRule: {}, deteriorationRule: {}, replacementRule: {}, conditions: {} }] });
pass(normalizeMaterialPolicySave(policy).lines[0].proportion === 0.5, "proporción configurable");
pass(normalizeMaterialPolicySave(resign("MATERIAL_POLICY_SAVE", policy, { code: null })).code === null, "política nueva admite código automático");
pass(normalizeMaterialPolicySave(resign("MATERIAL_POLICY_SAVE", policy, { policyRef: id(), expectedVersion: 1, code: null })).code === null, "política versionada conserva identidad");
for (const [operation, original, normalize] of [["MODE_SAVE", mode, normalizeModeSave], ["PACKAGE_SAVE", packageInput, normalizePackageSave], ["MATERIAL_POLICY_SAVE", policy, normalizeMaterialPolicySave]]) {
  assert.throws(() => normalize(resign(operation, original, { code: "" })), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
  const { code: _ignored, ...missingCode } = original;
  assert.throws(() => normalize(missingCode), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
}
const dualAuthority = structuredClone(policy); dualAuthority.lines[0].assetModelRef = id(); dualAuthority.payloadHash = serviceConfigurationPayloadHash({ operation: "MATERIAL_POLICY_SAVE", ...Object.fromEntries(Object.entries(dualAuthority).filter(([key]) => key !== "payloadHash")) });
assert.throws(() => normalizeMaterialPolicySave(dualAuthority), /SERVICE_PACKAGES_MATERIAL_AUTHORITY_INVALID/); checks += 1;
const configuration = signed("CASE_CONFIGURATION_SAVE", { requestId: requestId(), expectedRevision: 0, serviceSelectionRef: id(), serviceSelectionRevision: 1, packageVersionRef: id(), materialPolicyVersionRef: id(), surveyPublicationRef: null, commercialAgreementRef: null, preference: { material: "NEW" }, duration: { hours: 8 }, source: "PACKAGE", overrides: [] });
pass(normalizeCaseConfigurationSave(configuration).source === "PACKAGE", "snapshot final cerrado");
const withConditions = (conditions) => resign("CASE_CONFIGURATION_SAVE", configuration, { preference: { quickQuote: { schemaVersion: 2, clientAccessConditions: conditions } } });
const clientAccess = { origin: { routeRevision: 2, flags: ["STAIRS", "LONG_CARRY"] } };
assert.deepEqual(normalizeCaseConfigurationSave(withConditions(clientAccess)).preference.quickQuote.clientAccessConditions, clientAccess); checks += 1;
for (const invalid of [{ origin: { flags: ["STAIRS"] } }, { destination: { routeRevision: 1, flags: ["STAIRS", "STAIRS"] } },
  { origin: { routeRevision: 1, flags: ["Inventado"] } }]) {
  assert.throws(() => normalizeCaseConfigurationSave(withConditions(invalid)), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
}
const addon = { ruleRef: id(), version: 2, name: "Grúa auxiliar", family: "ASSET", unit: "hora", currency: "DOP", unitPrice: "100.25", classification: "EX", quantity: "2.5" };
const withAddons = (pricedAdditions) => resign("CASE_CONFIGURATION_SAVE", configuration, { preference: { quickQuote: { volumeM3: 21.7, pricedAdditions } } });
const manyAddons = Array.from({ length: 25 }, () => ({ ...addon, ruleRef: id() }));
assert.deepEqual(normalizeCaseConfigurationSave(withAddons(manyAddons)).preference.quickQuote.pricedAdditions, manyAddons); checks += 1;
for (const invalid of [[addon, addon], [addon, { ...addon, ruleRef: id(), currency: "USD" }], [{ ...addon, quantity: "-1" }], [{ ...addon, quantity: "0" }]]) {
  assert.throws(() => normalizeCaseConfigurationSave(withAddons(invalid)), /SERVICE_PACKAGES_ADDON_INPUT_INVALID/); checks += 1;
}
assert.throws(() => normalizeCaseConfigurationSave({ ...configuration, ownerId: "forbidden" }), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
assert.throws(() => normalizeCaseConfigurationSave({ ...configuration, packageVersionRef: "cuid-internal" }), /SERVICE_PACKAGES_RESOURCE_NOT_FOUND/); checks += 1;
pass(!JSON.stringify(normalizeCaseConfigurationSave(configuration)).match(/tenantId|membershipId|userId/), "contrato no acepta autoridad cliente");
const directQuote = { source: "CLIENT_LIST", clientList: "4 sofás\n12 cajas", volumeM3: null, originAccess: "Escalera", destinationAccess: null, specialWork: "Desmontaje de lámparas" };
const intakeCommand = (intake) => signed("CASE_INTAKE_SAVE", {
  requestId: requestId(), expectedRevision: 0, serviceSelectionRef: id(), serviceSelectionRevision: 1, intake,
});
const savedDirectQuote = normalizeCaseIntakeSave(intakeCommand({ serviceStartDate: "2028-02-29", directQuote }));
assert.deepEqual(savedDirectQuote.intake, { serviceStartDate: "2028-02-29", directQuote }); checks += 1;
assert.deepEqual(normalizeCaseIntakeSave(intakeCommand({ serviceStartDate: null })).intake, { serviceStartDate: null }); checks += 1;
assert.deepEqual(normalizeCaseIntakeSave(intakeCommand({ serviceStartDate: null, directQuote: null })).intake, { serviceStartDate: null, directQuote: null }); checks += 1;
for (const invalid of [{ volumeM3: 0 }, { volumeM3: 100_001 }, { volumeM3: "12" }, { clientList: "x".repeat(801) }, { specialWork: "Piso\u0000" }, { source: "SURVEY" }]) {
  assert.throws(() => normalizeCaseIntakeSave(intakeCommand({ serviceStartDate: null, directQuote: { ...directQuote, ...invalid } })), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
}
for (const serviceStartDate of ["2026-02-29", "2028-04-31", "2028-1-01", "2028-01-01T00:00:00.000Z", "0000-01-01"]) {
  assert.throws(() => normalizeCaseIntakeSave(intakeCommand({ serviceStartDate })), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
}
const surveyForPlan = {
  publicationRef: id(), revision: 2, totalsSnapshot: { volumeM3: 4.8 },
  items: [
    { articleCode: "CHAIR", articleName: "Silla", quantity: 3, unitVolumeM3: 1.6, shipmentMode: "SEA", flags: ["FRAGILE"] },
    { articleCode: "LAMP", articleName: "Lámpara", quantity: 1, unitVolumeM3: null, shipmentMode: "SEA", flags: ["FRAGILE"] },
  ],
  accessSnapshots: [{ side: "ORIGIN", factsSnapshot: { floorNumber: 0, elevatorAvailable: false, flags: ["LONG_CARRY"], parkingDistanceM: 25 } }],
  materialRequirements: [],
};
const recipeForPlan = {
  applicability: { articleCodes: ["CHAIR", "LAMP"], modes: ["EXPORT"], flags: ["FRAGILE"] },
  lines: [{ materialId: "paper", unitId: "kg", formulaType: "PER_ITEM", formulaConfig: { measurement: "UNIT_VOLUME_M3" },
    multiplier: 2, wastePercent: 10, roundingIncrement: 1, material: { name: "Papel", status: "ACTIVE" }, unit: { name: "kg", status: "ACTIVE" } }],
};
const summary = planSurveySummary(surveyForPlan, [recipeForPlan], "EXPORT");
pass(summary.volumeM3 === 4.8 && summary.contentNote.includes("4 frágiles") && !summary.contentNote.includes("m³"), "métricas incompletas no simulan volumen por perfil");
pass(summary.originAccess.includes("Piso 0") && summary.originAccess.includes("Sin ascensor") && summary.originAccess.includes("25 m"), "acceso conserva planta baja y ausencia de ascensor");
pass(summary.materialsNote.includes("Papel (11 kg)") && summary.materialsNote.includes("Pendientes de medir: 1"), "material por m³ y cantidad con merma, redondeo y datos parciales");
pass(planSurveySummary(surveyForPlan, [recipeForPlan, recipeForPlan], "EXPORT").materialsNote === "Por elegir receta: 4", "no duplica ni escoge entre recetas equivalentes");
pass(planSurveySummary(surveyForPlan, [recipeForPlan], "IMPORT").materialsNote === "Sin receta específica: 4", "respeta la modalidad de la receta");
const confirmed = { ...surveyForPlan, materialRequirements: [{ lines: [{ requiredQuantity: 5, material: { name: "Cartón" }, unit: { name: "hojas" } }], _count: { lines: 1 } }] };
const summaryDb = { surveyPublication: { findFirst: async ({ where }) => {
  assert.deepEqual(where, { tenantId: "tenant", pipelineCaseId: "case", serviceSelectionRef: "plan", status: "CURRENT" });
  return confirmed;
} } };
pass((await currentPlanSurvey(summaryDb, { tenantId: "tenant", pipelineCaseId: "case" }, "plan", "EXPORT")).materialsNote === "Cartón (5 hojas)", "material confirmado prevalece sin estimar de nuevo");
const conflict = signed("CONFIGURATION_CONFLICT_RESOLVE", { requestId: requestId(), expectedState: "OPEN", resolutionCode: "SELECTED_AUTHORITY", selectedAuthorityRef: id() });
pass(normalizeConfigurationConflictResolve(conflict).expectedState === "OPEN", "resolución de conflicto cerrada e idempotente");
assert.throws(() => normalizeConfigurationConflictResolve({ ...conflict, tenantId: "forbidden" }), /SERVICE_PACKAGES_INPUT_INVALID/); checks += 1;
process.stdout.write(`${JSON.stringify({ ok: true, checks, modes: "extensible", packageVersioning: true, materialSemantics: ["CONSUMED", "RENTED", "RETURNABLE", "USAGE_CHARGE"], productionApiEnabled: false })}\n`);
