import { canonicalJson, sha256 } from "./geoNormalization.js";
import { LogisticsGeoError, asDate, asNumber, optionalText, requiredText } from "./logisticsGeoSupport.js";

const CODE_PATTERN = /[^A-Z0-9]+/g;
const PLATE_PATTERN = /[^A-Z0-9]+/g;
const VIN_PATTERN = /[^A-Z0-9]+/g;

export function normalizeVehicleCode(value) {
  return requiredText(value, "businessCode", 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(CODE_PATTERN, "-").replace(/^-|-$/g, "");
}

export function normalizeVehiclePlate(value) {
  if (value == null || String(value).trim() === "") return null;
  const normalized = String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(PLATE_PATTERN, "");
  if (normalized.length < 3 || normalized.length > 40) throw new LogisticsGeoError("Matrícula inválida.", { code: "VEHICLE_INPUT_INVALID", status: 400 });
  return normalized;
}

export function normalizeVehicleVin(value) {
  if (value == null || String(value).trim() === "") return null;
  const normalized = String(value).toUpperCase().replace(VIN_PATTERN, "");
  if (normalized.length < 5 || normalized.length > 80) throw new LogisticsGeoError("VIN/chasis inválido.", { code: "VEHICLE_INPUT_INVALID", status: 400 });
  return normalized;
}

function unit(value, allowed, fallback, field) {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!allowed.includes(normalized)) throw new LogisticsGeoError(`${field} no es una unidad soportada.`, { code: "VEHICLE_INPUT_INVALID", status: 400 });
  return normalized;
}

export function normalizeVehicleInput(input = {}) {
  const businessCode = requiredText(input.businessCode ?? input.code, "businessCode", 80);
  const normalizedCode = normalizeVehicleCode(businessCode);
  const normalizedPlate = normalizeVehiclePlate(input.plate);
  const normalizedVin = normalizeVehicleVin(input.vin ?? input.chassis);
  const operationalStatus = String(input.operationalStatus || input.status || "AVAILABLE").trim().toUpperCase();
  if (!["AVAILABLE", "IN_USE", "UNAVAILABLE", "RETIRED"].includes(operationalStatus)) throw new LogisticsGeoError("Estado operativo inválido.", { code: "VEHICLE_INPUT_INVALID", status: 400 });
  const availableForCalculation = input.availableForCalculation !== false && ["AVAILABLE", "IN_USE"].includes(operationalStatus);
  const modelYear = input.modelYear ?? input.year;
  const normalized = {
    businessCode,
    normalizedCode,
    plate: normalizedPlate ? String(input.plate).trim().toUpperCase() : null,
    normalizedPlate,
    vin: normalizedVin ? String(input.vin ?? input.chassis).trim().toUpperCase() : null,
    normalizedVin,
    sourceStableId: optionalText(input.sourceStableId ?? input.id, 191),
    vehicleType: requiredText(input.vehicleType ?? input.type ?? "VEHICLE", "vehicleType", 80),
    brand: optionalText(input.brand, 120),
    model: optionalText(input.model, 120),
    modelYear: modelYear == null || modelYear === "" ? null : asNumber(modelYear, "modelYear", { nullable: false, min: 1900, max: 2200 }),
    capacityWeight: asNumber(input.capacityWeight ?? input.capacityKg, "capacityWeight", { min: 0.000001 }),
    capacityVolume: asNumber(input.capacityVolume ?? input.capacityCbm ?? input.capacity, "capacityVolume", { min: 0.000001 }),
    usableLength: asNumber(input.usableLength, "usableLength", { min: 0.000001 }),
    usableWidth: asNumber(input.usableWidth, "usableWidth", { min: 0.000001 }),
    usableHeight: asNumber(input.usableHeight, "usableHeight", { min: 0.000001 }),
    weightUnit: unit(input.weightUnit, ["KG", "LB"], "KG", "weightUnit"),
    volumeUnit: unit(input.volumeUnit, ["CBM", "CFT"], "CBM", "volumeUnit"),
    dimensionUnit: unit(input.dimensionUnit, ["M", "CM", "FT", "IN"], "M", "dimensionUnit"),
    operationalStatus,
    availableForCalculation,
    effectiveFrom: asDate(input.effectiveFrom, "effectiveFrom"),
    effectiveTo: asDate(input.effectiveTo, "effectiveTo"),
    hubCode: optionalText(input.hubCode ?? input.hubId, 80),
    source: requiredText(input.source || "ADMIN", "source", 80).toUpperCase(),
  };
  if (normalized.effectiveFrom && normalized.effectiveTo && normalized.effectiveTo <= normalized.effectiveFrom) throw new LogisticsGeoError("La vigencia final debe ser posterior al inicio.", { code: "VEHICLE_INPUT_INVALID", status: 400 });
  const payloadHash = sha256(canonicalJson({ ...normalized, effectiveFrom: normalized.effectiveFrom?.toISOString() || null, effectiveTo: normalized.effectiveTo?.toISOString() || null }));
  return { ...normalized, payloadHash };
}

export function vehicleIdentityCandidates(input) {
  const vehicle = normalizeVehicleInput(input);
  return [
    vehicle.sourceStableId && { type: "STABLE_ID", value: `${vehicle.source}:${vehicle.sourceStableId}` },
    vehicle.normalizedPlate && { type: "PLATE", value: vehicle.normalizedPlate },
    vehicle.normalizedVin && { type: "VIN", value: vehicle.normalizedVin },
    { type: "BUSINESS_CODE", value: vehicle.normalizedCode },
  ].filter(Boolean);
}
