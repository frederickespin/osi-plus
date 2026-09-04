import { createHash } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const HASH = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const MODES = new Set(["LOCAL", "EXPORT", "IMPORT"]);
const USAGES = new Set(["PRIMARY", "COMPLEMENTARY", "BOTH"]);
const STATUSES = new Set(["ACTIVE", "INACTIVE"]);

export class CrmServicesError extends Error {
  constructor(code, status = 400, options = {}) {
    super(code, options.cause ? { cause: options.cause } : undefined);
    this.name = "CrmServicesError";
    this.code = code;
    this.status = status;
  }
}

export function serviceFail(code, status = 400) { throw new CrmServicesError(code, status); }
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) serviceFail("CRM_SERVICES_INPUT_INVALID");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) serviceFail("CRM_SERVICES_INPUT_INVALID");
}
function text(value, max, min = 1) {
  if (typeof value !== "string" || value !== value.trim() || value.length < min || value.length > max
    || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) serviceFail("CRM_SERVICES_INPUT_INVALID");
  return value;
}
function nullableText(value, max) { return value === null ? null : text(value, max); }
function integer(value, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) serviceFail("CRM_SERVICES_INPUT_INVALID");
  return value;
}
function bool(value) { if (typeof value !== "boolean") serviceFail("CRM_SERVICES_INPUT_INVALID"); return value; }
function oneOf(value, values) { const result = text(value, 80); if (!values.has(result)) serviceFail("CRM_SERVICES_INPUT_INVALID"); return result; }
export function serviceRef(value) { if (typeof value !== "string" || !UUID_V4.test(value)) serviceFail("CRM_SERVICES_RESOURCE_NOT_FOUND", 404); return value; }
export function serviceRequestId(value) { const result = text(value, 191, 8); if (!REQUEST_ID.test(result)) serviceFail("CRM_SERVICES_INPUT_INVALID"); return result; }
function refs(value, maximum = 100) {
  if (!Array.isArray(value) || value.length > maximum) serviceFail("CRM_SERVICES_INPUT_INVALID");
  const normalized = value.map(serviceRef);
  if (new Set(normalized).size !== normalized.length) serviceFail("CRM_SERVICES_DUPLICATE_SELECTION", 409);
  return Object.freeze(normalized);
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
export function hashCrmServicesPayload(value) { return createHash("sha256").update(canonical(value), "utf8").digest("hex"); }
function signed(input, payload) {
  if (typeof input.payloadHash !== "string" || !HASH.test(input.payloadHash)
    || input.payloadHash !== hashCrmServicesPayload(payload)) serviceFail("CRM_SERVICES_PAYLOAD_HASH_INVALID");
  return Object.freeze({ ...payload, payloadHash: input.payloadHash });
}

export function normalizeServiceCatalogCreate(input) {
  exact(input, ["requestId", "payloadHash", "code", "name", "category", "usage", "compatibleModes", "sortOrder", "allowedComplementaryRefs"]);
  const usage = oneOf(input.usage, USAGES);
  const compatibleModes = [...new Set((Array.isArray(input.compatibleModes) ? input.compatibleModes : []).map((mode) => oneOf(mode, MODES)))].sort();
  if (usage !== "COMPLEMENTARY" && compatibleModes.length === 0) serviceFail("CRM_SERVICES_MODE_REQUIRED");
  const payload = Object.freeze({ operation: "CATALOG_CREATE", requestId: serviceRequestId(input.requestId), code: oneOf(input.code, { has: (v) => CODE.test(v) }), name: text(input.name, 160), category: nullableText(input.category, 80), usage, compatibleModes: Object.freeze(compatibleModes), sortOrder: integer(input.sortOrder), allowedComplementaryRefs: refs(input.allowedComplementaryRefs) });
  return signed(input, payload);
}

export function normalizeServiceCatalogUpdate(input) {
  exact(input, ["requestId", "payloadHash", "expectedVersion", "name", "category", "usage", "compatibleModes", "status", "sortOrder", "allowedComplementaryRefs"]);
  const usage = oneOf(input.usage, USAGES);
  const compatibleModes = [...new Set((Array.isArray(input.compatibleModes) ? input.compatibleModes : []).map((mode) => oneOf(mode, MODES)))].sort();
  if (usage !== "COMPLEMENTARY" && compatibleModes.length === 0) serviceFail("CRM_SERVICES_MODE_REQUIRED");
  const payload = Object.freeze({ operation: "CATALOG_UPDATE", requestId: serviceRequestId(input.requestId), expectedVersion: integer(input.expectedVersion, 1), name: text(input.name, 160), category: nullableText(input.category, 80), usage, compatibleModes: Object.freeze(compatibleModes), status: oneOf(input.status, STATUSES), sortOrder: integer(input.sortOrder), allowedComplementaryRefs: refs(input.allowedComplementaryRefs) });
  return signed(input, payload);
}

export function normalizeServiceDefaults(input) {
  exact(input, ["requestId", "payloadHash", "primaryServiceRef", "combinationRef", "code", "name", "isDefault", "status", "expectedVersion", "complementaryRefs"]);
  const payload = Object.freeze({ operation: "DEFAULTS_SAVE", requestId: serviceRequestId(input.requestId), primaryServiceRef: serviceRef(input.primaryServiceRef), combinationRef: input.combinationRef === null ? null : serviceRef(input.combinationRef), code: oneOf(input.code, { has: (v) => CODE.test(v) }), name: text(input.name, 160), isDefault: bool(input.isDefault), status: oneOf(input.status, STATUSES), expectedVersion: input.expectedVersion === null ? null : integer(input.expectedVersion, 1), complementaryRefs: refs(input.complementaryRefs) });
  return signed(input, payload);
}

export function normalizeCaseServiceSelection(input) {
  exact(input, ["requestId", "payloadHash", "expectedRevision", "primaryServiceRef", "complementaryRefs", "defaultCombinationRef", "otherServices"]);
  if (!Array.isArray(input.otherServices) || input.otherServices.length > 8) serviceFail("CRM_SERVICES_INPUT_INVALID");
  const otherServices = input.otherServices.map((value) => {
    exact(value, ["description"]);
    return Object.freeze({ description: text(value.description, 320, 3) });
  });
  const payload = Object.freeze({ operation: "CASE_SELECTION_SAVE", requestId: serviceRequestId(input.requestId), expectedRevision: integer(input.expectedRevision), primaryServiceRef: serviceRef(input.primaryServiceRef), complementaryRefs: refs(input.complementaryRefs), defaultCombinationRef: input.defaultCombinationRef === null ? null : serviceRef(input.defaultCombinationRef), otherServices: Object.freeze(otherServices) });
  return signed(input, payload);
}

export const CRM_SERVICE_MODES = Object.freeze([...MODES]);
