import { hashCrmServicesPayload, serviceFail, serviceRequestId } from "./crmServicesContract.js";

const ACTIONS = new Set(["SAVE_DRAFT", "ISSUE"]);
const HASH = /^[0-9a-f]{64}$/;

function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) serviceFail("EXECUTION_ORDER_INPUT_INVALID");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) serviceFail("EXECUTION_ORDER_INPUT_INVALID");
}

function text(value, maximum, { nullable = false } = {}) {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum
    || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) serviceFail("EXECUTION_ORDER_INPUT_INVALID");
  return value;
}

function instant(value, { nullable = false } = {}) {
  const normalized = text(value, 40, { nullable });
  if (normalized === null) return null;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) serviceFail("EXECUTION_ORDER_INPUT_INVALID");
  return normalized;
}

export function normalizeExecutionOrderCommand(input) {
  exact(input, ["requestId", "payloadHash", "action", "expectedVersion", "plannedStart", "plannedEnd", "contractEvidenceRef", "coordinatorName", "crewLeadName", "driverName", "vehicleName", "instructions"]);
  const action = text(input.action, 24);
  if (!ACTIONS.has(action) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) serviceFail("EXECUTION_ORDER_INPUT_INVALID");
  const plannedStart = instant(input.plannedStart);
  const plannedEnd = instant(input.plannedEnd);
  if (new Date(plannedEnd) <= new Date(plannedStart)) serviceFail("EXECUTION_ORDER_SCHEDULE_INVALID", 409);
  const payload = Object.freeze({
    operation: `EXECUTION_ORDER_${action}`,
    requestId: serviceRequestId(input.requestId),
    action,
    expectedVersion: input.expectedVersion,
    plannedStart,
    plannedEnd,
    contractEvidenceRef: text(input.contractEvidenceRef, 191, { nullable: action !== "ISSUE" }),
    coordinatorName: text(input.coordinatorName, 160, { nullable: true }),
    crewLeadName: text(input.crewLeadName, 160, { nullable: true }),
    driverName: text(input.driverName, 160, { nullable: true }),
    vehicleName: text(input.vehicleName, 160, { nullable: true }),
    instructions: text(input.instructions, 4000, { nullable: true }),
  });
  if (typeof input.payloadHash !== "string" || !HASH.test(input.payloadHash)
    || input.payloadHash !== hashCrmServicesPayload(payload)) serviceFail("CRM_SERVICES_PAYLOAD_HASH_INVALID");
  return Object.freeze({ ...payload, payloadHash: input.payloadHash });
}

