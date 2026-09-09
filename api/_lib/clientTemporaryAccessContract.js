import { createHash } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PURPOSES = new Set(["VISIT", "INFORMATION_REQUEST", "MINI_SURVEY"]);
const SCOPES = new Set([
  "VISIT_VIEW",
  "VISIT_CONFIRM",
  "VISIT_CHANGE_REQUEST",
  "VISIT_CANCEL_REQUEST",
  "VISIT_QR_CONFIRM",
  "SURVEY_INFO_VIEW",
  "SURVEY_INFO_UPLOAD",
  "MINI_SURVEY_EDIT",
]);
const ACTIONS = new Set(["VISIT_CONFIRM", "VISIT_CHANGE_REQUEST", "VISIT_CANCEL_REQUEST"]);
const DOCUMENT_TYPES = new Set(["INVENTORY_LIST", "ACCESS_PLAN", "PROPERTY_DOCUMENT", "OTHER_AUTHORIZED"]);

export class ClientTemporaryAccessError extends Error {
  constructor(code, status = 400, options) {
    super(code, options);
    this.name = "ClientTemporaryAccessError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new ClientTemporaryAccessError(code, status);
}

function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail("CLIENT_TEMPORARY_INPUT_INVALID");
}

function text(value, maximum, { nullable = false, minimum = 1 } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < minimum || value.length > maximum || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return value;
}

function ref(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !UUID_V4.test(value)) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
  return value;
}

function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return value;
}

function choice(value, allowed) {
  const result = text(value, 80);
  if (!allowed.has(result)) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return result;
}

function instant(value) {
  const result = text(value, 40);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== result) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return result;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

export function clientTemporaryPayloadHash(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function requestId(value) {
  const result = text(value, 191, { minimum: 8 });
  if (!REQUEST_ID.test(result)) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return result;
}

function signed(input, payload) {
  if (typeof input.payloadHash !== "string" || !SHA256.test(input.payloadHash) || input.payloadHash !== clientTemporaryPayloadHash(payload)) fail("CLIENT_TEMPORARY_PAYLOAD_HASH_INVALID");
  return Object.freeze({ ...payload, payloadHash: input.payloadHash });
}

export function normalizeCreateTemporaryAccess(input) {
  exact(input, ["requestId", "payloadHash", "caseRef", "assignmentRef", "contactRef", "communicationRef", "purpose", "scopes", "expiresAt", "maxUses", "shortCodeEnabled"]);
  if (!Array.isArray(input.scopes) || input.scopes.length < 1 || input.scopes.length > SCOPES.size) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  const scopes = input.scopes.map((scope) => choice(scope, SCOPES));
  if (new Set(scopes).size !== scopes.length) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  const payload = Object.freeze({
    operation: "ACCESS_CREATE",
    requestId: requestId(input.requestId),
    caseRef: ref(input.caseRef),
    assignmentRef: ref(input.assignmentRef, true),
    contactRef: ref(input.contactRef),
    communicationRef: ref(input.communicationRef, true),
    purpose: choice(input.purpose, PURPOSES),
    scopes: Object.freeze([...scopes].sort()),
    expiresAt: instant(input.expiresAt),
    maxUses: integer(input.maxUses, 1, 1000),
    shortCodeEnabled: input.shortCodeEnabled === true,
  });
  if (input.shortCodeEnabled !== true && input.shortCodeEnabled !== false) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  if (payload.purpose === "VISIT" && (!payload.assignmentRef || !payload.scopes.includes("VISIT_VIEW"))) fail("CLIENT_TEMPORARY_SCOPE_INVALID", 409);
  if (payload.purpose === "MINI_SURVEY" && (!payload.assignmentRef || !payload.scopes.includes("MINI_SURVEY_EDIT"))) fail("CLIENT_TEMPORARY_SCOPE_INVALID", 409);
  if (payload.scopes.some((scope) => scope.startsWith("VISIT_")) && !payload.assignmentRef) fail("CLIENT_TEMPORARY_SCOPE_INVALID", 409);
  return signed(input, payload);
}

export function normalizeRevokeTemporaryAccess(input) {
  exact(input, ["requestId", "payloadHash", "expectedVersion", "reason"]);
  const payload = Object.freeze({ operation: "ACCESS_REVOKE", requestId: requestId(input.requestId), expectedVersion: integer(input.expectedVersion, 1, 1_000_000), reason: text(input.reason, 500) });
  return signed(input, payload);
}

export function normalizeClientVisitAction(input) {
  exact(input, ["requestId", "payloadHash", "action", "expectedVersion", "reasonRef", "comment", "suggestedAvailability"]);
  if (!Array.isArray(input.suggestedAvailability) || input.suggestedAvailability.length > 3) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  const availability = input.suggestedAvailability.map((entry) => instant(entry));
  const payload = Object.freeze({ operation: choice(input.action, ACTIONS), requestId: requestId(input.requestId), expectedVersion: integer(input.expectedVersion, 0, 1_000_000), reasonRef: ref(input.reasonRef, true), comment: text(input.comment, 1000, { nullable: true }), suggestedAvailability: Object.freeze(availability) });
  if (payload.operation === "VISIT_CHANGE_REQUEST" && !payload.reasonRef) fail("CLIENT_TEMPORARY_REASON_REQUIRED", 409);
  if (payload.operation !== "VISIT_CHANGE_REQUEST" && payload.suggestedAvailability.length) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return signed(input, payload);
}

function measurements(value) {
  if (value === null) return null;
  exact(value, ["length", "width", "height", "unit"]);
  const result = { length: Number(value.length), width: Number(value.width), height: Number(value.height), unit: choice(value.unit, new Set(["CM", "IN"])) };
  if (![result.length, result.width, result.height].every((part) => Number.isFinite(part) && part > 0 && part <= 100000)) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return Object.freeze(result);
}

export function normalizeMiniSurvey(input) {
  exact(input, ["requestId", "payloadHash", "expectedVersion", "submit", "notes", "items"]);
  if (!Array.isArray(input.items) || input.items.length < 1) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  if (input.items.length > 10) fail("CLIENT_TEMPORARY_MINI_REQUIRES_DETAILED_SURVEY", 409);
  const items = input.items.map((item) => {
    exact(item, ["articleRef", "quantity", "measurements", "notes"]);
    return Object.freeze({ articleRef: ref(item.articleRef), quantity: integer(item.quantity, 1, 10000), measurements: measurements(item.measurements), notes: text(item.notes, 1000, { nullable: true }) });
  });
  if (new Set(items.map((item) => item.articleRef)).size !== items.length) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  const payload = Object.freeze({ operation: input.submit === true ? "MINI_SURVEY_COMPLETE" : "MINI_SURVEY_SAVE", requestId: requestId(input.requestId), expectedVersion: integer(input.expectedVersion, 0, 1_000_000), submit: input.submit === true, notes: text(input.notes, 2000, { nullable: true }), items: Object.freeze(items) });
  if (input.submit !== true && input.submit !== false) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return signed(input, payload);
}

export function normalizeQrConfirmation(input) {
  exact(input, ["requestId", "payloadHash", "qrPayload"]);
  const payload = Object.freeze({ operation: "QR_CONFIRM", requestId: requestId(input.requestId), qrPayload: text(input.qrPayload, 160) });
  return signed(input, payload);
}

export function normalizeUploadMetadata(input) {
  exact(input, ["requestId", "payloadHash", "category", "documentType", "mimeType", "sizeBytes", "sha256"]);
  const category = choice(input.category, new Set(["PHOTO", "DOCUMENT"]));
  const documentType = input.documentType === null ? null : choice(input.documentType, DOCUMENT_TYPES);
  const payload = Object.freeze({ operation: "SURVEY_ASSET_UPLOAD", requestId: requestId(input.requestId), category, documentType, mimeType: text(input.mimeType, 100), sizeBytes: integer(input.sizeBytes, 1, 12 * 1024 * 1024), sha256: text(input.sha256, 64) });
  if (!SHA256.test(payload.sha256) || (category === "PHOTO") !== (documentType === null)) fail("CLIENT_TEMPORARY_INPUT_INVALID");
  return signed(input, payload);
}

export function assertTemporaryToken(value) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
  return value;
}

export function assertAccessRef(value) { return ref(value); }
export const CLIENT_TEMPORARY_SCOPES = Object.freeze([...SCOPES]);
