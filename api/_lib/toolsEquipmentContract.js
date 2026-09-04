import { createHash } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_-]{0,63}$/;
const CURRENCY = /^[A-Z]{3}$/;

export class ToolsEquipmentError extends Error {
  constructor(code, status = 400) { super(code); this.name = "ToolsEquipmentError"; this.code = code; this.status = status; }
}
export function assetFail(code, status = 400) { throw new ToolsEquipmentError(code, status); }
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
export function canonicalAssetPayloadHash(value) { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) assetFail("ASSET_INPUT_INVALID"); return value; }
function exact(value, keys) { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) assetFail("ASSET_INPUT_INVALID"); }
function text(value, max = 320, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max) assetFail("ASSET_INPUT_INVALID");
  return value;
}
function uuid(value, notFound = true) { const result = text(value, 36); if (!UUID_V4.test(result)) assetFail(notFound ? "ASSET_NOT_FOUND" : "ASSET_INPUT_INVALID", notFound ? 404 : 400); return result; }
function code(value) { const result = text(value, 64); if (!CODE.test(result)) assetFail("ASSET_INPUT_INVALID"); return result; }
function enumValue(value, values) { const result = text(value, 80); if (!values.includes(result)) assetFail("ASSET_INPUT_INVALID"); return result; }
function integer(value, min = 0, max = 1_000_000) { if (!Number.isSafeInteger(value) || value < min || value > max) assetFail("ASSET_INPUT_INVALID"); return value; }
function decimal(value, { optional = false, min = 0, max = 1_000_000_000 } = {}) {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) assetFail("ASSET_INPUT_INVALID");
  return value;
}
function timestamp(value) { const result = text(value, 40); if (new Date(result).toISOString() !== result) assetFail("ASSET_INPUT_INVALID"); return result; }
function date(value, optional = false) { if (optional && !value) return null; const result = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))) assetFail("ASSET_INPUT_INVALID"); return result; }
function jsonObject(value) { if (!value || typeof value !== "object" || Array.isArray(value)) assetFail("ASSET_INPUT_INVALID"); return Object.freeze({ ...value }); }
function evidence(value) { if (!Array.isArray(value) || value.length > 20) assetFail("ASSET_INPUT_INVALID"); return Object.freeze(value.map((entry) => uuid(entry, false))); }
function interval(startsAt, endsAt) { const start = timestamp(startsAt); const end = timestamp(endsAt); if (Date.parse(end) <= Date.parse(start)) assetFail("ASSET_INTERVAL_INVALID"); return { startsAt: start, endsAt: end }; }
function currency(value, optional = false) { if (optional && !value) return null; const result = text(value, 3); if (!CURRENCY.test(result)) assetFail("ASSET_INPUT_INVALID"); return result; }
function command(value, operation, payload, hashPayload = undefined) {
  const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64);
  const canonical = hashPayload ?? Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key)));
  if (!SHA256.test(payloadHash) || payloadHash !== canonicalAssetPayloadHash({ operation, requestId, ...canonical })) assetFail("ASSET_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation, requestId, payloadHash, ...payload });
}

export function normalizeAssetModelCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "code", "name", "description", "family", "resourceType", "serialPolicy", "identificationPolicy", "capacity"]);
  return command(value, "ASSET_MODEL_CREATE", { code: code(value.code), name: text(value.name, 160), description: text(value.description, 1000, true), family: text(value.family, 80), resourceType: enumValue(value.resourceType, ["TOOL", "EQUIPMENT"]), serialPolicy: enumValue(value.serialPolicy, ["REQUIRED", "OPTIONAL", "NONE"]), identificationPolicy: jsonObject(value.identificationPolicy), capacity: jsonObject(value.capacity) });
}

export function normalizeAssetInstanceCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "modelRef", "locationRef", "internalCodePrefix", "serialNumber", "barcode", "physicalCondition", "acquiredAt", "acquisitionCost", "replacementCost", "currency"]);
  const acquisitionCost = decimal(value.acquisitionCost, { optional: true }); const replacementCost = decimal(value.replacementCost, { optional: true }); const normalizedCurrency = currency(value.currency, true);
  if ((acquisitionCost !== null || replacementCost !== null) && !normalizedCurrency) assetFail("ASSET_INPUT_INVALID");
  return command(value, "ASSET_INSTANCE_CREATE", { modelRef: uuid(value.modelRef), locationRef: value.locationRef ? uuid(value.locationRef) : null, internalCodePrefix: code(value.internalCodePrefix), serialNumber: text(value.serialNumber, 160, true), barcode: text(value.barcode, 160, true), physicalCondition: enumValue(value.physicalCondition, ["GOOD", "FAIR", "DAMAGED", "UNSAFE"]), acquiredAt: date(value.acquiredAt, true), acquisitionCost, replacementCost, currency: normalizedCurrency });
}

export function normalizeAssetStateChange(input, assetRef) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion", "operationalStatus", "physicalCondition", "locationRef", "reasonCode"]);
  const ref = uuid(assetRef); const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key)));
  return command(value, "ASSET_STATE_CHANGE", { assetRef: ref, expectedVersion: integer(value.expectedVersion, 1), operationalStatus: enumValue(value.operationalStatus, ["AVAILABLE", "ASSIGNED", "IN_USE", "MAINTENANCE", "OUT_OF_SERVICE", "LOST", "RETIRED"]), physicalCondition: enumValue(value.physicalCondition, ["GOOD", "FAIR", "DAMAGED", "UNSAFE"]), locationRef: value.locationRef ? uuid(value.locationRef) : null, reasonCode: code(value.reasonCode) }, { assetRef: ref, ...body });
}

export function normalizeAssetReservation(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assetRef", "caseRef", "operationalReference", "startsAt", "endsAt"]);
  const range = interval(value.startsAt, value.endsAt); const caseRef = value.caseRef ? uuid(value.caseRef) : null; const operationalReference = text(value.operationalReference, 191, true);
  if (!caseRef && !operationalReference) assetFail("ASSET_INPUT_INVALID");
  return command(value, "ASSET_RESERVATION_CREATE", { assetRef: uuid(value.assetRef), caseRef, operationalReference, ...range });
}

export function normalizeAssetAssignment(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assetRef", "reservationRef", "caseRef", "assigneeRef", "custodianRef", "operationalReference", "originLocationRef", "destinationLocationRef"]);
  const assigneeRef = value.assigneeRef ? uuid(value.assigneeRef) : null; const operationalReference = text(value.operationalReference, 191, true);
  if (!assigneeRef && !operationalReference) assetFail("ASSET_INPUT_INVALID");
  return command(value, "ASSET_ASSIGNMENT_CREATE", { assetRef: uuid(value.assetRef), reservationRef: value.reservationRef ? uuid(value.reservationRef) : null, caseRef: value.caseRef ? uuid(value.caseRef) : null, assigneeRef, custodianRef: value.custodianRef ? uuid(value.custodianRef) : null, operationalReference, originLocationRef: value.originLocationRef ? uuid(value.originLocationRef) : null, destinationLocationRef: value.destinationLocationRef ? uuid(value.destinationLocationRef) : null });
}

export function normalizeAssetHandout(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assignmentRef", "expectedVersion", "condition", "destinationLocationRef", "handedOutAt"]);
  return command(value, "ASSET_HANDOUT", { assignmentRef: uuid(value.assignmentRef), expectedVersion: integer(value.expectedVersion, 1), condition: enumValue(value.condition, ["GOOD", "FAIR", "DAMAGED", "UNSAFE"]), destinationLocationRef: value.destinationLocationRef ? uuid(value.destinationLocationRef) : null, handedOutAt: timestamp(value.handedOutAt) });
}

export function normalizeAssetReturn(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assignmentRef", "expectedVersion", "condition", "locationRef", "returnedAt", "damageDescription", "evidenceRefs"]);
  const condition = enumValue(value.condition, ["GOOD", "FAIR", "DAMAGED", "UNSAFE"]); const damageDescription = text(value.damageDescription, 2000, true);
  if (["DAMAGED", "UNSAFE"].includes(condition) && !damageDescription) assetFail("ASSET_DAMAGE_DETAILS_REQUIRED");
  return command(value, "ASSET_RETURN", { assignmentRef: uuid(value.assignmentRef), expectedVersion: integer(value.expectedVersion, 1), condition, locationRef: uuid(value.locationRef), returnedAt: timestamp(value.returnedAt), damageDescription, evidenceRefs: evidence(value.evidenceRefs) });
}

export function normalizeAssetInspection(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assetRef", "assignmentRef", "locationRef", "inspectionType", "physicalCondition", "safeToUse", "notes", "evidenceRefs", "inspectedAt"]);
  if (typeof value.safeToUse !== "boolean") assetFail("ASSET_INPUT_INVALID"); const physicalCondition = enumValue(value.physicalCondition, ["GOOD", "FAIR", "DAMAGED", "UNSAFE"]);
  if (value.safeToUse && physicalCondition === "UNSAFE") assetFail("ASSET_INPUT_INVALID");
  return command(value, "ASSET_INSPECTION_CREATE", { assetRef: uuid(value.assetRef), assignmentRef: value.assignmentRef ? uuid(value.assignmentRef) : null, locationRef: value.locationRef ? uuid(value.locationRef) : null, inspectionType: enumValue(value.inspectionType, ["PRE_HANDOUT", "RETURN", "PERIODIC", "MAINTENANCE"]), physicalCondition, safeToUse: value.safeToUse, notes: text(value.notes, 2000, true), evidenceRefs: evidence(value.evidenceRefs), inspectedAt: timestamp(value.inspectedAt) });
}

export function normalizeAssetIncident(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assetRef", "assignmentRef", "inspectionRef", "incidentType", "severity", "resultingCondition", "description", "evidenceRefs", "occurredAt"]);
  return command(value, "ASSET_INCIDENT_CREATE", { assetRef: uuid(value.assetRef), assignmentRef: value.assignmentRef ? uuid(value.assignmentRef) : null, inspectionRef: value.inspectionRef ? uuid(value.inspectionRef) : null, incidentType: enumValue(value.incidentType, ["DAMAGE", "LOSS", "FAILURE", "MISUSE", "ACCIDENT", "OBSERVATION"]), severity: enumValue(value.severity, ["LOW", "MEDIUM", "HIGH", "CRITICAL"]), resultingCondition: value.resultingCondition ? enumValue(value.resultingCondition, ["GOOD", "FAIR", "DAMAGED", "UNSAFE"]) : null, description: text(value.description, 2000), evidenceRefs: evidence(value.evidenceRefs), occurredAt: timestamp(value.occurredAt) });
}

export function normalizeAssetMaintenance(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assetRef", "incidentRef", "maintenanceType", "title", "notes", "scheduledStart", "scheduledEnd", "costAmount", "currency"]);
  const range = interval(value.scheduledStart, value.scheduledEnd); const costAmount = decimal(value.costAmount, { optional: true }); const normalizedCurrency = currency(value.currency, true); if ((costAmount === null) !== (normalizedCurrency === null)) assetFail("ASSET_INPUT_INVALID");
  return command(value, "ASSET_MAINTENANCE_CREATE", { assetRef: uuid(value.assetRef), incidentRef: value.incidentRef ? uuid(value.incidentRef) : null, maintenanceType: enumValue(value.maintenanceType, ["PREVENTIVE", "CORRECTIVE", "INSPECTION", "REPAIR"]), title: text(value.title, 240), notes: text(value.notes, 2000, true), scheduledStart: range.startsAt, scheduledEnd: range.endsAt, costAmount, currency: normalizedCurrency });
}

export function normalizeAssetCostVersion(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "assetRef", "costType", "amount", "currency", "temporalUnit", "validFrom", "source"]);
  const costType = enumValue(value.costType, ["ACQUISITION", "REPLACEMENT", "INTERNAL_RATE", "MAINTENANCE"]); const temporalUnit = text(value.temporalUnit, 24, true);
  if (costType === "INTERNAL_RATE" && !temporalUnit || costType !== "INTERNAL_RATE" && temporalUnit) assetFail("ASSET_INPUT_INVALID");
  return command(value, "ASSET_COST_VERSION_CREATE", { assetRef: uuid(value.assetRef), costType, amount: decimal(value.amount), currency: currency(value.currency), temporalUnit, validFrom: timestamp(value.validFrom), source: text(value.source, 80) });
}

export function normalizeExternalOffer(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "modelRef", "providerReference", "providerName", "resourceDescription", "capacity", "rateAmount", "currency", "temporalUnit", "validFrom", "validTo", "availabilityStatus", "terms", "contractualReference"]);
  const rateAmount = decimal(value.rateAmount, { optional: true }); const normalizedCurrency = currency(value.currency, true); const temporalUnit = text(value.temporalUnit, 24, true); if ((rateAmount === null) !== (normalizedCurrency === null) || (rateAmount === null) !== (temporalUnit === null)) assetFail("ASSET_INPUT_INVALID");
  const validFrom = value.validFrom ? timestamp(value.validFrom) : null; const validTo = value.validTo ? timestamp(value.validTo) : null; if (validFrom && validTo && Date.parse(validTo) <= Date.parse(validFrom)) assetFail("ASSET_INTERVAL_INVALID");
  return command(value, "EXTERNAL_OFFER_CREATE", { modelRef: value.modelRef ? uuid(value.modelRef) : null, providerReference: text(value.providerReference, 191), providerName: text(value.providerName, 160), resourceDescription: text(value.resourceDescription, 500), capacity: jsonObject(value.capacity), rateAmount, currency: normalizedCurrency, temporalUnit, validFrom, validTo, availabilityStatus: enumValue(value.availabilityStatus, ["UNCONFIRMED", "AVAILABLE", "UNAVAILABLE"]), terms: jsonObject(value.terms), contractualReference: text(value.contractualReference, 191, true) });
}

export function normalizeExternalReservation(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "offerRef", "caseRef", "startsAt", "endsAt", "quantity", "agreedAmount", "currency", "operationalReference"]);
  const range = interval(value.startsAt, value.endsAt); const agreedAmount = decimal(value.agreedAmount, { optional: true }); const normalizedCurrency = currency(value.currency, true); if ((agreedAmount === null) !== (normalizedCurrency === null)) assetFail("ASSET_INPUT_INVALID");
  return command(value, "EXTERNAL_RESERVATION_CREATE", { offerRef: uuid(value.offerRef), caseRef: value.caseRef ? uuid(value.caseRef) : null, ...range, quantity: integer(value.quantity, 1, 10_000), agreedAmount, currency: normalizedCurrency, operationalReference: text(value.operationalReference, 191, true) });
}

export function assetAvailability({ asset, reservations, assignments, maintenance, startsAt, endsAt }) {
  const range = interval(startsAt, endsAt); const overlaps = (row, startKey, endKey) => Date.parse(row[startKey]) < Date.parse(range.endsAt) && Date.parse(row[endKey]) > Date.parse(range.startsAt);
  const blockedStatus = ["MAINTENANCE", "OUT_OF_SERVICE", "LOST", "RETIRED"].includes(asset.operationalStatus) || asset.physicalCondition === "UNSAFE";
  const reserved = reservations.some((row) => row.status === "ACTIVE" && overlaps(row, "startsAt", "endsAt"));
  const assigned = assignments.some((row) => row.status === "ACTIVE");
  const underMaintenance = maintenance.some((row) => ["SCHEDULED", "IN_PROGRESS"].includes(row.status) && overlaps(row, "scheduledStart", "scheduledEnd"));
  return Object.freeze({ available: !blockedStatus && !reserved && !assigned && !underMaintenance, blockedStatus, reserved, assigned, maintenance: underMaintenance, interval: range });
}

export function resourceAvailability(resource) {
  if (resource.kind === "ASSET_INSTANCE") return Object.freeze({ kind: resource.kind, resourceRef: uuid(resource.assetRef), available: Boolean(resource.available), capacity: Object.freeze({ ...(resource.capacity || {}) }), locationRef: resource.locationRef ? uuid(resource.locationRef) : null });
  if (resource.kind === "VEHICLE") return Object.freeze({ kind: resource.kind, resourceRef: text(resource.vehicleCode, 80), available: Boolean(resource.available), capacity: Object.freeze({ ...(resource.capacity || {}) }), locationRef: null });
  if (resource.kind === "EXTERNAL_OFFER") return Object.freeze({ kind: resource.kind, resourceRef: uuid(resource.offerRef), available: resource.availabilityStatus === "AVAILABLE", capacity: Object.freeze({ ...(resource.capacity || {}) }), locationRef: null });
  assetFail("ASSET_RESOURCE_KIND_INVALID");
}
