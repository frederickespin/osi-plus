import { createHash } from "node:crypto";
import { CrmServicesError } from "./crmServicesContract.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const HASH = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_-]{1,63}$/;
const STATES = new Set(["DRAFT", "PUBLISHED", "INACTIVE"]);
const SERVICE_KINDS = new Set(["PRIMARY", "COMPLEMENTARY"]);
const REQUIREMENT_KINDS = new Set(["PERSONNEL", "MATERIAL", "ASSET", "VEHICLE", "TRANSPORT", "DURATION", "CRATING"]);
const DISPOSITIONS = new Set(["CONSUMED", "RENTED", "RETURNABLE", "USAGE_CHARGE"]);
const CHARGES = new Set(["INCLUDED", "SALE", "RENTAL", "USAGE", "PREPARATION", "MAINTENANCE", "DETERIORATION", "REPLACEMENT"]);
const SOURCES = new Set(["PACKAGE", "COMMERCIAL_AGREEMENT", "CASE_OVERRIDE", "MANUAL_RESOLUTION"]);

function fail(code, status = 400) { throw new CrmServicesError(code, status); }
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("SERVICE_PACKAGES_INPUT_INVALID");
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail("SERVICE_PACKAGES_INPUT_INVALID");
}
function text(value, max = 191, min = 1) {
  if (typeof value !== "string" || value !== value.trim() || value.length < min || value.length > max || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) fail("SERVICE_PACKAGES_INPUT_INVALID");
  return value;
}
function nullableText(value, max) { return value === null ? null : text(value, max); }
function ref(value, nullable = false) { if (nullable && value === null) return null; if (typeof value !== "string" || !UUID_V4.test(value)) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404); return value; }
function integer(value, min = 0) { if (!Number.isSafeInteger(value) || value < min) fail("SERVICE_PACKAGES_INPUT_INVALID"); return value; }
function decimal(value, { nullable = true, max = 1_000_000 } = {}) { if (nullable && value === null) return null; if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) fail("SERVICE_PACKAGES_INPUT_INVALID"); return value; }
function choice(value, allowed) { const result = text(value, 80); if (!allowed.has(result)) fail("SERVICE_PACKAGES_INPUT_INVALID"); return result; }
function refs(value, maximum = 50) { if (!Array.isArray(value) || value.length > maximum) fail("SERVICE_PACKAGES_INPUT_INVALID"); const result = value.map((item) => ref(item)); if (new Set(result).size !== result.length) fail("SERVICE_PACKAGES_DUPLICATE_SELECTION", 409); return Object.freeze(result); }
function texts(value, maximum = 20) { if (!Array.isArray(value) || value.length > maximum) fail("SERVICE_PACKAGES_INPUT_INVALID"); const result = value.map((item) => text(item, 80)); if (new Set(result).size !== result.length) fail("SERVICE_PACKAGES_DUPLICATE_SELECTION", 409); return Object.freeze(result.sort()); }
function canonical(value) { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; }
export function serviceConfigurationPayloadHash(value) { return createHash("sha256").update(canonical(value), "utf8").digest("hex"); }
function signed(input, payload) { if (typeof input.payloadHash !== "string" || !HASH.test(input.payloadHash) || input.payloadHash !== serviceConfigurationPayloadHash(payload)) fail("SERVICE_PACKAGES_PAYLOAD_HASH_INVALID"); return Object.freeze({ ...payload, payloadHash: input.payloadHash }); }
function requestId(value) { const result = text(value, 191, 8); if (!REQUEST_ID.test(result)) fail("SERVICE_PACKAGES_INPUT_INVALID"); return result; }
function code(value) { const result = text(value, 64, 2); if (!CODE.test(result)) fail("SERVICE_PACKAGES_INPUT_INVALID"); return result; }
function optionalRule(value) { if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value).length > 2_000) fail("SERVICE_PACKAGES_INPUT_INVALID"); return Object.freeze({ ...value }); }

function requirement(value) {
  exact(value, ["kind", "code", "name", "quantity", "unitCode", "hours", "days", "phaseCode", "materialRef", "assetModelRef", "capabilityRef", "disposition", "chargeType", "configuration"]);
  const kind = choice(value.kind, REQUIREMENT_KINDS);
  const result = Object.freeze({ kind, code: text(value.code, 80), name: text(value.name, 160), quantity: decimal(value.quantity), unitCode: nullableText(value.unitCode, 32), hours: decimal(value.hours, { max: 100_000 }), days: decimal(value.days, { max: 10_000 }), phaseCode: nullableText(value.phaseCode, 64), materialRef: ref(value.materialRef, true), assetModelRef: ref(value.assetModelRef, true), capabilityRef: ref(value.capabilityRef, true), disposition: value.disposition === null ? null : choice(value.disposition, DISPOSITIONS), chargeType: value.chargeType === null ? null : choice(value.chargeType, CHARGES), configuration: optionalRule(value.configuration) });
  const authorities = [result.materialRef, result.assetModelRef, result.capabilityRef].filter(Boolean).length;
  if ((kind === "PERSONNEL" && (!result.capabilityRef || authorities !== 1)) || (kind === "MATERIAL" && (!result.materialRef || authorities !== 1)) || (kind === "ASSET" && (!result.assetModelRef || authorities !== 1)) || (!["PERSONNEL", "MATERIAL", "ASSET"].includes(kind) && authorities !== 0)) fail("SERVICE_PACKAGES_REQUIREMENT_AUTHORITY_INVALID", 409);
  return result;
}

export function normalizePackageSave(input) {
  exact(input, ["requestId", "payloadHash", "packageRef", "expectedVersion", "code", "name", "description", "category", "tags", "modeRefs", "primaryServiceRef", "complementaryRefs", "requirements", "state", "validFrom", "validTo"]);
  if (!Array.isArray(input.requirements) || input.requirements.length > 100) fail("SERVICE_PACKAGES_INPUT_INVALID");
  const payload = Object.freeze({ operation: "PACKAGE_SAVE", requestId: requestId(input.requestId), packageRef: ref(input.packageRef, true), expectedVersion: input.expectedVersion === null ? null : integer(input.expectedVersion, 1), code: code(input.code), name: text(input.name, 160), description: nullableText(input.description, 1000), category: nullableText(input.category, 80), tags: texts(input.tags), modeRefs: refs(input.modeRefs), primaryServiceRef: ref(input.primaryServiceRef), complementaryRefs: refs(input.complementaryRefs), requirements: Object.freeze(input.requirements.map(requirement)), state: choice(input.state, STATES), validFrom: nullableText(input.validFrom, 40), validTo: nullableText(input.validTo, 40) });
  if (!payload.modeRefs.length) fail("SERVICE_PACKAGES_MODE_REQUIRED", 409);
  if (payload.packageRef === null !== (payload.expectedVersion === null)) fail("SERVICE_PACKAGES_INPUT_INVALID");
  return signed(input, payload);
}

export function normalizeModeSave(input) {
  exact(input, ["requestId", "payloadHash", "modeRef", "expectedVersion", "code", "name", "description", "state", "sortOrder"]);
  const payload = Object.freeze({ operation: "MODE_SAVE", requestId: requestId(input.requestId), modeRef: ref(input.modeRef, true), expectedVersion: input.expectedVersion === null ? null : integer(input.expectedVersion, 1), code: code(input.code), name: text(input.name, 160), description: nullableText(input.description, 500), state: choice(input.state, STATES), sortOrder: integer(input.sortOrder) });
  if (payload.modeRef === null !== (payload.expectedVersion === null)) fail("SERVICE_PACKAGES_INPUT_INVALID");
  return signed(input, payload);
}

export function normalizeCatalogModesSave(input) {
  exact(input, ["requestId", "payloadHash", "serviceRef", "modeRefs"]);
  const payload = Object.freeze({ operation: "CATALOG_MODES_SAVE", requestId: requestId(input.requestId), serviceRef: ref(input.serviceRef), modeRefs: refs(input.modeRefs) });
  if (!payload.modeRefs.length) fail("SERVICE_PACKAGES_MODE_REQUIRED", 409);
  return signed(input, payload);
}

function policyLine(value) {
  exact(value, ["materialRef", "assetModelRef", "materialClass", "disposition", "proportion", "chargeType", "preparationRule", "maintenanceRule", "deteriorationRule", "replacementRule", "conditions"]);
  const materialRef = ref(value.materialRef, true); const assetModelRef = ref(value.assetModelRef, true);
  if (Boolean(materialRef) === Boolean(assetModelRef)) fail("SERVICE_PACKAGES_MATERIAL_AUTHORITY_INVALID", 409);
  const proportion = decimal(value.proportion, { max: 1 });
  return Object.freeze({ materialRef, assetModelRef, materialClass: text(value.materialClass, 80), disposition: choice(value.disposition, DISPOSITIONS), proportion, chargeType: choice(value.chargeType, CHARGES), preparationRule: optionalRule(value.preparationRule), maintenanceRule: optionalRule(value.maintenanceRule), deteriorationRule: optionalRule(value.deteriorationRule), replacementRule: optionalRule(value.replacementRule), conditions: optionalRule(value.conditions) });
}

export function normalizeMaterialPolicySave(input) {
  exact(input, ["requestId", "payloadHash", "policyRef", "expectedVersion", "code", "name", "packageVersionRef", "serviceRef", "modeRef", "preferenceCode", "standardCode", "state", "validFrom", "validTo", "lines"]);
  if (!Array.isArray(input.lines) || input.lines.length > 100) fail("SERVICE_PACKAGES_INPUT_INVALID");
  const payload = Object.freeze({ operation: "MATERIAL_POLICY_SAVE", requestId: requestId(input.requestId), policyRef: ref(input.policyRef, true), expectedVersion: input.expectedVersion === null ? null : integer(input.expectedVersion, 1), code: code(input.code), name: text(input.name, 160), packageVersionRef: ref(input.packageVersionRef, true), serviceRef: ref(input.serviceRef, true), modeRef: ref(input.modeRef, true), preferenceCode: nullableText(input.preferenceCode, 80), standardCode: text(input.standardCode, 80), state: choice(input.state, STATES), validFrom: nullableText(input.validFrom, 40), validTo: nullableText(input.validTo, 40), lines: Object.freeze(input.lines.map(policyLine)) });
  if (![payload.packageVersionRef, payload.serviceRef, payload.modeRef].some(Boolean)) fail("SERVICE_PACKAGES_POLICY_SCOPE_REQUIRED", 409);
  if (payload.policyRef === null !== (payload.expectedVersion === null)) fail("SERVICE_PACKAGES_INPUT_INVALID");
  return signed(input, payload);
}

function override(value) {
  exact(value, ["kind", "source", "authorityRef", "code", "name", "quantity", "unitCode", "hours", "days", "disposition", "chargeType", "proportion", "details"]);
  const itemKinds = new Set(["PERSONNEL", "MATERIAL", "ASSET", "VEHICLE", "TRANSPORT", "DURATION", "CRATING"]);
  const sources = new Set(["COMMERCIAL_AGREEMENT", "SURVEY", "CASE_OVERRIDE"]);
  return Object.freeze({ kind: choice(value.kind, itemKinds), source: choice(value.source, sources), authorityRef: ref(value.authorityRef, true), code: text(value.code, 80), name: text(value.name, 160), quantity: decimal(value.quantity), unitCode: nullableText(value.unitCode, 32), hours: decimal(value.hours, { max: 100_000 }), days: decimal(value.days, { max: 10_000 }), disposition: value.disposition === null ? null : choice(value.disposition, DISPOSITIONS), chargeType: value.chargeType === null ? null : choice(value.chargeType, CHARGES), proportion: decimal(value.proportion, { max: 1 }), details: optionalRule(value.details) });
}

export function normalizeCaseConfigurationSave(input) {
  exact(input, ["requestId", "payloadHash", "expectedRevision", "serviceSelectionRef", "serviceSelectionRevision", "packageVersionRef", "materialPolicyVersionRef", "surveyPublicationRef", "commercialAgreementRef", "preference", "duration", "source", "overrides"]);
  if (!Array.isArray(input.overrides) || input.overrides.length > 100) fail("SERVICE_PACKAGES_INPUT_INVALID");
  const payload = Object.freeze({ operation: "CASE_CONFIGURATION_SAVE", requestId: requestId(input.requestId), expectedRevision: integer(input.expectedRevision), serviceSelectionRef: ref(input.serviceSelectionRef), serviceSelectionRevision: integer(input.serviceSelectionRevision, 1), packageVersionRef: ref(input.packageVersionRef, true), materialPolicyVersionRef: ref(input.materialPolicyVersionRef, true), surveyPublicationRef: ref(input.surveyPublicationRef, true), commercialAgreementRef: ref(input.commercialAgreementRef, true), preference: optionalRule(input.preference), duration: optionalRule(input.duration), source: choice(input.source, SOURCES), overrides: Object.freeze(input.overrides.map(override)) });
  return signed(input, payload);
}

export function normalizeConfigurationConflictResolve(input) {
  exact(input, ["requestId", "payloadHash", "expectedState", "resolutionCode", "selectedAuthorityRef"]);
  const payload = Object.freeze({
    operation: "CONFIGURATION_CONFLICT_RESOLVE",
    requestId: requestId(input.requestId),
    expectedState: choice(input.expectedState, new Set(["OPEN"])),
    resolutionCode: code(input.resolutionCode),
    selectedAuthorityRef: ref(input.selectedAuthorityRef),
  });
  return signed(input, payload);
}

export const SERVICE_PACKAGE_STATES = Object.freeze([...STATES]);
export const SERVICE_RESOURCE_CHARGES = Object.freeze([...CHARGES]);
