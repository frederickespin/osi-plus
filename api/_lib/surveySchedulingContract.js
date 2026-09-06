import crypto from "node:crypto";

import { CrmSurveyError } from "./crmSurveyContract.js";

export const SURVEY_SCHEDULING_PERMISSIONS = Object.freeze({
  VIEW: "survey:schedule:view",
  MANAGE: "survey:schedule:manage",
  ASSIGN: "survey:schedule:assign",
  RESCHEDULE: "survey:schedule:reschedule",
  FEE_VIEW: "survey:visit-fee:view",
  FEE_APPROVE: "survey:visit-fee:approve",
});

export const SURVEY_OPERATIONAL_CAPABILITIES = Object.freeze({
  IN_PERSON: "CAN_PERFORM_IN_PERSON_SURVEY",
  VIRTUAL: "CAN_PERFORM_VIRTUAL_SURVEY",
  OUT_OF_AREA: "CAN_PERFORM_OUT_OF_AREA_VISIT",
  FEE_APPROVE: "CAN_APPROVE_VISIT_FEE",
  PUBLISH: "CAN_PUBLISH_SURVEY",
});

export const HISTORICAL_POLICY_TEMPLATE = Object.freeze({
  schemaVersion: 1,
  profiles: Object.freeze([
    Object.freeze({ code: "METRO", zoneType: "METRO", maxDistanceKm: null, dailyCapacity: 2 }),
    Object.freeze({ code: "INTERIOR_SHORT", zoneType: "INTERIOR", maxDistanceKm: 30, dailyCapacity: 2 }),
    Object.freeze({ code: "INTERIOR_LONG", zoneType: "INTERIOR", minDistanceExclusiveKm: 30, dailyCapacity: 1 }),
  ]),
  slots: Object.freeze([
    Object.freeze({ profile: "METRO", key: "MORNING", label: "Mañana", startTime: "09:00", endTime: "12:00", capacity: 1 }),
    Object.freeze({ profile: "METRO", key: "AFTERNOON", label: "Tarde", startTime: "14:00", endTime: "16:30", capacity: 1 }),
    Object.freeze({ profile: "INTERIOR_SHORT", key: "MORNING", label: "Mañana", startTime: "08:00", endTime: "12:00", capacity: 1 }),
    Object.freeze({ profile: "INTERIOR_SHORT", key: "AFTERNOON", label: "Tarde", startTime: "13:00", endTime: "17:00", capacity: 1 }),
    Object.freeze({ profile: "INTERIOR_LONG", key: "MORNING", label: "Mañana", startTime: "08:00", endTime: "12:00", capacity: 1 }),
    Object.freeze({ profile: "INTERIOR_LONG", key: "AFTERNOON", label: "Tarde", startTime: "13:00", endTime: "17:00", capacity: 1 }),
  ]),
  closedWeekdays: Object.freeze([0]),
  closedDates: Object.freeze([]),
  saturdayRequiresApproval: true,
  freeZoneCodes: Object.freeze([]),
  evaluatorCapabilities: Object.freeze([]),
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const METHODS = new Set(["IN_PERSON", "VIRTUAL", "CLIENT_PHOTOS_DOCUMENTS", "WRITTEN_REPORT", "VOXME", "MINI", "NONE"]);
const STATES = new Set(["NOT_REQUIRED", "PENDING_METHOD", "WAITING_CLIENT_INFO", "READY_TO_SCHEDULE", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
const SOURCES = new Set(["CLIENT", "EVALUATOR", "COMMERCIAL", "VOXME", "MINI"]);
const PROFILES = new Set(["METRO", "INTERIOR_SHORT", "INTERIOR_LONG", "CUSTOM"]);
const CAPABILITIES = new Set(Object.values(SURVEY_OPERATIONAL_CAPABILITIES));

export function schedulingFail(code, status = 400) {
  throw new CrmSurveyError(code, status);
}
export function schedulingCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(schedulingCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${schedulingCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function schedulingHash(value) {
  return crypto.createHash("sha256").update(schedulingCanonicalJson(value)).digest("hex");
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
  return value;
}
function exact(value, keys) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
}
function text(value, max, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > max) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
  return value;
}
function uuid(value, optional = false) {
  const result = text(value, 36, optional);
  if (result === null) return null;
  if (!UUID_V4.test(result)) schedulingFail("CRM_SURVEY_SCHEDULING_REFERENCE_INVALID");
  return result;
}
function integer(value, min = 0, max = 1_000_000) {
  if (!Number.isInteger(value) || value < min || value > max) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
  return value;
}
function enumValue(value, allowed) {
  const result = text(value, 64);
  if (!allowed.has(result)) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
  return result;
}
function timestamp(value) {
  const result = text(value, 40);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== result) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
  return result;
}
function boolean(value) {
  if (typeof value !== "boolean") schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
  return value;
}
function command(value, operation, payload) {
  const requestId = uuid(value.requestId);
  const payloadHash = text(value.payloadHash, 64);
  if (!SHA256.test(payloadHash) || payloadHash !== schedulingHash({ operation, requestId, ...payload })) schedulingFail("CRM_SURVEY_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation, requestId, payloadHash, ...payload });
}

function validateMethodState(method, state) {
  if (["NOT_REQUIRED", "PENDING_METHOD"].includes(state) && method !== "NONE") schedulingFail("CRM_SURVEY_METHOD_STATE_INVALID", 409);
  if (method === "NONE" && !["NOT_REQUIRED", "PENDING_METHOD", "CANCELLED"].includes(state)) schedulingFail("CRM_SURVEY_METHOD_STATE_INVALID", 409);
  if (method !== "IN_PERSON" && state === "READY_TO_SCHEDULE") schedulingFail("CRM_SURVEY_METHOD_STATE_INVALID", 409);
}

function normalizePolicyConfiguration(raw) {
  const value = object(raw);
  exact(value, ["schemaVersion", "profiles", "slots", "closedWeekdays", "closedDates", "saturdayRequiresApproval", "freeZoneCodes", "evaluatorCapabilities"]);
  if (value.schemaVersion !== 1 || !Array.isArray(value.profiles) || !value.profiles.length || !Array.isArray(value.slots) || !value.slots.length || !Array.isArray(value.closedWeekdays) || !Array.isArray(value.closedDates) || !Array.isArray(value.freeZoneCodes) || !Array.isArray(value.evaluatorCapabilities)) schedulingFail("CRM_SURVEY_POLICY_INVALID");
  const profiles = value.profiles.map((rawProfile) => {
    const profile = object(rawProfile);
    exact(profile, ["code", "zoneType", "minDistanceExclusiveKm", "maxDistanceKm", "dailyCapacity"]);
    const codeValue = enumValue(profile.code, PROFILES);
    const zoneType = text(profile.zoneType, 64);
    const minDistanceExclusiveKm = profile.minDistanceExclusiveKm == null ? null : Number(profile.minDistanceExclusiveKm);
    const maxDistanceKm = profile.maxDistanceKm == null ? null : Number(profile.maxDistanceKm);
    if ((minDistanceExclusiveKm != null && (!Number.isFinite(minDistanceExclusiveKm) || minDistanceExclusiveKm < 0)) || (maxDistanceKm != null && (!Number.isFinite(maxDistanceKm) || maxDistanceKm < 0))) schedulingFail("CRM_SURVEY_POLICY_INVALID");
    return Object.freeze({ code: codeValue, zoneType, minDistanceExclusiveKm, maxDistanceKm, dailyCapacity: integer(profile.dailyCapacity, 1, 100) });
  });
  if (new Set(profiles.map((entry) => entry.code)).size !== profiles.length) schedulingFail("CRM_SURVEY_POLICY_INVALID");
  const profileCodes = new Set(profiles.map((entry) => entry.code));
  const slots = value.slots.map((rawSlot) => {
    const slot = object(rawSlot);
    exact(slot, ["profile", "key", "label", "startTime", "endTime", "capacity"]);
    const profile = enumValue(slot.profile, PROFILES);
    const key = text(slot.key, 64);
    const startTime = text(slot.startTime, 5);
    const endTime = text(slot.endTime, 5);
    if (!profileCodes.has(profile) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) schedulingFail("CRM_SURVEY_POLICY_INVALID");
    return Object.freeze({ profile, key, label: text(slot.label, 80), startTime, endTime, capacity: integer(slot.capacity, 1, 100) });
  });
  if (new Set(slots.map((entry) => `${entry.profile}:${entry.key}`)).size !== slots.length) schedulingFail("CRM_SURVEY_POLICY_INVALID");
  const closedWeekdays = value.closedWeekdays.map((day) => integer(day, 0, 6));
  const closedDates = value.closedDates.map((date) => {
    const result = text(date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) schedulingFail("CRM_SURVEY_POLICY_INVALID");
    return result;
  });
  const evaluatorCapabilities = value.evaluatorCapabilities.map((rawCapability) => {
    const entry = object(rawCapability);
    exact(entry, ["membershipRef", "capabilities"]);
    if (!Array.isArray(entry.capabilities) || !entry.capabilities.length) schedulingFail("CRM_SURVEY_POLICY_INVALID");
    const capabilities = [...new Set(entry.capabilities.map((capability) => enumValue(capability, CAPABILITIES)))].sort();
    return Object.freeze({ membershipRef: uuid(entry.membershipRef), capabilities: Object.freeze(capabilities) });
  });
  if (new Set(evaluatorCapabilities.map((entry) => entry.membershipRef)).size !== evaluatorCapabilities.length) schedulingFail("CRM_SURVEY_POLICY_INVALID");
  return Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze(profiles),
    slots: Object.freeze(slots),
    closedWeekdays: Object.freeze([...new Set(closedWeekdays)].sort()),
    closedDates: Object.freeze([...new Set(closedDates)].sort()),
    saturdayRequiresApproval: boolean(value.saturdayRequiresApproval),
    freeZoneCodes: Object.freeze([...new Set(value.freeZoneCodes.map((item) => text(item, 64)))].sort()),
    evaluatorCapabilities: Object.freeze(evaluatorCapabilities),
  });
}

export function resolveScheduleProfile(configuration, zoneType, distanceKm) {
  const zone = text(zoneType, 64);
  const distance = distanceKm == null ? null : Number(distanceKm);
  const candidates = configuration.profiles.filter((profile) => profile.zoneType === zone && (profile.minDistanceExclusiveKm == null || (distance != null && distance > profile.minDistanceExclusiveKm)) && (profile.maxDistanceKm == null || (distance != null && distance <= profile.maxDistanceKm)));
  if (candidates.length !== 1) schedulingFail("CRM_SURVEY_ZONE_UNRESOLVED", 409);
  return candidates[0];
}

export function resolveOperationalCapability(configuration, membershipRef, method, profile) {
  const entry = configuration.evaluatorCapabilities.find((candidate) => candidate.membershipRef === membershipRef);
  if (!entry) return false;
  const required = method === "IN_PERSON" ? SURVEY_OPERATIONAL_CAPABILITIES.IN_PERSON : SURVEY_OPERATIONAL_CAPABILITIES.VIRTUAL;
  if (!entry.capabilities.includes(required)) return false;
  return profile !== "INTERIOR_SHORT" && profile !== "INTERIOR_LONG" || entry.capabilities.includes(SURVEY_OPERATIONAL_CAPABILITIES.OUT_OF_AREA);
}

export function resolveSlotAvailability(configuration, { profile, date, slotKey, dayCount, slotCount, saturdayApproved = false }) {
  const day = new Date(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(day.valueOf())) schedulingFail("CRM_SURVEY_SLOT_INVALID");
  if (configuration.closedDates.includes(date) || configuration.closedWeekdays.includes(day.getUTCDay())) schedulingFail("CRM_SURVEY_DAY_CLOSED", 409);
  if (day.getUTCDay() === 6 && configuration.saturdayRequiresApproval && !saturdayApproved) schedulingFail("CRM_SURVEY_SATURDAY_APPROVAL_REQUIRED", 409);
  const profileConfig = configuration.profiles.find((item) => item.code === profile);
  const slot = configuration.slots.find((item) => item.profile === profile && item.key === slotKey);
  if (!profileConfig || !slot) schedulingFail("CRM_SURVEY_SLOT_INVALID", 409);
  if (dayCount >= profileConfig.dailyCapacity || slotCount >= slot.capacity) schedulingFail("CRM_SURVEY_SLOT_FULL", 409);
  return Object.freeze({ slot, dailyCapacity: profileConfig.dailyCapacity, tone: dayCount === 0 ? "GREEN" : dayCount + 1 >= profileConfig.dailyCapacity ? "RED" : "YELLOW" });
}

export function normalizeSchedulingMutation(input) {
  const value = object(input);
  const operation = text(value.operation, 80);
  if (operation === "DECIDE_METHOD") {
    exact(value, ["requestId", "payloadHash", "operation", "caseRef", "expectedVersion", "method", "commercialState", "informationSource", "rationaleCode"]);
    const method = enumValue(value.method, METHODS); const commercialState = enumValue(value.commercialState, STATES); validateMethodState(method, commercialState);
    return command(value, operation, { caseRef: uuid(value.caseRef), expectedVersion: value.expectedVersion == null ? null : integer(value.expectedVersion, 1), method, commercialState, informationSource: value.informationSource == null ? null : enumValue(value.informationSource, SOURCES), rationaleCode: value.rationaleCode == null ? null : text(value.rationaleCode, 80) });
  }
  if (operation === "PUBLISH_POLICY") {
    exact(value, ["requestId", "payloadHash", "operation", "seriesRef", "expectedVersion", "timezone", "configuration", "validFrom"]);
    return command(value, operation, { seriesRef: uuid(value.seriesRef, true), expectedVersion: integer(value.expectedVersion, 0), timezone: text(value.timezone, 64), configuration: normalizePolicyConfiguration(value.configuration), validFrom: timestamp(value.validFrom) });
  }
  if (operation === "SCHEDULE") {
    exact(value, ["requestId", "payloadHash", "operation", "decisionRef", "expectedDecisionVersion", "evaluatorMembershipRef", "scheduledStart", "scheduledEnd", "slotKey", "instruction", "saturdayApprovalReason"]);
    const scheduledStart = timestamp(value.scheduledStart); const scheduledEnd = timestamp(value.scheduledEnd); if (scheduledEnd <= scheduledStart) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
    return command(value, operation, { decisionRef: uuid(value.decisionRef), expectedDecisionVersion: integer(value.expectedDecisionVersion, 1), evaluatorMembershipRef: uuid(value.evaluatorMembershipRef), scheduledStart, scheduledEnd, slotKey: text(value.slotKey, 64), instruction: text(value.instruction, 1000, true), saturdayApprovalReason: text(value.saturdayApprovalReason, 500, true) });
  }
  if (["RESCHEDULE", "CHANGE_EVALUATOR", "CANCEL"].includes(operation)) {
    const keys = operation === "RESCHEDULE" ? ["requestId", "payloadHash", "operation", "assignmentRef", "expectedVersion", "scheduledStart", "scheduledEnd", "slotKey", "reasonCode", "notificationRequired", "saturdayApprovalReason"] : operation === "CHANGE_EVALUATOR" ? ["requestId", "payloadHash", "operation", "assignmentRef", "expectedVersion", "evaluatorMembershipRef", "reasonCode", "notificationRequired"] : ["requestId", "payloadHash", "operation", "assignmentRef", "expectedVersion", "reasonCode", "notificationRequired"];
    exact(value, keys);
    const payload = { assignmentRef: uuid(value.assignmentRef), expectedVersion: integer(value.expectedVersion, 1), reasonCode: text(value.reasonCode, 80), notificationRequired: boolean(value.notificationRequired) };
    if (operation === "RESCHEDULE") { payload.scheduledStart = timestamp(value.scheduledStart); payload.scheduledEnd = timestamp(value.scheduledEnd); payload.slotKey = text(value.slotKey, 64); payload.saturdayApprovalReason = text(value.saturdayApprovalReason, 500, true); if (payload.scheduledEnd <= payload.scheduledStart) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID"); }
    if (operation === "CHANGE_EVALUATOR") payload.evaluatorMembershipRef = uuid(value.evaluatorMembershipRef);
    return command(value, operation, payload);
  }
  if (operation === "PREPARE_COMMUNICATION") {
    exact(value, ["requestId", "payloadHash", "operation", "decisionRef", "assignmentRef", "templateCode", "templateVersion", "audience", "channel", "recipientRef", "contentHash"]);
    const audience = enumValue(value.audience, new Set(["CLIENT", "EVALUATOR", "BOOKER", "AGENT", "LEAD_ACCOUNT", "CORPORATE_CONTACT"]));
    const contentHash = text(value.contentHash, 64); assertContentHash(contentHash);
    return command(value, operation, { decisionRef: uuid(value.decisionRef), assignmentRef: uuid(value.assignmentRef, true), templateCode: text(value.templateCode, 80), templateVersion: integer(value.templateVersion, 1), audience, channel: enumValue(value.channel, new Set(["WHATSAPP", "EMAIL", "SMS", "PHONE", "OTHER"])), recipientRef: uuid(value.recipientRef, true), contentHash });
  }
  if (operation === "UPDATE_VISIT_FEE") {
    exact(value, ["requestId", "payloadHash", "operation", "decisionRef", "expectedVersion", "disposition", "suggestedAmount", "currency", "logisticsRevisionRef", "costingRevisionRef", "costingLineRef", "communicationStatus", "approvalStatus", "paymentStatus", "waiverReason"]);
    const source = validateVisitFeeSource({ disposition: text(value.disposition, 32), suggestedAmount: value.suggestedAmount, currency: value.currency, logisticsRevisionRef: value.logisticsRevisionRef, costingRevisionRef: value.costingRevisionRef, costingLineRef: value.costingLineRef });
    return command(value, operation, { decisionRef: uuid(value.decisionRef), expectedVersion: value.expectedVersion == null ? null : integer(value.expectedVersion, 1), ...source, communicationStatus: enumValue(value.communicationStatus, new Set(["NOT_COMMUNICATED", "PREPARED", "COMMUNICATED"])), approvalStatus: enumValue(value.approvalStatus, new Set(["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"])), paymentStatus: enumValue(value.paymentStatus, new Set(["NOT_REQUIRED", "PENDING", "PAID", "REJECTED"])), waiverReason: text(value.waiverReason, 500, true) });
  }
  schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
}

export function assertContentHash(value) {
  if (!SHA256.test(value)) schedulingFail("CRM_SURVEY_SCHEDULING_INPUT_INVALID");
  return value;
}

export function validateVisitFeeSource({ disposition, suggestedAmount, currency, logisticsRevisionRef, costingRevisionRef, costingLineRef }) {
  if (!["FREE", "CHARGEABLE", "PENDING_CALCULATION", "WAIVED"].includes(disposition)) schedulingFail("CRM_SURVEY_VISIT_FEE_INVALID");
  if (suggestedAmount == null) {
    if (disposition === "CHARGEABLE") schedulingFail("CRM_SURVEY_VISIT_FEE_SOURCE_REQUIRED", 409);
    return Object.freeze({ disposition, suggestedAmount: null, currency: null, logisticsRevisionRef: null, costingRevisionRef: null, costingLineRef: null });
  }
  if (disposition !== "CHARGEABLE") schedulingFail("CRM_SURVEY_VISIT_FEE_INVALID", 409);
  const amount = Number(suggestedAmount);
  if (!Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency || "") || !UUID_V4.test(logisticsRevisionRef || "") || !UUID_V4.test(costingRevisionRef || "") || !UUID_V4.test(costingLineRef || "")) schedulingFail("CRM_SURVEY_VISIT_FEE_SOURCE_REQUIRED", 409);
  return Object.freeze({ disposition, suggestedAmount: amount, currency, logisticsRevisionRef, costingRevisionRef, costingLineRef });
}
