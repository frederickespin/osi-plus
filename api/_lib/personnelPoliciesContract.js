import { createHash } from "node:crypto";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_-]{0,79}$/;
const OPERATIONS = new Set([
  "CAPABILITY_CREATE",
  "PROFILE_UPDATE",
  "CAPABILITY_ASSIGN",
  "CAPABILITY_REVOKE",
  "ZONE_ASSIGN",
  "POLICY_PUBLISH",
  "SCHEDULE_OVERRIDE_CREATE",
  "VISIT_REASON_CREATE",
  "EXCEPTION_REQUEST",
  "EXCEPTION_RESPOND",
  "EXCEPTION_DECIDE",
  "REBOOK_VISIT",
  "CANCEL_VISIT",
  "RECORD_CLIENT_CONFIRMATION",
]);
const METHODS = new Set([
  "IN_PERSON",
  "VIRTUAL",
  "CLIENT_PHOTOS_DOCUMENTS",
  "WRITTEN_REPORT",
  "VOXME",
  "MINI",
]);
const OVERRIDE_KINDS = new Set(["AVAILABLE", "UNAVAILABLE", "TRAVEL_BUFFER"]);
const WINDOW_KINDS = new Set(["REGULAR", "SPECIAL_CLOSURE", "SPECIAL_OPENING"]);
const REASON_KINDS = new Set(["VISIT", "RESCHEDULE", "CANCELLATION"]);
const ORIGINS = new Set([
  "CLIENT",
  "EVALUATOR",
  "SALES",
  "ADMIN",
  "RESOURCE_CONFLICT",
  "OTHER",
]);
const RESPONSES = new Set([
  "ACCEPTED",
  "REJECTED",
  "UNAVAILABLE",
  "ALTERNATIVE_PROPOSED",
]);
const DECISIONS = new Set(["APPROVED", "REJECTED"]);
const CLIENT_CONFIRMATIONS = new Set([
  "NOT_CONFIRMED",
  "CONFIRMED",
  "CHANGE_REQUESTED",
  "CANCELLED_BY_CLIENT",
]);
const AVAILABILITY = new Set(["AVAILABLE", "LIMITED", "UNAVAILABLE"]);

export class PersonnelPoliciesError extends Error {
  constructor(code, status = 400, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = "PersonnelPoliciesError";
    this.code = code;
    this.status = status;
  }
}

export function personnelFail(code, status = 400, cause) {
  throw new PersonnelPoliciesError(code, status, cause);
}

export function canonicalPersonnelJson(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalPersonnelJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalPersonnelJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function personnelPayloadHash(value) {
  return createHash("sha256")
    .update(canonicalPersonnelJson(value), "utf8")
    .digest("hex");
}

function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return value;
}
function exact(value, keys) {
  const allowed = new Set(keys);
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    keys.some((key) => !(key in value))
  )
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
}
function text(value, max = 500, nullable = false) {
  if (nullable && (value === null || value === "")) return null;
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > max ||
    value.includes("\u0000")
  )
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return value;
}
function uuid(value) {
  const result = text(value, 36);
  if (!UUID_V4.test(result)) personnelFail("PERSONNEL_POLICIES_NOT_FOUND", 404);
  return result;
}
function enumeration(value, allowed) {
  const result = text(value, 80);
  if (!allowed.has(result)) personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return result;
}
function integer(value, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return value;
}
function bool(value) {
  if (typeof value !== "boolean")
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return value;
}
function instant(value, nullable = false) {
  if (nullable && value === null) return null;
  const result = text(value, 40);
  let normalized;
  try {
    normalized = new Date(result).toISOString();
  } catch {
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  }
  if (normalized !== result) personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return result;
}
function optionalUuid(value) {
  return value === null ? null : uuid(value);
}
function optionalInstant(value) {
  return value === null ? null : instant(value);
}
function optionalDate(value) {
  if (value === null) return null;
  const result = text(value, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(result) ||
    Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))
  )
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return result;
}
function interval(start, end) {
  const startsAt = instant(start);
  const endsAt = instant(end);
  if (new Date(endsAt) <= new Date(startsAt))
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return { startsAt, endsAt };
}
function safeJson(value, kind = "object") {
  if (
    kind === "object" &&
    (!value || typeof value !== "object" || Array.isArray(value))
  )
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  if (kind === "array" && !Array.isArray(value))
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  const serialized = canonicalPersonnelJson(value);
  if (serialized.length > 16_000)
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return JSON.parse(serialized);
}

function command(raw, operation, keys, normalize) {
  const value = object(raw);
  exact(value, ["operation", "requestId", "payloadHash", ...keys]);
  if (value.operation !== operation || !OPERATIONS.has(value.operation))
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  const requestId = text(value.requestId, 191);
  const payload = normalize(value);
  const computed = personnelPayloadHash({ operation, requestId, ...payload });
  if (!SHA256.test(value.payloadHash) || value.payloadHash !== computed)
    personnelFail("PERSONNEL_POLICIES_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({
    operation,
    requestId,
    payloadHash: value.payloadHash,
    ...payload,
  });
}

const normalizers = Object.freeze({
  PROFILE_UPDATE: (raw) =>
    command(
      raw,
      "PROFILE_UPDATE",
      [
        "profileRef",
        "jobTitle",
        "availabilityStatus",
        "restrictions",
        "notes",
        "validFrom",
        "validTo",
      ],
      (value) => ({
        profileRef: uuid(value.profileRef),
        jobTitle: text(value.jobTitle, 120, true),
        availabilityStatus: enumeration(value.availabilityStatus, AVAILABILITY),
        restrictions: safeJson(value.restrictions),
        notes: text(value.notes, 1000, true),
        validFrom: optionalInstant(value.validFrom),
        validTo: optionalInstant(value.validTo),
      }),
    ),
  CAPABILITY_CREATE: (raw) =>
    command(
      raw,
      "CAPABILITY_CREATE",
      ["code", "name", "description"],
      (value) => {
        const code = text(value.code, 80);
        if (!CODE.test(code)) personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
        return {
          code,
          name: text(value.name, 160),
          description: text(value.description, 500, true),
        };
      },
    ),
  CAPABILITY_ASSIGN: (raw) =>
    command(
      raw,
      "CAPABILITY_ASSIGN",
      ["profileRef", "capabilityRef", "restrictions", "validFrom", "validTo"],
      (value) => ({
        profileRef: uuid(value.profileRef),
        capabilityRef: uuid(value.capabilityRef),
        restrictions: safeJson(value.restrictions),
        validFrom: optionalInstant(value.validFrom),
        validTo: optionalInstant(value.validTo),
      }),
    ),
  CAPABILITY_REVOKE: (raw) =>
    command(raw, "CAPABILITY_REVOKE", ["assignmentRef", "reason"], (value) => ({
      assignmentRef: uuid(value.assignmentRef),
      reason: text(value.reason, 500),
    })),
  ZONE_ASSIGN: (raw) =>
    command(
      raw,
      "ZONE_ASSIGN",
      ["profileRef", "ruleRef", "validFrom", "validTo"],
      (value) => ({
        profileRef: uuid(value.profileRef),
        ruleRef: uuid(value.ruleRef),
        validFrom: optionalInstant(value.validFrom),
        validTo: optionalInstant(value.validTo),
      }),
    ),
  POLICY_PUBLISH: (raw) =>
    command(
      raw,
      "POLICY_PUBLISH",
      [
        "expectedVersion",
        "timezone",
        "defaultVisitMinutes",
        "minimumTravelBufferMinutes",
        "virtualPreparationMinutes",
        "validFrom",
        "windows",
      ],
      (value) => {
        const windows = safeJson(value.windows, "array");
        if (!windows.length || windows.length > 100)
          personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
        const normalized = windows.map((entry) => {
          exact(object(entry), [
            "weekday",
            "startMinute",
            "endMinute",
            "capacity",
            "method",
            "zoneRuleRef",
            "calendarDate",
            "requiresApproval",
            "kind",
          ]);
          return {
            weekday: integer(entry.weekday, 0, 6),
            startMinute: integer(entry.startMinute, 0, 1439),
            endMinute: integer(entry.endMinute, 1, 1440),
            capacity: integer(entry.capacity, 1, 100),
            method: enumeration(entry.method, METHODS),
            zoneRuleRef: optionalUuid(entry.zoneRuleRef),
            calendarDate: optionalDate(entry.calendarDate),
            requiresApproval: bool(entry.requiresApproval),
            kind: enumeration(entry.kind, WINDOW_KINDS),
          };
        });
        if (
          normalized.some((entry) => {
            if (entry.endMinute <= entry.startMinute) return true;
            if ((entry.kind === "REGULAR") !== (entry.calendarDate === null))
              return true;
            if (
              entry.calendarDate !== null &&
              new Date(`${entry.calendarDate}T00:00:00.000Z`).getUTCDay() !==
                entry.weekday
            )
              return true;
            return false;
          })
        )
          personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
        return {
          expectedVersion: integer(value.expectedVersion, 0),
          timezone: text(value.timezone, 64),
          defaultVisitMinutes: integer(value.defaultVisitMinutes, 15, 720),
          minimumTravelBufferMinutes: integer(
            value.minimumTravelBufferMinutes,
            0,
            720,
          ),
          virtualPreparationMinutes: integer(
            value.virtualPreparationMinutes,
            0,
            240,
          ),
          validFrom: instant(value.validFrom),
          windows: normalized,
        };
      },
    ),
  SCHEDULE_OVERRIDE_CREATE: (raw) =>
    command(
      raw,
      "SCHEDULE_OVERRIDE_CREATE",
      [
        "profileRef",
        "kind",
        "startsAt",
        "endsAt",
        "method",
        "zoneRuleRef",
        "travelBufferMinutes",
        "reason",
      ],
      (value) => {
        const period = interval(value.startsAt, value.endsAt);
        const kind = enumeration(value.kind, OVERRIDE_KINDS);
        const travelBufferMinutes =
          value.travelBufferMinutes === null
            ? null
            : integer(value.travelBufferMinutes, 0, 720);
        if ((kind === "TRAVEL_BUFFER") !== (travelBufferMinutes !== null))
          personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
        return {
          profileRef: uuid(value.profileRef),
          kind,
          ...period,
          method:
            value.method === null ? null : enumeration(value.method, METHODS),
          zoneRuleRef: optionalUuid(value.zoneRuleRef),
          travelBufferMinutes,
          reason: text(value.reason, 500),
        };
      },
    ),
  VISIT_REASON_CREATE: (raw) =>
    command(
      raw,
      "VISIT_REASON_CREATE",
      [
        "code",
        "name",
        "kind",
        "requesterOrigin",
        "visibleToClient",
        "visibleToEvaluator",
      ],
      (value) => {
        const code = text(value.code, 80);
        if (!CODE.test(code)) personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
        return {
          code,
          name: text(value.name, 160),
          kind: enumeration(value.kind, REASON_KINDS),
          requesterOrigin:
            value.requesterOrigin === null
              ? null
              : enumeration(value.requesterOrigin, ORIGINS),
          visibleToClient: bool(value.visibleToClient),
          visibleToEvaluator: bool(value.visibleToEvaluator),
        };
      },
    ),
  EXCEPTION_REQUEST: (raw) =>
    command(
      raw,
      "EXCEPTION_REQUEST",
      [
        "caseRef",
        "assignmentRef",
        "profileRef",
        "reasonRef",
        "method",
        "requestedStart",
        "requestedEnd",
        "requesterOrigin",
        "reasonDescription",
      ],
      (value) => {
        const period = interval(value.requestedStart, value.requestedEnd);
        return {
          caseRef: uuid(value.caseRef),
          assignmentRef: optionalUuid(value.assignmentRef),
          profileRef: uuid(value.profileRef),
          reasonRef: uuid(value.reasonRef),
          method: enumeration(value.method, METHODS),
          requestedStart: period.startsAt,
          requestedEnd: period.endsAt,
          requesterOrigin: enumeration(value.requesterOrigin, ORIGINS),
          reasonDescription: text(value.reasonDescription, 1000),
        };
      },
    ),
  EXCEPTION_RESPOND: (raw) =>
    command(
      raw,
      "EXCEPTION_RESPOND",
      [
        "requestRef",
        "expectedVersion",
        "response",
        "alternativeStart",
        "alternativeEnd",
        "reason",
      ],
      (value) => {
        const response = enumeration(value.response, RESPONSES);
        const hasAlternative =
          value.alternativeStart !== null || value.alternativeEnd !== null;
        if (
          (response === "ALTERNATIVE_PROPOSED") !== hasAlternative ||
          (hasAlternative &&
            (value.alternativeStart === null || value.alternativeEnd === null))
        )
          personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
        const alternative = hasAlternative
          ? interval(value.alternativeStart, value.alternativeEnd)
          : { startsAt: null, endsAt: null };
        return {
          requestRef: uuid(value.requestRef),
          expectedVersion: integer(value.expectedVersion, 1),
          response,
          alternativeStart: alternative.startsAt,
          alternativeEnd: alternative.endsAt,
          reason: text(value.reason, 1000, true),
        };
      },
    ),
  EXCEPTION_DECIDE: (raw) =>
    command(
      raw,
      "EXCEPTION_DECIDE",
      ["requestRef", "expectedVersion", "decision", "reason"],
      (value) => ({
        requestRef: uuid(value.requestRef),
        expectedVersion: integer(value.expectedVersion, 1),
        decision: enumeration(value.decision, DECISIONS),
        reason: text(value.reason, 1000),
      }),
    ),
  REBOOK_VISIT: (raw) =>
    command(
      raw,
      "REBOOK_VISIT",
      [
        "assignmentRef",
        "expectedVersion",
        "scheduledStart",
        "scheduledEnd",
        "reasonRef",
        "requesterOrigin",
        "reasonDescription",
      ],
      (value) => {
        const period = interval(value.scheduledStart, value.scheduledEnd);
        return {
          assignmentRef: uuid(value.assignmentRef),
          expectedVersion: integer(value.expectedVersion, 1),
          scheduledStart: period.startsAt,
          scheduledEnd: period.endsAt,
          reasonRef: uuid(value.reasonRef),
          requesterOrigin: enumeration(value.requesterOrigin, ORIGINS),
          reasonDescription: text(value.reasonDescription, 1000),
        };
      },
    ),
  CANCEL_VISIT: (raw) =>
    command(
      raw,
      "CANCEL_VISIT",
      [
        "assignmentRef",
        "expectedVersion",
        "reasonRef",
        "requesterOrigin",
        "reasonDescription",
      ],
      (value) => ({
        assignmentRef: uuid(value.assignmentRef),
        expectedVersion: integer(value.expectedVersion, 1),
        reasonRef: uuid(value.reasonRef),
        requesterOrigin: enumeration(value.requesterOrigin, ORIGINS),
        reasonDescription: text(value.reasonDescription, 1000),
      }),
    ),
  RECORD_CLIENT_CONFIRMATION: (raw) =>
    command(
      raw,
      "RECORD_CLIENT_CONFIRMATION",
      ["assignmentRef", "expectedVersion", "confirmation"],
      (value) => ({
        assignmentRef: uuid(value.assignmentRef),
        expectedVersion: integer(value.expectedVersion, 1),
        confirmation: enumeration(value.confirmation, CLIENT_CONFIRMATIONS),
      }),
    ),
});

export function normalizePersonnelPolicyMutation(raw) {
  const operation = object(raw).operation;
  if (typeof operation !== "string" || !normalizers[operation])
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return normalizers[operation](raw);
}

export function normalizePersonnelPoliciesQuery(raw = {}) {
  const value = object(raw);
  const allowed = new Set(["section", "date", "profileRef", "caseRef"]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    personnelFail("PERSONNEL_POLICIES_INPUT_INVALID");
  return Object.freeze({
    section:
      value.section === undefined
        ? "ALL"
        : enumeration(
            value.section,
            new Set(["ALL", "PERSONNEL", "POLICIES", "EXCEPTIONS"]),
          ),
    date: value.date === undefined ? null : text(value.date, 10),
    profileRef: value.profileRef === undefined ? null : uuid(value.profileRef),
    caseRef: value.caseRef === undefined ? null : uuid(value.caseRef),
  });
}

export const PERSONNEL_POLICY_OPERATIONS = Object.freeze([...OPERATIONS]);
export const PERSONNEL_POLICY_PRECEDENCE = Object.freeze([
  "EMPLOYEE_OVERRIDE",
  "APPROVED_EXCEPTION",
  "TENANT_POLICY",
  "FAIL_CLOSED",
]);
