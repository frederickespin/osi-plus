import { Prisma } from "@prisma/client";
import { canonicalHash, logisticsFail } from "./logisticsEngineContract.js";
import { adminFleetVehicleRef } from "./adminFleetContract.js";

export const TRANSPORT_CONTRACT = "V17_TRANSPORT_ZONES_V1";
const Decimal = Prisma.Decimal.clone({ precision: 48, rounding: Prisma.Decimal.ROUND_HALF_UP });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PURPOSES = ["QUOTE", "SERVICE", "VISIT"];
const KINDS = ["BASE", "FUEL", "TOLL", "PER_DIEM", "ALLOWANCE", "OTHER"];
const BASES = ["TRIP", "GALLON", "PASS", "PERSON_DAY", "FIXED", "KM"];
const BASIS_BY_KIND = { BASE: ["TRIP"], FUEL: ["GALLON"], TOLL: ["PASS", "FIXED"], PER_DIEM: ["PERSON_DAY"], ALLOWANCE: ["PERSON_DAY", "FIXED", "TRIP"], OTHER: BASES.filter((value) => value !== "GALLON") };
const COMPONENT_KEYS = ["code", "label", "kind", "basis", "unitCost", "classification", "minimumMarginBps", "recommendedMarginBps", "includedConcepts"];
const ZONE_KEYS = ["seriesRef", "expectedVersion", "code", "name", "zoneType", "priority", "vehicleType", "purposes", "geometry", "mode", "factor", "currency", "kmPerGallon", "gallonUnit", "fuelType", "includedConcepts", "components", "state"];
const CALCULATE_KEYS = ["caseRef", "purpose", "contextRef", "intervalStart", "intervalEnd", "journeys"];
const JOURNEY_KEYS = ["journeyRef", "label", "vehicleType", "vehicleRef", "origin", "destination", "distanceKm", "distanceSource", "returnToOrigin", "trips", "people", "days", "quantities"];
const invalid = (code = "TRANSPORT_PAYLOAD_INVALID") => logisticsFail(code);
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value; }
function exact(value, keys) { if (Object.keys(value).some((key) => !keys.includes(key))) invalid(); }
function text(value, max, nullable = false, empty = false) { if (nullable && value === null) return null; if (typeof value !== "string" || value !== value.trim() || !empty && !value || value.length > max) invalid(); return value; }
export function transportRef(value) { if (typeof value !== "string" || !UUID.test(value)) invalid("TRANSPORT_REFERENCE_INVALID"); return value; }
function integer(value, min, max, nullable = false) { if (nullable && value === null) return null; if (!Number.isSafeInteger(value) || value < min || value > max) invalid(); return value; }
function enumeration(value, options) { if (!options.includes(value)) invalid(); return value; }
function decimal(value, digits = 6, max = "999999999999.999999", nullable = true, positive = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !new RegExp(`^(?:0|[1-9][0-9]{0,13})(?:\\.[0-9]{1,${digits}})?$`).test(value)) invalid("TRANSPORT_NUMBER_INVALID");
  const number = new Decimal(value);
  if (number.gt(max) || positive && number.lte(0)) invalid("TRANSPORT_NUMBER_INVALID");
  return value;
}
function uniqueEnums(value, options, min = 0) { if (!Array.isArray(value) || value.length < min || value.length > options.length || new Set(value).size !== value.length) invalid(); return value.map((entry) => enumeration(entry, options)); }
function timestamp(value) { const source = text(value, 40); if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(source)) invalid("TRANSPORT_INTERVAL_INVALID"); const date = new Date(source); if (!Number.isFinite(date.getTime())) invalid("TRANSPORT_INTERVAL_INVALID"); return date.toISOString(); }
function command(raw, operation, payload) {
  const requestId = transportRef(raw.requestId);
  const payloadHash = text(raw.payloadHash, 64);
  if (!/^[0-9a-f]{64}$/.test(payloadHash) || payloadHash !== canonicalHash({ operation, requestId, ...payload })) invalid("LOGISTICS_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation, requestId, payloadHash, ...payload });
}

export function normalizeTransportCoordinate(value, nullable = false) {
  if (nullable && value === null) return null;
  if (!Array.isArray(value) || value.length !== 2 || value.some((number) => typeof number !== "number" || !Number.isFinite(number)) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) invalid("TRANSPORT_COORDINATE_INVALID");
  return [...value];
}
function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function onSegment(p, a, b) { return Math.abs(cross(a, b, p)) <= 1e-10 && p[0] >= Math.min(a[0], b[0]) - 1e-10 && p[0] <= Math.max(a[0], b[0]) + 1e-10 && p[1] >= Math.min(a[1], b[1]) - 1e-10 && p[1] <= Math.max(a[1], b[1]) + 1e-10; }
function intersects(a, b, c, d) { const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b); return abC * abD < 0 && cdA * cdB < 0 || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d); }
export function normalizeTransportPolygon(raw) {
  const value = object(raw); exact(value, ["type", "coordinates"]);
  if (value.type !== "Polygon" || !Array.isArray(value.coordinates) || value.coordinates.length !== 1) invalid("TRANSPORT_GEOMETRY_INVALID");
  const ring = value.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 201) invalid("TRANSPORT_GEOMETRY_INVALID");
  const points = ring.map((point) => normalizeTransportCoordinate(point));
  const first = points[0], last = points.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1] || new Set(points.slice(0, -1).map((point) => point.join(","))).size !== points.length - 1) invalid("TRANSPORT_GEOMETRY_INVALID");
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (Math.abs(points[i][0] - points[i + 1][0]) > 180) invalid("TRANSPORT_GEOMETRY_INVALID");
    area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
    for (let j = i + 2; j < points.length - 1; j++) {
      if (i === 0 && j === points.length - 2) continue;
      if (intersects(points[i], points[i + 1], points[j], points[j + 1])) invalid("TRANSPORT_GEOMETRY_SELF_INTERSECTION");
    }
  }
  if (Math.abs(area) <= 1e-10) invalid("TRANSPORT_GEOMETRY_INVALID");
  return { type: "Polygon", coordinates: [points] };
}
export function pointInTransportPolygon(point, geometry) {
  const ring = geometry.coordinates[0]; let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (onSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function component(raw, allowAutomaticCodes) {
  const value = object(raw); exact(value, COMPONENT_KEYS);
  const code = text(value.code, 48, allowAutomaticCodes); if (code !== null && !/^[A-Z][A-Z0-9_]{0,47}$/.test(code)) invalid("TRANSPORT_COMPONENT_CODE_INVALID");
  const kind = enumeration(value.kind, KINDS), basis = enumeration(value.basis, BASIS_BY_KIND[kind]);
  const includedConcepts = uniqueEnums(value.includedConcepts, KINDS.filter((item) => item !== kind && item !== "BASE"));
  const minimumMarginBps = integer(value.minimumMarginBps, 0, 9999, true), recommendedMarginBps = integer(value.recommendedMarginBps, 0, 9999, true);
  if (minimumMarginBps != null && recommendedMarginBps != null && recommendedMarginBps < minimumMarginBps) invalid("TRANSPORT_MARGIN_INVALID");
  return { code, label: text(value.label, 180), kind, basis, unitCost: decimal(value.unitCost), classification: enumeration(value.classification, ["PR", "EX", "DE"]), minimumMarginBps, recommendedMarginBps, includedConcepts };
}
function validateCoverage(zone) {
  const base = zone.components.find((row) => row.kind === "BASE");
  if (zone.includedConcepts.length && !base) invalid("TRANSPORT_INCLUDED_BASE_REQUIRED");
  const coverage = new Map();
  for (const row of zone.components) {
    const included = [...row.includedConcepts, ...(row.kind === "BASE" ? zone.includedConcepts : [])];
    for (const concept of included) {
      if (coverage.has(concept) || zone.components.some((candidate) => candidate.kind === concept)) invalid("TRANSPORT_CONCEPT_DUPLICATED");
      coverage.set(concept, row.code);
    }
  }
}
export function normalizeTransportZonePayload(raw, { allowAutomaticCodes = false } = {}) {
  const value = object(raw); exact(value, ZONE_KEYS);
  const code = text(value.code, 64, allowAutomaticCodes); if (code !== null && !/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) invalid("TRANSPORT_ZONE_CODE_INVALID");
  if (!Array.isArray(value.components) || value.components.length > 40) invalid();
  const components = value.components.map((row) => component(row, allowAutomaticCodes));
  const suppliedCodes = components.map((row) => row.code).filter((code) => code !== null);
  if (new Set(suppliedCodes).size !== suppliedCodes.length || components.filter((row) => row.kind === "BASE").length > 1) invalid("TRANSPORT_COMPONENT_DUPLICATED");
  const zone = {
    seriesRef: value.seriesRef === null ? null : transportRef(value.seriesRef), expectedVersion: integer(value.expectedVersion, 1, 2147483647, true),
    code, name: text(value.name, 180), zoneType: enumeration(value.zoneType, ["METRO", "INTERIOR"]), priority: integer(value.priority, 0, 9999),
    vehicleType: text(value.vehicleType, 80, true), purposes: uniqueEnums(value.purposes, PURPOSES, 1), geometry: normalizeTransportPolygon(value.geometry),
    mode: enumeration(value.mode, ["ITEMIZED", "FACTOR"]), factor: decimal(value.factor, 6, "9999.999999", true, true), currency: text(value.currency, 3),
    kmPerGallon: decimal(value.kmPerGallon, 4, "9999.9999", true, true), gallonUnit: enumeration(value.gallonUnit, ["US", "IMPERIAL"]), fuelType: text(value.fuelType, 80, true),
    includedConcepts: uniqueEnums(value.includedConcepts, KINDS.filter((kind) => kind !== "BASE")), components, state: enumeration(value.state, ["DRAFT", "ACTIVE", "INACTIVE"]),
  };
  if ((zone.seriesRef === null) !== (zone.expectedVersion === null) || !/^[A-Z]{3}$/.test(zone.currency) || zone.mode === "ITEMIZED" && zone.factor !== null) invalid();
  validateCoverage(zone);
  return zone;
}
export function normalizeTransportZone(raw) {
  const value = object(raw); exact(value, [...ZONE_KEYS, "requestId", "payloadHash"]);
  return command(value, "TRANSPORT_ZONE_VERSION", normalizeTransportZonePayload(Object.fromEntries(ZONE_KEYS.map((key) => [key, value[key]])), { allowAutomaticCodes: true }));
}
export function normalizeTransportInput(raw) {
  const value = object(raw); exact(value, CALCULATE_KEYS);
  const purpose = enumeration(value.purpose, PURPOSES);
  const contextRef = value.contextRef === null ? null : transportRef(value.contextRef);
  if ((purpose === "VISIT") !== (contextRef !== null)) invalid("TRANSPORT_CONTEXT_INVALID");
  const intervalStart = timestamp(value.intervalStart), intervalEnd = timestamp(value.intervalEnd);
  if (intervalEnd <= intervalStart || Date.parse(intervalEnd) - Date.parse(intervalStart) > 366 * 86400000) invalid("TRANSPORT_INTERVAL_INVALID");
  if (!Array.isArray(value.journeys) || value.journeys.length < 1 || value.journeys.length > 40) invalid("TRANSPORT_JOURNEYS_REQUIRED");
  const journeys = value.journeys.map((rawJourney) => {
    const row = object(rawJourney); exact(row, JOURNEY_KEYS);
    if (typeof row.returnToOrigin !== "boolean") invalid();
    const quantities = object(row.quantities);
    if (Object.keys(quantities).length > 40) invalid();
    for (const [code, quantity] of Object.entries(quantities)) { if (!/^[A-Z][A-Z0-9_]{0,47}$/.test(code)) invalid(); decimal(quantity, 4, "99999999999999.9999", false); }
    let vehicleRef = null;
    if (row.vehicleRef !== null) { try { vehicleRef = adminFleetVehicleRef(row.vehicleRef); } catch { invalid("TRANSPORT_VEHICLE_REFERENCE_INVALID"); } }
    return { journeyRef: transportRef(row.journeyRef), label: text(row.label, 120), vehicleType: text(row.vehicleType, 80), vehicleRef, origin: normalizeTransportCoordinate(row.origin, true), destination: normalizeTransportCoordinate(row.destination, true), distanceKm: decimal(row.distanceKm, 4, "999999.9999"), distanceSource: text(row.distanceSource, 240, false, true), returnToOrigin: row.returnToOrigin, trips: integer(row.trips, 1, 9999), people: integer(row.people, 0, 9999, true), days: decimal(row.days, 4, "9999.9999"), quantities: { ...quantities } };
  });
  if (new Set(journeys.map((row) => row.journeyRef)).size !== journeys.length) invalid("TRANSPORT_JOURNEY_DUPLICATED");
  return { caseRef: transportRef(value.caseRef), purpose, contextRef, intervalStart, intervalEnd, journeys };
}
export function normalizeTransportCalculate(raw) { const value = object(raw); exact(value, [...CALCULATE_KEYS, "requestId", "payloadHash"]); return command(value, "TRANSPORT_CALCULATE", normalizeTransportInput(Object.fromEntries(CALCULATE_KEYS.map((key) => [key, value[key]])))); }
export function normalizeTransportPublish(raw) { const value = object(raw); exact(value, ["requestId", "payloadHash", "calculationRef"]); return command(value, "TRANSPORT_PUBLISH", { calculationRef: transportRef(value.calculationRef) }); }

export function selectTransportZone(zones, journey, purpose) {
  if (!journey.destination) return { zone: null, reason: "TRANSPORT_DESTINATION_PENDING" };
  const matching = zones.filter((zone) => zone.state === "ACTIVE" && zone.purposes.includes(purpose) && (zone.vehicleType === null || zone.vehicleType === journey.vehicleType) && pointInTransportPolygon(journey.destination, zone.geometry));
  matching.sort((a, b) => Number(b.vehicleType !== null) - Number(a.vehicleType !== null) || b.priority - a.priority || a.ruleRef.localeCompare(b.ruleRef));
  if (!matching.length) return { zone: null, reason: "TRANSPORT_ZONE_NOT_CONFIGURED" };
  if (matching[1] && matching[0].vehicleType === matching[1].vehicleType && matching[0].priority === matching[1].priority) return { zone: null, reason: "TRANSPORT_ZONE_CONFLICT" };
  return { zone: matching[0], reason: null };
}
function boundedDecimal(value, digits, max) { if (!value.isFinite() || value.isNegative() || value.gt(max)) return null; return value.toDecimalPlaces(digits, Decimal.ROUND_HALF_UP).toFixed(digits); }
export function transportLineQuantity(component, journey, zone) {
  const distance = journey.distanceKm === null ? null : new Decimal(journey.distanceKm).mul(journey.returnToOrigin ? 2 : 1).mul(journey.trips);
  let quantity = null;
  if (component.basis === "TRIP") quantity = new Decimal(journey.trips);
  else if (component.basis === "KM") quantity = distance;
  else if (component.basis === "GALLON") quantity = distance !== null && zone.kmPerGallon !== null ? distance.div(zone.kmPerGallon) : null;
  else if (component.basis === "PERSON_DAY") quantity = journey.people !== null && journey.days !== null ? new Decimal(journey.people).mul(journey.days) : null;
  else if (Object.hasOwn(journey.quantities, component.code)) quantity = new Decimal(journey.quantities[component.code]);
  return { quantity: quantity === null ? null : boundedDecimal(quantity, 4, "99999999999999.9999"), distanceKm: distance === null ? null : boundedDecimal(distance, 4, "99999999999999.9999") };
}
export function calculateTransportResult(input, zones) {
  const context = { contract: TRANSPORT_CONTRACT, purpose: input.purpose, contextRef: input.contextRef };
  const lines = [], issues = [], totals = new Map();
  const issue = (code, message, journeyRef, severity = "BLOCKER") => issues.push({ code, message, journeyRef, severity });
  for (const journey of input.journeys) {
    const selected = selectTransportZone(zones, journey, input.purpose);
    if (!journey.origin) issue("TRANSPORT_ORIGIN_PENDING", "Indique el punto de salida del desplazamiento.", journey.journeyRef);
    if (!selected.zone) { issue(selected.reason, selected.reason === "TRANSPORT_ZONE_CONFLICT" ? "El destino coincide con zonas de igual prioridad. Ajuste el perímetro o la prioridad." : selected.reason === "TRANSPORT_DESTINATION_PENDING" ? "Indique el destino para resolver su zona." : "No hay una zona activa para este destino, propósito y tipo de vehículo.", journey.journeyRef); continue; }
    const zone = selected.zone;
    if (!totals.has(zone.currency)) totals.set(zone.currency, { amount: new Decimal(0), pending: false });
    if (!zone.components.length) { issue("TRANSPORT_TARIFF_PENDING", "La zona no tiene renglones de transporte configurados.", journey.journeyRef); totals.get(zone.currency).pending = true; }
    if (zone.mode === "FACTOR" && !zone.components.some((row) => row.kind === "BASE")) { issue("TRANSPORT_BASE_PENDING", "El modo por factor necesita una tarifa base de transporte.", journey.journeyRef); totals.get(zone.currency).pending = true; }
    if (zone.components.some((row) => row.kind === "FUEL") && !zone.fuelType) issue("TRANSPORT_FUEL_TYPE_PENDING", "Indique el combustible al que corresponden el rendimiento y el precio por galón.", journey.journeyRef);
    if (journey.distanceKm !== null && !journey.distanceSource || zone.components.some((row) => ["GALLON", "KM"].includes(row.basis)) && (journey.distanceKm === null || !journey.distanceSource)) issue("TRANSPORT_DISTANCE_PENDING", "Confirme los kilómetros de carretera y su fuente; el mapa no calcula esa distancia.", journey.journeyRef);
    const quantityCodes = new Set(zone.components.filter((row) => ["PASS", "FIXED"].includes(row.basis)).map((row) => row.code));
    if (Object.keys(journey.quantities).some((code) => !quantityCodes.has(code))) issue("TRANSPORT_QUANTITY_UNKNOWN", "Hay cantidades manuales que no pertenecen a los renglones de esta zona.", journey.journeyRef);
    for (const component of zone.components) {
      const { quantity, distanceKm } = transportLineQuantity(component, journey, zone);
      const factor = component.kind === "BASE" && zone.mode === "FACTOR" ? zone.factor : null;
      let unitCost = component.unitCost === null || component.kind === "BASE" && zone.mode === "FACTOR" && factor === null ? null : boundedDecimal(new Decimal(component.unitCost).mul(factor ?? 1), 6, "999999999999.999999");
      if (quantity === null) issue("TRANSPORT_QUANTITY_PENDING", `Complete la cantidad o los datos de cálculo de «${component.label}».`, journey.journeyRef);
      if (unitCost === null) issue("TRANSPORT_TARIFF_PENDING", `Complete la tarifa y, si corresponde, el factor de «${component.label}».`, journey.journeyRef);
      const totalCost = quantity === null || unitCost === null ? null : boundedDecimal(new Decimal(quantity).mul(unitCost), 6, "999999999999.999999");
      if (totalCost === null && quantity !== null && unitCost !== null) { issue("TRANSPORT_AMOUNT_LIMIT", `El importe de «${component.label}» supera el límite admitido.`, journey.journeyRef); unitCost = null; }
      lines.push({ journeyRef: journey.journeyRef, zoneRuleRef: zone.ruleRef, zoneVersion: zone.version, zoneCode: zone.code, zoneType: zone.zoneType, componentCode: component.code, concept: component.label, kind: component.kind, basis: component.basis, quantity, unit: component.basis, unitCost, baseUnitCost: component.unitCost, totalCost, currency: zone.currency, costRuleRef: component.costRuleRef, costRuleVersion: component.costRuleVersion, factor, distanceKm, kmPerGallon: component.kind === "FUEL" ? zone.kmPerGallon : null, gallonUnit: component.kind === "FUEL" ? zone.gallonUnit : null, fuelType: component.kind === "FUEL" ? zone.fuelType : null });
      const total = totals.get(zone.currency);
      if (totalCost === null) total.pending = true; else total.amount = total.amount.plus(totalCost);
    }
  }
  return { context, lines, issues, totals: [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => ({ currency, amount: total.pending ? null : total.amount.toFixed(6) })), complete: lines.length > 0 && !issues.some((row) => row.severity === "BLOCKER") };
}
