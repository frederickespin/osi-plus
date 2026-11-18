import { hashCrmServicesPayload, serviceFail, serviceRequestId } from "./crmServicesContract.js";

const ACTIONS = new Set(["SAVE_DRAFT", "SEND_TO_CLIENT", "RECORD_CLIENT_ACCEPTANCE", "APPROVE_INTERNAL", "AUTHORIZE_EMERGENCY", "MARK_EXECUTED", "REJECT", "CANCEL"]);
const CLASSES = new Set(["NO_COST", "ECONOMIC_OR_TERM", "EMERGENCY"]);
const KINDS = new Set(["ADDED", "MODIFIED", "REMOVED"]);
const REQUESTERS = new Set(["CLIENT", "COORDINATION", "OPERATIONS", "THIRD_PARTY"]);
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
}

function text(value, maximum, { nullable = false, minimum = 1 } = {}) {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < minimum || value.length > maximum
    || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
  return value;
}

function oneOf(value, values) {
  const normalized = text(value, 80);
  if (!values.has(normalized)) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
  return normalized;
}

function decimal(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999_999_999.99) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
  return Math.round(value * 100) / 100;
}

function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
  return value;
}

export function normalizeChangeAddendumCommand(input) {
  const keys = ["requestId", "payloadHash", "action", "expectedWorkspaceVersion", "changeRef", "expectedChangeVersion", "changeClass", "changeKind", "requestedBy", "serviceCode", "serviceName", "reason", "quantity", "unit", "catalogAmount", "adjustedAmount", "currency", "adjustmentReason", "scheduleDays", "operationalImpact", "evidenceRef"];
  exact(input, keys);
  const action = oneOf(input.action, ACTIONS);
  const changeRef = text(input.changeRef, 36, { nullable: true });
  if (changeRef !== null && !UUID.test(changeRef)) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
  const payload = Object.freeze({
    operation: `CHANGE_ADDENDUM_${action}`,
    requestId: serviceRequestId(input.requestId),
    action,
    expectedWorkspaceVersion: integer(input.expectedWorkspaceVersion),
    changeRef,
    expectedChangeVersion: integer(input.expectedChangeVersion),
    changeClass: input.changeClass === null ? null : oneOf(input.changeClass, CLASSES),
    changeKind: input.changeKind === null ? null : oneOf(input.changeKind, KINDS),
    requestedBy: input.requestedBy === null ? null : oneOf(input.requestedBy, REQUESTERS),
    serviceCode: text(input.serviceCode, 80, { nullable: true }),
    serviceName: text(input.serviceName, 200, { nullable: true }),
    reason: text(input.reason, 2000, { nullable: true }),
    quantity: decimal(input.quantity, { nullable: true }),
    unit: text(input.unit, 40, { nullable: true }),
    catalogAmount: decimal(input.catalogAmount, { nullable: true }),
    adjustedAmount: decimal(input.adjustedAmount, { nullable: true }),
    currency: text(input.currency, 3, { nullable: true }),
    adjustmentReason: text(input.adjustmentReason, 1000, { nullable: true }),
    scheduleDays: integer(input.scheduleDays),
    operationalImpact: text(input.operationalImpact, 2000, { nullable: true }),
    evidenceRef: text(input.evidenceRef, 191, { nullable: true }),
  });
  if (action === "SAVE_DRAFT") {
    if (!payload.changeClass || !payload.changeKind || !payload.requestedBy || !payload.serviceName || !payload.reason) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
    if (payload.changeClass === "NO_COST" && ((payload.catalogAmount || 0) !== 0 || (payload.adjustedAmount || 0) !== 0)) serviceFail("CHANGE_ADDENDUM_NO_COST_INVALID", 409);
    if (payload.changeClass !== "NO_COST" && payload.adjustedAmount === null) serviceFail("CHANGE_ADDENDUM_AMOUNT_REQUIRED", 409);
    if (payload.catalogAmount !== payload.adjustedAmount && !payload.adjustmentReason) serviceFail("CHANGE_ADDENDUM_ADJUSTMENT_REASON_REQUIRED", 409);
  } else if (!payload.changeRef || payload.expectedChangeVersion < 1) serviceFail("CHANGE_ADDENDUM_INPUT_INVALID");
  if (typeof input.payloadHash !== "string" || !HASH.test(input.payloadHash)
    || input.payloadHash !== hashCrmServicesPayload(payload)) serviceFail("CRM_SERVICES_PAYLOAD_HASH_INVALID");
  return Object.freeze({ ...payload, payloadHash: input.payloadHash });
}

export const CHANGE_ADDENDUM_ACTIONS = Object.freeze([...ACTIONS]);
