import { canonicalPayloadHash } from "./materialsInventoryContract.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
export const WAREHOUSE_AREA_USE_PURPOSES = Object.freeze(["INTERNAL", "CLIENT_STORAGE", "MIXED"]);
export const WAREHOUSE_LOCATION_OPERATIONAL_STATUSES = Object.freeze(["ACTIVE", "RESTRICTED", "OUT_OF_SERVICE"]);
export const WAREHOUSE_LOCATION_AVAILABILITY_RULES = Object.freeze(["CONDITION_BASED", "BLOCKED"]);

export class WarehouseConfigurationError extends Error {
  constructor(code, status = 400) { super(code); this.name = "WarehouseConfigurationError"; this.code = code; this.status = status; }
}
export function warehouseConfigurationFail(code, status = 400) { throw new WarehouseConfigurationError(code, status); }
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INPUT_INVALID");
}
function text(value, max, nullable = false) {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || value !== value.trim() || !value.length || value.length > max) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INPUT_INVALID");
  return value;
}
function reference(value) {
  if (typeof value !== "string" || !UUID_V4.test(value)) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INPUT_INVALID");
  return value;
}
function version(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INPUT_INVALID");
  return value;
}
function choice(value, allowed) {
  if (!allowed.includes(value)) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INPUT_INVALID");
  return value;
}
function normalizeCommand(value, operation, normalized, scope = {}) {
  const requestId = reference(value.requestId); const payloadHash = text(value.payloadHash, 64);
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key)));
  if (!SHA256.test(payloadHash) || payloadHash !== canonicalPayloadHash({ operation, requestId, ...scope, ...body })) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation, requestId, payloadHash, ...scope, ...normalized });
}
export function warehouseAreaUseNameKey(name) {
  const normalized = name.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("es");
  if (!normalized.length || normalized.length > 320) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INPUT_INVALID");
  return normalized;
}
function useFields(value) {
  const name = text(value.name, 160);
  return { name, nameKey: warehouseAreaUseNameKey(name), description: text(value.description, 500, true), purpose: choice(value.purpose, WAREHOUSE_AREA_USE_PURPOSES) };
}
export function normalizeWarehouseAreaUseCreate(value) {
  exact(value, ["requestId", "payloadHash", "name", "description", "purpose"]);
  return normalizeCommand(value, "WAREHOUSE_AREA_USE_CREATE", useFields(value));
}
export function normalizeWarehouseAreaUseUpdate(value, useRef) {
  exact(value, ["requestId", "payloadHash", "expectedVersion", "name", "description", "purpose", "status"]);
  return normalizeCommand(value, "WAREHOUSE_AREA_USE_UPDATE", { ...useFields(value), expectedVersion: version(value.expectedVersion), status: choice(value.status, ["ACTIVE", "INACTIVE"]) }, { useRef: reference(useRef) });
}
export function normalizeWarehouseLocationConfiguration(value, locationRef) {
  exact(value, ["requestId", "payloadHash", "expectedVersion", "areaUseRef", "characteristics", "notes", "operationalStatus", "availabilityRule", "changeReason", "acknowledgeImpact"]);
  if (typeof value.acknowledgeImpact !== "boolean") warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INPUT_INVALID");
  return normalizeCommand(value, "WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", {
    expectedVersion: version(value.expectedVersion, 0), areaUseRef: value.areaUseRef === null ? null : reference(value.areaUseRef),
    characteristics: text(value.characteristics, 180, true), notes: text(value.notes, 2000, true),
    operationalStatus: choice(value.operationalStatus, WAREHOUSE_LOCATION_OPERATIONAL_STATUSES),
    availabilityRule: choice(value.availabilityRule, WAREHOUSE_LOCATION_AVAILABILITY_RULES),
    changeReason: text(value.changeReason, 500, true), acknowledgeImpact: value.acknowledgeImpact,
  }, { locationRef: reference(locationRef) });
}
