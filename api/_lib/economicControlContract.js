import { hashCrmServicesPayload, serviceFail, serviceRequestId } from "./crmServicesContract.js";

const ACTIONS = new Set(["SAVE_DRAFT", "MARK_READY", "RECORD_INVOICE", "CLOSE"]);
const THIRD_PARTY = new Set(["PENDING", "NONE", "CONFIRMED"]);
const COLLECTION = new Set(["NOT_VALIDATED", "PENDING", "PARTIAL", "CURRENT", "EXEMPTED"]);
const HASH = /^[0-9a-f]{64}$/;

function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) serviceFail("ECONOMIC_CONTROL_INPUT_INVALID");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) serviceFail("ECONOMIC_CONTROL_INPUT_INVALID");
}

function text(value, maximum, nullable = true) {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum
    || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) serviceFail("ECONOMIC_CONTROL_INPUT_INVALID");
  return value;
}

function oneOf(value, values) {
  const normalized = text(value, 40, false);
  if (!values.has(normalized)) serviceFail("ECONOMIC_CONTROL_INPUT_INVALID");
  return normalized;
}

function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0) serviceFail("ECONOMIC_CONTROL_INPUT_INVALID");
  return value;
}

export function normalizeEconomicControlCommand(input) {
  const keys = ["requestId", "payloadHash", "action", "expectedVersion", "billingEvidenceRef", "completionEvidenceRef", "thirdPartyCostsStatus", "thirdPartyEvidenceRef", "collectionState", "collectionEvidenceRef", "invoiceRef", "notes"];
  exact(input, keys);
  const action = oneOf(input.action, ACTIONS);
  const payload = Object.freeze({
    operation: `ECONOMIC_CONTROL_${action}`,
    requestId: serviceRequestId(input.requestId),
    action,
    expectedVersion: integer(input.expectedVersion),
    billingEvidenceRef: text(input.billingEvidenceRef, 191),
    completionEvidenceRef: text(input.completionEvidenceRef, 191),
    thirdPartyCostsStatus: oneOf(input.thirdPartyCostsStatus, THIRD_PARTY),
    thirdPartyEvidenceRef: text(input.thirdPartyEvidenceRef, 191),
    collectionState: oneOf(input.collectionState, COLLECTION),
    collectionEvidenceRef: text(input.collectionEvidenceRef, 191),
    invoiceRef: text(input.invoiceRef, 191),
    notes: text(input.notes, 2000),
  });
  if (payload.thirdPartyCostsStatus === "CONFIRMED" && !payload.thirdPartyEvidenceRef) serviceFail("ECONOMIC_CONTROL_THIRD_PARTY_EVIDENCE_REQUIRED", 409);
  if (["PARTIAL", "CURRENT", "EXEMPTED"].includes(payload.collectionState) && !payload.collectionEvidenceRef) serviceFail("ECONOMIC_CONTROL_COLLECTION_EVIDENCE_REQUIRED", 409);
  if (action === "RECORD_INVOICE" && !payload.invoiceRef) serviceFail("ECONOMIC_CONTROL_INVOICE_REFERENCE_REQUIRED", 409);
  if (typeof input.payloadHash !== "string" || !HASH.test(input.payloadHash)
    || input.payloadHash !== hashCrmServicesPayload(payload)) serviceFail("CRM_SERVICES_PAYLOAD_HASH_INVALID");
  return Object.freeze({ ...payload, payloadHash: input.payloadHash });
}

export const ECONOMIC_CONTROL_ACTIONS = Object.freeze([...ACTIONS]);
