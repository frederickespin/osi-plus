import { normalizeVehicleInput } from "./vehicleNormalization.js";
import {
  ADMIN_FLEET_STATUSES, ADMIN_FLEET_WEIGHT_UNITS, ADMIN_FLEET_VOLUME_UNITS, ADMIN_FLEET_DIMENSION_UNITS,
} from "../../shared/adminFleet.js";

export const ADMIN_FLEET_EDITABLE_FIELDS = Object.freeze([
  "businessCode", "plate", "vin", "vehicleType", "brand", "model", "modelYear",
  "capacityWeight", "capacityVolume", "usableLength", "usableWidth", "usableHeight",
  "weightUnit", "volumeUnit", "dimensionUnit", "operationalStatus", "availableForCalculation",
  "effectiveFrom", "effectiveTo", "hubCode",
]);
export const ADMIN_FLEET_TECHNICAL_FIELDS = Object.freeze([
  "vehicleType", "capacityWeight", "capacityVolume", "usableLength", "usableWidth", "usableHeight",
  "weightUnit", "volumeUnit", "dimensionUnit",
]);
const TEXT_LIMITS = Object.freeze({ businessCode: 80, vehicleType: 80, plate: 40, vin: 80, brand: 120, model: 120, hubCode: 80 });
const PRECISION = Object.freeze({ capacityWeight: [3, 11], capacityVolume: [4, 10], usableLength: [4, 8], usableWidth: [4, 8], usableHeight: [4, 8] });
const UNITS = Object.freeze({ weightUnit: ADMIN_FLEET_WEIGHT_UNITS, volumeUnit: ADMIN_FLEET_VOLUME_UNITS, dimensionUnit: ADMIN_FLEET_DIMENSION_UNITS, operationalStatus: ADMIN_FLEET_STATUSES });
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AdminFleetError extends Error {
  constructor(code, status) { super(code); this.name = "AdminFleetError"; this.code = code; this.status = status; }
}
export function fleetFail(code, status = 400) { throw new AdminFleetError(`ADMIN_FLEET_${code}`, status); }
export function exactFleetObject(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some((key) => !allowed.includes(key))) fleetFail("INPUT_INVALID");
}
export function adminFleetVehicleRef(value) {
  // Historical rows use both cuid and UUID: this is an opaque reference, never a UUID cast.
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,190}$/.test(value)) fleetFail("NOT_FOUND", 404);
  return value;
}
export function adminFleetRequestId(value) {
  if (typeof value !== "string" || !UUID_V4.test(value)) fleetFail("INPUT_INVALID");
  return value.toLowerCase();
}
function dateText(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fleetFail("INPUT_INVALID");
  const date = new Date(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.toISOString() !== canonical) fleetFail("INPUT_INVALID");
  return date.toISOString();
}
function decimal(value, scale, wholeDigits) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 10 ** wholeDigits) fleetFail("INPUT_INVALID");
  // Values have at most 14 decimal digits, below JS integer precision. Reject SQL rounding.
  const rendered = String(value);
  if (!new RegExp(`^\\d{1,${wholeDigits}}(?:\\.\\d{1,${scale}})?$`).test(rendered)) fleetFail("INPUT_INVALID");
  return value;
}
export function adminFleetEditableInput(fields) {
  exactFleetObject(fields, ADMIN_FLEET_EDITABLE_FIELDS);
  const output = {};
  for (const [key, value] of Object.entries(fields)) {
    if (Object.hasOwn(TEXT_LIMITS, key)) {
      const required = key === "businessCode" || key === "vehicleType";
      if (value === null && !required) { output[key] = null; continue; }
      if (typeof value !== "string" || value.trim().length > TEXT_LIMITS[key] || /[\u0000-\u001f\u007f]/.test(value)
        || (required && !value.trim())) fleetFail("INPUT_INVALID");
      output[key] = value.trim() || null;
    } else if (Object.hasOwn(PRECISION, key)) {
      output[key] = decimal(value, ...PRECISION[key]);
    } else if (key === "modelYear") {
      if (value !== null && (!Number.isInteger(value) || value < 1900 || value > 2200)) fleetFail("INPUT_INVALID");
      output[key] = value;
    } else if (Object.hasOwn(UNITS, key)) {
      if (!UNITS[key].includes(value)) fleetFail("INPUT_INVALID");
      output[key] = value;
    } else if (key === "availableForCalculation") {
      if (typeof value !== "boolean") fleetFail("INPUT_INVALID");
      output[key] = value;
    } else if (key === "effectiveFrom" || key === "effectiveTo") {
      output[key] = key === "effectiveTo" && value === null ? null : dateText(value);
    }
  }
  return output;
}
export function normalizeAdminFleetVehicle(fields, { source = "V17_ADMINISTRATION_FLEET_19D", sourceStableId = null } = {}) {
  try {
    const normalized = normalizeVehicleInput({ ...fields, source, sourceStableId });
    if (!normalized.normalizedCode) fleetFail("INPUT_INVALID");
    return normalized;
  } catch (error) {
    if (error instanceof AdminFleetError) throw error;
    if (error?.code === "VEHICLE_INPUT_INVALID" || error?.code === "LOGISTICS_GEO_INPUT_INVALID") fleetFail("INPUT_INVALID");
    throw error;
  }
}
export function parseAdminFleetCreate(input) {
  exactFleetObject(input, ["requestId", ...ADMIN_FLEET_EDITABLE_FIELDS]);
  const requestId = adminFleetRequestId(input.requestId);
  const { requestId: _requestId, ...fields } = input;
  if (!Object.hasOwn(fields, "businessCode") || !Object.hasOwn(fields, "vehicleType")) fleetFail("INPUT_INVALID");
  return { requestId, vehicle: normalizeAdminFleetVehicle(adminFleetEditableInput(fields)) };
}
export function parseAdminFleetPatch(input) {
  exactFleetObject(input, ["requestId", "expectedVersion", "changes"]);
  const requestId = adminFleetRequestId(input.requestId);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= 2147483647) fleetFail("INPUT_INVALID");
  const changes = adminFleetEditableInput(input.changes);
  if (Object.keys(changes).length === 0) fleetFail("INPUT_INVALID");
  return { requestId, expectedVersion: input.expectedVersion, changes };
}
function pageNumber(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!((typeof value === "number" && Number.isInteger(value)) || (typeof value === "string" && /^[1-9]\d*$/.test(value)))) fleetFail("INPUT_INVALID");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) fleetFail("INPUT_INVALID");
  return number;
}
export function parseAdminFleetFilters(input = {}) {
  exactFleetObject(input, ["search", "operationalStatus", "vehicleType", "page", "pageSize"]);
  const output = { page: pageNumber(input.page, 1, 1000000), pageSize: pageNumber(input.pageSize, 20, 50) };
  for (const [key, max] of [["search", 120], ["vehicleType", 80], ["operationalStatus", 20]]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || input[key].length > max || /[\u0000-\u001f\u007f]/.test(input[key])) fleetFail("INPUT_INVALID");
    if (input[key].trim()) output[key] = input[key].trim();
  }
  if (output.operationalStatus && !ADMIN_FLEET_STATUSES.includes(output.operationalStatus)) fleetFail("INPUT_INVALID");
  return output;
}
const numberOrNull = (value) => value == null ? null : Number(value);
const isoOrNull = (value) => value == null ? null : new Date(value).toISOString();
export function adminFleetVehicleDto(row) {
  return Object.freeze({
    vehicleRef: String(row.id), businessCode: row.business_code, plate: row.plate ?? null, vin: row.vin ?? null,
    vehicleType: row.vehicle_type, brand: row.brand ?? null, model: row.model ?? null, modelYear: numberOrNull(row.model_year),
    capacityWeight: numberOrNull(row.capacity_weight), capacityVolume: numberOrNull(row.capacity_volume),
    usableLength: numberOrNull(row.usable_length), usableWidth: numberOrNull(row.usable_width), usableHeight: numberOrNull(row.usable_height),
    weightUnit: row.weight_unit, volumeUnit: row.volume_unit, dimensionUnit: row.dimension_unit,
    operationalStatus: String(row.operational_status), availableForCalculation: row.available_for_calculation,
    effectiveFrom: isoOrNull(row.effective_from), effectiveTo: isoOrNull(row.effective_to), hubCode: row.hub_code ?? null,
    rowVersion: Number(row.row_version), updatedAt: isoOrNull(row.updated_at), retiredAt: isoOrNull(row.retired_at),
    calculationLocked: row.calculation_locked_at != null,
  });
}
export function adminFleetEditableDto(dto) {
  return Object.fromEntries(ADMIN_FLEET_EDITABLE_FIELDS.map((key) => [key, dto[key]]));
}
