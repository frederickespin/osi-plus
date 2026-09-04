import { createHash } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z][A-Z0-9_-]{0,63}$/;
const MOVEMENT_TYPES = new Set(["RECEIPT", "TRANSFER_OUT", "TRANSFER_IN", "ISSUE", "CONSUMPTION", "RETURN", "ADJUSTMENT_POSITIVE", "ADJUSTMENT_NEGATIVE"]);
const FORMULA_TYPES = new Set(["FIXED", "PER_ITEM", "PER_LENGTH", "PER_AREA"]);

export class MaterialsInventoryError extends Error {
  constructor(code, status = 400) { super(code); this.name = "MaterialsInventoryError"; this.code = code; this.status = status; }
}
export function materialFail(code, status = 400) { throw new MaterialsInventoryError(code, status); }
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
export function canonicalPayloadHash(value) { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) materialFail("MATERIALS_INPUT_INVALID"); return value; }
function exact(value, keys) { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) materialFail("MATERIALS_INPUT_INVALID"); }
function text(value, max = 320, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max) materialFail("MATERIALS_INPUT_INVALID");
  return value;
}
function uuid(value) { const result = text(value, 36); if (!UUID_V4.test(result)) materialFail("MATERIALS_RESOURCE_NOT_FOUND", 404); return result; }
function decimal(value, { min = 0, max = 1_000_000_000, optional = false } = {}) {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) materialFail("MATERIALS_INPUT_INVALID");
  return value;
}
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) materialFail("MATERIALS_INPUT_INVALID"); return value; }
function enumValue(value, allowed) { const result = text(value, 80); if (!allowed.has(result)) materialFail("MATERIALS_INPUT_INVALID"); return result; }
function command(value, operation, payload) {
  const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64);
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key)));
  const computed = canonicalPayloadHash({ operation, requestId, ...body });
  if (!SHA256.test(payloadHash) || payloadHash !== computed) materialFail("MATERIALS_PAYLOAD_HASH_MISMATCH", 400);
  return Object.freeze({ operation, requestId, payloadHash, ...payload });
}
function code(value) { const result = text(value, 64); if (!CODE.test(result)) materialFail("MATERIALS_INPUT_INVALID"); return result; }

export function normalizeMaterialCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "code", "name", "description", "family", "subfamily", "baseUnitRef", "purchaseUnitRef", "consumptionUnitRef", "technicalFlags", "dimensionPolicy", "lotTrackingEnabled", "minimumStock", "maximumStock", "reorderPoint", "sortOrder"]);
  if (!Array.isArray(value.technicalFlags) || value.technicalFlags.length > 32 || !value.dimensionPolicy || typeof value.dimensionPolicy !== "object" || Array.isArray(value.dimensionPolicy) || typeof value.lotTrackingEnabled !== "boolean") materialFail("MATERIALS_INPUT_INVALID");
  const thresholds = {
    minimumStock: decimal(value.minimumStock, { optional: true }), maximumStock: decimal(value.maximumStock, { optional: true }), reorderPoint: decimal(value.reorderPoint, { optional: true }),
  };
  if (thresholds.minimumStock !== null && thresholds.maximumStock !== null && thresholds.minimumStock > thresholds.maximumStock) materialFail("MATERIALS_INPUT_INVALID");
  return command(value, "MATERIAL_CREATE", {
    code: code(value.code), name: text(value.name, 160), description: text(value.description, 1000, true), family: text(value.family, 80), subfamily: text(value.subfamily, 80, true),
    baseUnitRef: uuid(value.baseUnitRef), purchaseUnitRef: uuid(value.purchaseUnitRef), consumptionUnitRef: uuid(value.consumptionUnitRef),
    technicalFlags: Object.freeze(value.technicalFlags.map((flag) => code(flag))), dimensionPolicy: Object.freeze({ ...value.dimensionPolicy }), lotTrackingEnabled: value.lotTrackingEnabled,
    ...thresholds, sortOrder: integer(value.sortOrder, 0, 1_000_000),
  });
}

export function normalizeMaterialUpdate(input, materialRef) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion", "name", "description", "family", "subfamily", "technicalFlags", "dimensionPolicy", "lotTrackingEnabled", "minimumStock", "maximumStock", "reorderPoint", "sortOrder", "status"]);
  if (!Array.isArray(value.technicalFlags) || value.technicalFlags.length > 32 || !value.dimensionPolicy || typeof value.dimensionPolicy !== "object" || Array.isArray(value.dimensionPolicy) || typeof value.lotTrackingEnabled !== "boolean") materialFail("MATERIALS_INPUT_INVALID");
  const thresholds = { minimumStock: decimal(value.minimumStock, { optional: true }), maximumStock: decimal(value.maximumStock, { optional: true }), reorderPoint: decimal(value.reorderPoint, { optional: true }) };
  if (thresholds.minimumStock !== null && thresholds.maximumStock !== null && thresholds.minimumStock > thresholds.maximumStock) materialFail("MATERIALS_INPUT_INVALID");
  const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64); const normalizedRef = uuid(materialRef);
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key)));
  if (!SHA256.test(payloadHash) || payloadHash !== canonicalPayloadHash({ operation: "MATERIAL_UPDATE", requestId, materialRef: normalizedRef, ...body })) materialFail("MATERIALS_PAYLOAD_HASH_MISMATCH", 400);
  return Object.freeze({ operation: "MATERIAL_UPDATE", requestId, payloadHash, materialRef: normalizedRef, expectedVersion: integer(value.expectedVersion, 1, 1_000_000), name: text(value.name, 160), description: text(value.description, 1000, true), family: text(value.family, 80), subfamily: text(value.subfamily, 80, true), technicalFlags: Object.freeze(value.technicalFlags.map((flag) => code(flag))), dimensionPolicy: Object.freeze({ ...value.dimensionPolicy }), lotTrackingEnabled: value.lotTrackingEnabled, ...thresholds, sortOrder: integer(value.sortOrder, 0, 1_000_000), status: enumValue(value.status, new Set(["ACTIVE", "INACTIVE"])) });
}

export function normalizeUnitCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "code", "name", "decimalPlaces"]);
  return command(value, "UNIT_CREATE", { code: code(value.code), name: text(value.name, 80), decimalPlaces: integer(value.decimalPlaces, 0, 6) });
}

export function normalizeWarehouseCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "code", "name", "locations"]);
  if (!Array.isArray(value.locations) || value.locations.length < 1 || value.locations.length > 500) materialFail("MATERIALS_INPUT_INVALID");
  const locations = value.locations.map((entry, position) => {
    const row = object(entry); exact(row, ["code", "name", "kind", "parentCode"]);
    return Object.freeze({ code: code(row.code), name: text(row.name, 160), kind: enumValue(row.kind, new Set(["WAREHOUSE_ROOT", "ZONE", "AISLE", "RACK", "LEVEL", "BIN", "RECEIVING", "DISPATCH", "QUARANTINE", "OTHER"])), parentCode: text(row.parentCode, 64, true), position });
  });
  if (new Set(locations.map((row) => row.code)).size !== locations.length || locations.filter((row) => row.parentCode === null).length !== 1 || locations.some((row) => row.parentCode && !locations.some((parent) => parent.code === row.parentCode && parent.position < row.position))) materialFail("MATERIALS_LOCATION_TREE_INVALID");
  return command(value, "WAREHOUSE_CREATE", { code: code(value.code), name: text(value.name, 160), locations: Object.freeze(locations) });
}

export function normalizeCostVersionCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "materialRef", "unitRef", "amount", "currency", "source", "supplierRef", "validFrom"]);
  const validFrom = text(value.validFrom, 40); if (new Date(validFrom).toISOString() !== validFrom) materialFail("MATERIALS_INPUT_INVALID");
  const currency = text(value.currency, 3); if (!/^[A-Z]{3}$/.test(currency)) materialFail("MATERIALS_INPUT_INVALID");
  return command(value, "COST_VERSION_CREATE", { materialRef: uuid(value.materialRef), unitRef: uuid(value.unitRef), amount: decimal(value.amount), currency, source: text(value.source, 80), supplierRef: value.supplierRef ? uuid(value.supplierRef) : null, validFrom });
}

export function normalizeUnitConversionCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "materialRef", "sourceUnitRef", "targetUnitRef", "multiplier", "validFrom"]);
  const sourceUnitRef = uuid(value.sourceUnitRef); const targetUnitRef = uuid(value.targetUnitRef);
  if (sourceUnitRef === targetUnitRef) materialFail("MATERIALS_INPUT_INVALID");
  const validFrom = text(value.validFrom, 40); if (new Date(validFrom).toISOString() !== validFrom) materialFail("MATERIALS_INPUT_INVALID");
  return command(value, "UNIT_CONVERSION_CREATE", { materialRef: uuid(value.materialRef), sourceUnitRef, targetUnitRef, multiplier: decimal(value.multiplier, { min: Number.EPSILON }), validFrom });
}

export function normalizeRecipeCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "code", "name", "applicability", "lines"]);
  if (!value.applicability || typeof value.applicability !== "object" || Array.isArray(value.applicability) || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 100) materialFail("MATERIALS_INPUT_INVALID");
  const lines = value.lines.map((entry, position) => {
    const row = object(entry); exact(row, ["materialRef", "unitRef", "formulaType", "fixedQuantity", "multiplier", "roundingIncrement", "wastePercent", "formulaConfig"]);
    const formulaType = enumValue(row.formulaType, FORMULA_TYPES); const fixedQuantity = decimal(row.fixedQuantity, { optional: true }); const multiplier = decimal(row.multiplier, { optional: true });
    if ((formulaType === "FIXED" && fixedQuantity === null) || (formulaType !== "FIXED" && multiplier === null) || !row.formulaConfig || typeof row.formulaConfig !== "object" || Array.isArray(row.formulaConfig)) materialFail("MATERIALS_INPUT_INVALID");
    return Object.freeze({ position, materialRef: uuid(row.materialRef), unitRef: uuid(row.unitRef), formulaType, fixedQuantity, multiplier, roundingIncrement: decimal(row.roundingIncrement, { min: Number.EPSILON }), wastePercent: decimal(row.wastePercent, { min: 0, max: 100 }), formulaConfig: Object.freeze({ ...row.formulaConfig }) });
  });
  if (new Set(lines.map((line) => `${line.materialRef}:${line.unitRef}`)).size !== lines.length) materialFail("MATERIALS_RECIPE_LINE_DUPLICATE");
  return command(value, "RECIPE_CREATE", { code: code(value.code), name: text(value.name, 160), applicability: Object.freeze({ ...value.applicability }), lines: Object.freeze(lines) });
}

export function normalizeRecipeVersionCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "recipeRef", "expectedActiveVersion", "applicability", "lines"]);
  if (!value.applicability || typeof value.applicability !== "object" || Array.isArray(value.applicability) || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 100) materialFail("MATERIALS_INPUT_INVALID");
  const lines = value.lines.map((entry, position) => {
    const row = object(entry); exact(row, ["materialRef", "unitRef", "formulaType", "fixedQuantity", "multiplier", "roundingIncrement", "wastePercent", "formulaConfig"]);
    const formulaType = enumValue(row.formulaType, FORMULA_TYPES); const fixedQuantity = decimal(row.fixedQuantity, { optional: true }); const multiplier = decimal(row.multiplier, { optional: true });
    if ((formulaType === "FIXED" && fixedQuantity === null) || (formulaType !== "FIXED" && multiplier === null) || !row.formulaConfig || typeof row.formulaConfig !== "object" || Array.isArray(row.formulaConfig)) materialFail("MATERIALS_INPUT_INVALID");
    return Object.freeze({ position, materialRef: uuid(row.materialRef), unitRef: uuid(row.unitRef), formulaType, fixedQuantity, multiplier, roundingIncrement: decimal(row.roundingIncrement, { min: Number.EPSILON }), wastePercent: decimal(row.wastePercent, { min: 0, max: 100 }), formulaConfig: Object.freeze({ ...row.formulaConfig }) });
  });
  if (new Set(lines.map((line) => `${line.materialRef}:${line.unitRef}`)).size !== lines.length) materialFail("MATERIALS_RECIPE_LINE_DUPLICATE");
  return command(value, "RECIPE_VERSION_ACTIVATE", { recipeRef: uuid(value.recipeRef), expectedActiveVersion: integer(value.expectedActiveVersion, 1, 1_000_000), applicability: Object.freeze({ ...value.applicability }), lines: Object.freeze(lines) });
}

export function normalizeMovement(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "movementType", "materialRef", "locationRef", "counterpartLocationRef", "quantity", "lotCode", "reasonCode", "reservationRef", "requirementRef"]);
  const movementType = enumValue(value.movementType, MOVEMENT_TYPES);
  if (movementType === "TRANSFER_IN") materialFail("MATERIALS_INPUT_INVALID");
  const counterpartLocationRef = text(value.counterpartLocationRef, 36, true);
  if ((movementType.startsWith("TRANSFER_") && !counterpartLocationRef) || (!movementType.startsWith("TRANSFER_") && counterpartLocationRef)) materialFail("MATERIALS_INPUT_INVALID");
  const locationRef = uuid(value.locationRef);
  const normalizedCounterpart = counterpartLocationRef ? uuid(counterpartLocationRef) : null;
  if (normalizedCounterpart === locationRef) materialFail("MATERIALS_INPUT_INVALID");
  return command(value, "INVENTORY_MOVEMENT", { movementType, materialRef: uuid(value.materialRef), locationRef, counterpartLocationRef: normalizedCounterpart, quantity: decimal(value.quantity, { min: Number.EPSILON }), lotCode: text(value.lotCode, 100, true), reasonCode: code(value.reasonCode), reservationRef: value.reservationRef ? uuid(value.reservationRef) : null, requirementRef: value.requirementRef ? uuid(value.requirementRef) : null });
}

export function normalizeReservation(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "materialRef", "locationRef", "quantity", "caseRef", "requirementRef", "cratingReference"]);
  return command(value, "RESERVATION_CREATE", { materialRef: uuid(value.materialRef), locationRef: uuid(value.locationRef), quantity: decimal(value.quantity, { min: Number.EPSILON }), caseRef: value.caseRef ? uuid(value.caseRef) : null, requirementRef: value.requirementRef ? uuid(value.requirementRef) : null, cratingReference: text(value.cratingReference, 191, true) });
}

export function normalizeReservationRelease(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "reservationRef", "expectedVersion", "reasonCode"]);
  return command(value, "RESERVATION_RELEASE", { reservationRef: uuid(value.reservationRef), expectedVersion: integer(value.expectedVersion, 1, 1_000_000), reasonCode: code(value.reasonCode) });
}

export function normalizeReservationAssign(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "reservationRef", "expectedVersion", "reasonCode"]);
  return command(value, "RESERVATION_ASSIGN", { reservationRef: uuid(value.reservationRef), expectedVersion: integer(value.expectedVersion, 1, 1_000_000), reasonCode: code(value.reasonCode) });
}

export function normalizePurchaseRequest(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "materialRef", "unitRef", "requirementRef", "quantity"]);
  return command(value, "PURCHASE_REQUEST_CREATE", { materialRef: uuid(value.materialRef), unitRef: uuid(value.unitRef), requirementRef: value.requirementRef ? uuid(value.requirementRef) : null, quantity: decimal(value.quantity, { min: Number.EPSILON }) });
}

export function normalizePurchaseTransition(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "purchaseRequestRef", "expectedVersion", "action", "locationRef", "lotCode", "reasonCode"]);
  const action = enumValue(value.action, new Set(["APPROVE", "ORDER", "RECEIVE", "CANCEL"]));
  const locationRef = value.locationRef ? uuid(value.locationRef) : null;
  if ((action === "RECEIVE") !== Boolean(locationRef)) materialFail("MATERIALS_INPUT_INVALID");
  return command(value, "PURCHASE_REQUEST_TRANSITION", { purchaseRequestRef: uuid(value.purchaseRequestRef), expectedVersion: integer(value.expectedVersion, 1, 1_000_000), action, locationRef, lotCode: text(value.lotCode, 100, true), reasonCode: code(value.reasonCode) });
}

export function normalizeRequirementResolution(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "surveyPublicationRef", "recipeVersionRef"]);
  return command(value, "REQUIREMENT_RESOLVE", { surveyPublicationRef: uuid(value.surveyPublicationRef), recipeVersionRef: uuid(value.recipeVersionRef) });
}

export const MOVEMENT_SIGN = Object.freeze({ RECEIPT: 1, TRANSFER_OUT: -1, TRANSFER_IN: 1, ISSUE: -1, CONSUMPTION: -1, RETURN: 1, ADJUSTMENT_POSITIVE: 1, ADJUSTMENT_NEGATIVE: -1 });
export function physicalStock(movements) { return movements.reduce((total, movement) => total + Number(movement.quantity) * (MOVEMENT_SIGN[movement.movementType] ?? materialFail("MATERIALS_MOVEMENT_INVALID")), 0); }
export function inventoryAvailability({ movements, reservations, assignments = [] }) {
  const physical = physicalStock(movements);
  const reserved = reservations.filter((row) => row.status === "RESERVED").reduce((total, row) => total + Number(row.quantity), 0);
  const assigned = [...reservations, ...assignments].filter((row) => row.status === "ASSIGNED").reduce((total, row) => total + Number(row.quantity), 0);
  return Object.freeze({ physical, reserved, assigned, available: physical - reserved - assigned });
}
export function resolveRecipeQuantity(line, facts) {
  const base = line.formulaType === "FIXED" ? Number(line.fixedQuantity) : line.formulaType === "PER_ITEM" ? Number(facts.quantity) * Number(line.multiplier) : line.formulaType === "PER_LENGTH" ? Number(facts.lengthM) * Number(line.multiplier) : line.formulaType === "PER_AREA" ? Number(facts.areaM2) * Number(line.multiplier) : materialFail("MATERIALS_RECIPE_FORMULA_INVALID");
  const withWaste = base * (1 + Number(line.wastePercent) / 100); const increment = Number(line.roundingIncrement);
  if (!(withWaste >= 0) || !(increment > 0)) materialFail("MATERIALS_RECIPE_FORMULA_INVALID");
  return Math.ceil((withWaste - Number.EPSILON) / increment) * increment;
}
