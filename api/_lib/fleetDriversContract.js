import { adminFleetRequestId, adminFleetVehicleRef } from "./adminFleetContract.js";
import { FLEET_DRIVER_DECISIONS, FLEET_DRIVER_HISTORY_KINDS } from "../../shared/adminFleetDrivers.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export class FleetDriversError extends Error {
  constructor(code, status) { super(code); this.name = "FleetDriversError"; this.code = code; this.status = status; }
}
export function fleetDriverFail(code, status = 400) { throw new FleetDriversError(`FLEET_DRIVERS_${code}`, status); }
export function exactFleetDriverObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some((key) => !keys.includes(key))) fleetDriverFail("INPUT_INVALID");
}
export function fleetDriverReference(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !UUID.test(value)) fleetDriverFail("INPUT_INVALID");
  return value.toLowerCase();
}
export function fleetDriverVehicleRef(value) {
  try { return adminFleetVehicleRef(value); } catch { fleetDriverFail("NOT_FOUND", 404); }
}
function requestId(value) {
  try { return adminFleetRequestId(value); } catch { fleetDriverFail("INPUT_INVALID"); }
}
function version(value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum || value >= 2147483647) fleetDriverFail("INPUT_INVALID");
  return value;
}
function reason(value, fallback) {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fleetDriverFail("INPUT_INVALID");
  return value.trim();
}
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) fleetDriverFail("INPUT_INVALID");
  const parsed = new Date(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.getUTCFullYear() < 1900 || parsed.toISOString() !== normalized) fleetDriverFail("INPUT_INVALID");
  return normalized;
}
function page(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!(typeof value === "number" && Number.isInteger(value)) && !(typeof value === "string" && /^[1-9]\d*$/u.test(value))) fleetDriverFail("INPUT_INVALID");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) fleetDriverFail("INPUT_INVALID");
  return number;
}
export function normalizeFleetDriverQuery(input = {}, { allowHistoryKind = false } = {}) {
  exactFleetDriverObject(input, allowHistoryKind ? ["historyKind", "page", "pageSize"] : ["search", "page", "pageSize"]);
  const result = { page: page(input.page, 1, 1000000), pageSize: page(input.pageSize, 20, 50) };
  if (allowHistoryKind) {
    result.historyKind = input.historyKind ?? "TEMPORARY";
    if (!FLEET_DRIVER_HISTORY_KINDS.includes(result.historyKind)) fleetDriverFail("INPUT_INVALID");
  } else {
    const search = input.search ?? "";
    if (typeof search !== "string" || search.length > 120 || /[\u0000-\u001f\u007f]/u.test(search)) fleetDriverFail("INPUT_INVALID");
    result.search = search.trim();
  }
  return result;
}
export function parseFleetPrimaryCommand(input) {
  exactFleetDriverObject(input, ["requestId", "expectedVersion", "driverMembershipRef", "reason"]);
  return { requestId: requestId(input.requestId), expectedVersion: version(input.expectedVersion, 0),
    driverMembershipRef: fleetDriverReference(input.driverMembershipRef, { nullable: true }), reason: reason(input.reason) };
}
export function parseFleetTemporaryRequest(input) {
  exactFleetDriverObject(input, ["requestId", "driverMembershipRef", "startsAt", "endsAt", "reason"]);
  const startsAt = instant(input.startsAt); const endsAt = instant(input.endsAt);
  if (endsAt <= startsAt) fleetDriverFail("INPUT_INVALID");
  return { requestId: requestId(input.requestId), driverMembershipRef: fleetDriverReference(input.driverMembershipRef), startsAt, endsAt, reason: reason(input.reason) };
}
export function parseFleetAuthorizationDecision(input) {
  exactFleetDriverObject(input, ["requestId", "expectedVersion", "action", "reason"]);
  if (!FLEET_DRIVER_DECISIONS.includes(input.action)) fleetDriverFail("INPUT_INVALID");
  return { requestId: requestId(input.requestId), expectedVersion: version(input.expectedVersion, 1), action: input.action,
    reason: reason(input.reason, input.action === "APPROVE" ? "Autorizado por el responsable de Flota/Logística." : undefined) };
}
