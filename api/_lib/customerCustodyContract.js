import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPERATIONS = new Set(["VIEW", "RECEIVE", "PUT_AWAY", "TRANSFER", "COUNT", "PREPARE_EXIT", "DISPATCH", "RETURN", "ADJUST"]);
const SCOPES = new Set(["INTERNAL_MATERIALS", "INTERNAL_ASSETS", "CUSTOMER_CUSTODY"]);
const CONDITIONS = new Set(["UNSPECIFIED", "GOOD", "USED", "DAMAGED"]);
const STORAGE_TYPES = new Set(["PERSONAL_EFFECTS", "IMPORT_STORAGE", "INTERNATIONAL_DISPATCH", "COMMERCIAL_STORAGE"]);
const INTAKE_SOURCES = new Set(["OWN_PICKUP", "EXTERNAL_ORIGIN", "COMMERCIAL_PRE_ADVICE", "DIRECT_WAREHOUSE"]);
const MOVEMENTS = new Set(["PUT_AWAY", "TRANSFER", "COUNT", "PREPARE_EXIT", "DISPATCH", "RETURN", "ADJUST", "HOLD", "RELEASE_HOLD"]);
const RECEPTION_ACTIONS = new Set(["ARRIVE", "CONFIRM_HANDOFF", "RECORD_VEHICLE_PHOTO", "PREPARE_LABEL", "DISCARD_UNUSED_LABELS", "FINISH_UNLOADING", "SCAN_ITEM", "RECORD_CONDITION", "DESCRIBE_ITEM", "REGISTER_UNLABELED_ITEM", "CONFIRM_INSPECTION", "PUT_AWAY_SCAN", "STAGE_EXCESS", "SET_LOCATION_STATUS", "REPORT_EXCEPTION", "RESOLVE_EXCEPTION", "CLOSE"]);
const UNIT_TYPES = new Set(["BOX", "PACKAGE", "BUNDLE", "PALLET", "LOOSE_ITEM", "CRATE", "OTHER"]);
const INSPECTION_RESULTS = new Set(["CLEARED", "HOLD"]);
const LOCATION_STATUSES = new Set(["AVAILABLE", "IN_USE", "FULL", "BLOCKED", "RESERVED_EXIT", "REVIEW_REQUIRED"]);
const AUTHORIZATION_TYPES = new Set(["ENTRY", "EXIT"]);
const EXIT_REASONS = new Set(["NORMAL", "OVERFLOW_RETURN"]);
const PAYMENT_CLEARANCES = new Set(["NOT_APPLICABLE", "CURRENT", "OVERRIDE_APPROVED"]);
const EXCESS_REASONS = new Set(["CONTRACTED_CAPACITY_FULL", "UNDECLARED_ADDITIONAL_ITEMS", "CUSTOMER_DECLINED_EXPANSION", "COMPANY_ESTIMATION_ERROR", "WAREHOUSE_CAPACITY_FAILURE", "OTHER_AUTHORIZED"]);
const BILLING_PARTY_TYPES = new Set(["CLIENT", "COMPANY", "THIRD_PARTY"]);
const BILLING_FREQUENCIES = new Set(["MONTHLY", "WEEKLY", "QUARTERLY", "CUSTOM"]);
const STORAGE_CAPACITY_BASES = new Set(["TWENTY_FOOT_CONTAINER", "FORTY_FOOT_CONTAINER", "CUBIC_METER", "FIXED_SPACE", "CUSTOM"]);
const CATALOG_KINDS = new Set(["DAMAGE_LOCATION", "CONDITION", "ITEM_NAME", "PACKAGE_FORM"]);
const CATALOG_STATUSES = new Set(["ACTIVE", "INACTIVE"]);

export class CustomerCustodyError extends Error {
  constructor(code, status = 400) { super(code); this.name = "CustomerCustodyError"; this.code = code; this.status = status; }
}
export function custodyFail(code, status = 400) { throw new CustomerCustodyError(code, status); }
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
export function custodyPayloadHash(value) { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return value; }
function exact(value, keys) { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); }
function text(value, max = 240, optional = false) { if (optional && (value === null || value === undefined || value === "")) return null; if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return value; }
function uuid(value, optional = false) { const result = text(value, 36, optional); if (result === null) return null; if (!UUID.test(result)) custodyFail("CUSTOMER_CUSTODY_RESOURCE_NOT_FOUND", 404); return result; }
function integer(value, min = 1, max = 1_000_000, optional = false) { if (optional && (value === null || value === undefined)) return null; if (!Number.isSafeInteger(value) || value < min || value > max) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return value; }
function decimal(value, optional = false) { if (optional && (value === null || value === undefined)) return null; if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return value; }
function nonnegativeDecimal(value) { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return value; }
function enumeration(value, allowed) { const result = text(value, 80); if (!allowed.has(result)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return result; }
function instant(value, optional = false) { const result = text(value, 40, optional); if (result === null) return null; if (new Date(result).toISOString() !== result) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return result; }
function dateOnly(value) { const result = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T00:00:00.000Z`).toISOString().slice(0, 10) !== result) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return result; }
function evidence(value, maxLength = 500) { if (value === null) return null; if (!Array.isArray(value) || value.length > 64 || value.some((item) => typeof item !== "string" || item.length < 1 || item.length > maxLength)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return Object.freeze([...value]); }
function textList(value, maxItems = 12) { if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); const rows = value.map((item) => text(item, 120)); if (new Set(rows).size !== rows.length) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return Object.freeze(rows); }
function command(value, operation, payload) { const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64); const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key))); if (!SHA.test(payloadHash) || payloadHash !== custodyPayloadHash({ operation, requestId, ...body })) custodyFail("CUSTOMER_CUSTODY_PAYLOAD_HASH_MISMATCH"); return Object.freeze({ operation, requestId, payloadHash, ...payload }); }

export function normalizeCustodyReceipt(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "authorizationRef", "clientRef", "caseRef", "warehouseRef", "destinationLocationRef", "storageType", "intakeSource", "manifestCode", "expectedUnits", "groupLeadName", "driverName", "vehicleCode", "sealNumber", "departedAt", "arrivedAt", "receivedAt", "billingStartAt", "notes", "items"]);
  if (!Array.isArray(value.items) || value.items.length > 500) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const items = value.items.map((entry, index) => { const row = object(entry); exact(row, ["externalCode", "description", "category", "quantity", "unit", "volumeM3", "weightKg", "condition", "evidence", "notes"]); return Object.freeze({ position: index + 1, externalCode: text(row.externalCode, 120, true), description: text(row.description), category: text(row.category, 120, true), quantity: decimal(row.quantity), unit: text(row.unit, 24), volumeM3: decimal(row.volumeM3, true), weightKg: decimal(row.weightKg, true), condition: enumeration(row.condition, CONDITIONS), evidence: evidence(row.evidence), notes: text(row.notes, 2000, true) }); });
  const externalCodes = items.map((item) => item.externalCode).filter(Boolean); if (new Set(externalCodes).size !== externalCodes.length) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const receivedAt = instant(value.receivedAt); const billingStartAt = value.billingStartAt ? instant(value.billingStartAt) : null;
  const expectedUnits = integer(value.expectedUnits, 1, 100_000, true); if (items.length > 0 && expectedUnits !== null && expectedUnits !== items.length) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_CUSTODY_RECEIVE", { authorizationRef: uuid(value.authorizationRef), clientRef: uuid(value.clientRef), caseRef: uuid(value.caseRef), warehouseRef: uuid(value.warehouseRef), destinationLocationRef: uuid(value.destinationLocationRef), storageType: enumeration(value.storageType, STORAGE_TYPES), intakeSource: enumeration(value.intakeSource, INTAKE_SOURCES), manifestCode: text(value.manifestCode, 80, true), expectedUnits, groupLeadName: text(value.groupLeadName, 160, true), driverName: text(value.driverName, 160, true), vehicleCode: text(value.vehicleCode, 64, true), sealNumber: text(value.sealNumber, 80, true), departedAt: instant(value.departedAt, true), arrivedAt: instant(value.arrivedAt, true), receivedAt, billingStartAt, notes: text(value.notes, 2000, true), items: Object.freeze(items) });
}

export function normalizeStorageAuthorizationCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "agreementRef", "caseRef", "serviceSelectionRef", "movementType", "storageType", "intakeSource", "exitReason", "paymentClearance", "paymentVerifiedAt", "paymentReference", "warehouseRef", "plannedAt", "validUntil", "manifestCode", "originText", "destinationText", "instructions"]);
  const movementType = enumeration(value.movementType, AUTHORIZATION_TYPES);
  const intakeSource = value.intakeSource === null ? null : enumeration(value.intakeSource, INTAKE_SOURCES);
  if ((movementType === "ENTRY") !== Boolean(intakeSource)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const exitReason = value.exitReason === null ? null : enumeration(value.exitReason, EXIT_REASONS);
  const paymentClearance = enumeration(value.paymentClearance, PAYMENT_CLEARANCES);
  const paymentVerifiedAt = instant(value.paymentVerifiedAt, true);
  const paymentReference = text(value.paymentReference, 191, true);
  if (movementType === "ENTRY" && (exitReason !== null || paymentClearance !== "NOT_APPLICABLE" || paymentVerifiedAt !== null || paymentReference !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (movementType === "EXIT" && !exitReason) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (exitReason === "OVERFLOW_RETURN" && (paymentClearance !== "NOT_APPLICABLE" || paymentVerifiedAt !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (exitReason === "NORMAL" && (!new Set(["CURRENT", "OVERRIDE_APPROVED"]).has(paymentClearance) || paymentVerifiedAt === null)) custodyFail("CUSTOMER_CUSTODY_PAYMENT_CLEARANCE_REQUIRED", 409);
  if (paymentClearance === "OVERRIDE_APPROVED" && !paymentReference) custodyFail("CUSTOMER_CUSTODY_PAYMENT_CLEARANCE_REQUIRED", 409);
  const plannedAt = instant(value.plannedAt); const validUntil = instant(value.validUntil);
  if (new Date(validUntil) <= new Date(plannedAt)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_STORAGE_AUTHORIZATION_CREATE", { agreementRef: uuid(value.agreementRef), caseRef: uuid(value.caseRef), serviceSelectionRef: uuid(value.serviceSelectionRef), movementType, storageType: enumeration(value.storageType, STORAGE_TYPES), intakeSource, exitReason, paymentClearance, paymentVerifiedAt, paymentReference, warehouseRef: uuid(value.warehouseRef), plannedAt, validUntil, manifestCode: text(value.manifestCode, 80, true), originText: text(value.originText, 500, true), destinationText: text(value.destinationText, 500, true), instructions: text(value.instructions, 2000, true) });
}

export function normalizeStorageAgreementSave(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "caseRef", "serviceSelectionRef", "acceptedProposalRevisionRef", "holderName", "identityType", "identityNumberMasked", "identityEvidenceRef", "billingPartyType", "billingName", "billingTaxId", "billingEmail", "billingAddress", "billingCurrency", "billingFrequency", "invoiceDay", "startDate", "estimatedDurationMonths", "estimatedEndDate", "capacityBasis", "capacityQuantity", "termsVersion"]);
  const startDate = dateOnly(value.startDate); const estimatedEndDate = dateOnly(value.estimatedEndDate);
  if (estimatedEndDate < startDate) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const billingEmail = text(value.billingEmail, 320); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const billingCurrency = text(value.billingCurrency, 3); if (!/^[A-Z]{3}$/.test(billingCurrency)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_STORAGE_AGREEMENT_SAVE", { caseRef: uuid(value.caseRef), serviceSelectionRef: uuid(value.serviceSelectionRef), acceptedProposalRevisionRef: uuid(value.acceptedProposalRevisionRef), holderName: text(value.holderName, 200), identityType: text(value.identityType, 40), identityNumberMasked: text(value.identityNumberMasked, 40), identityEvidenceRef: text(value.identityEvidenceRef, 191), billingPartyType: enumeration(value.billingPartyType, BILLING_PARTY_TYPES), billingName: text(value.billingName, 200), billingTaxId: text(value.billingTaxId, 40, true), billingEmail, billingAddress: text(value.billingAddress, 500), billingCurrency, billingFrequency: enumeration(value.billingFrequency, BILLING_FREQUENCIES), invoiceDay: integer(value.invoiceDay, 1, 28), startDate, estimatedDurationMonths: integer(value.estimatedDurationMonths, 1, 600), estimatedEndDate, capacityBasis: enumeration(value.capacityBasis, STORAGE_CAPACITY_BASES), capacityQuantity: decimal(value.capacityQuantity), termsVersion: text(value.termsVersion, 80) });
}

export function normalizeStorageAgreementActivate(input, agreementRef) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion", "acceptedAt", "signedAt", "acceptanceEvidenceRef"]);
  const acceptedAt = instant(value.acceptedAt); const signedAt = instant(value.signedAt); if (new Date(signedAt) < new Date(acceptedAt)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_STORAGE_AGREEMENT_ACTIVATE", { agreementRef: uuid(agreementRef), expectedVersion: integer(value.expectedVersion), acceptedAt, signedAt, acceptanceEvidenceRef: text(value.acceptanceEvidenceRef, 191) });
}

export function normalizeCustodyReceptionAction(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "storageRef", "action", "itemRef", "scanCode", "locationRef", "unitType", "packageFormCode", "genericContents", "inspectionResult", "locationStatus", "excessReason", "labelQuantity", "occurredAt", "notes", "evidence", "expectedLotVersion", "expectedItemVersion"]);
  const action = enumeration(value.action, RECEPTION_ACTIONS); const itemRef = uuid(value.itemRef, true); const scanCode = text(value.scanCode, 120, true); const locationRef = uuid(value.locationRef, true); const expectedItemVersion = integer(value.expectedItemVersion, 1, 1_000_000, true); const normalizedEvidence = evidence(value.evidence, action === "RECORD_VEHICLE_PHOTO" ? 400_000 : 500);
  const unitType = value.unitType === null ? null : enumeration(value.unitType, UNIT_TYPES); const packageFormCode = text(value.packageFormCode, 64, true); const genericContents = value.genericContents === null ? null : textList(value.genericContents); const inspectionResult = value.inspectionResult === null ? null : enumeration(value.inspectionResult, INSPECTION_RESULTS); const locationStatus = value.locationStatus === null ? null : enumeration(value.locationStatus, LOCATION_STATUSES); const excessReason = value.excessReason === null ? null : enumeration(value.excessReason, EXCESS_REASONS); const labelQuantity = integer(value.labelQuantity, 1, 250, true);
  if (action === "SCAN_ITEM" && (!scanCode || expectedItemVersion === null || itemRef !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "PREPARE_LABEL" && (unitType !== null || packageFormCode !== null || genericContents !== null || itemRef !== null || scanCode !== null || locationRef !== null || expectedItemVersion !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (["DISCARD_UNUSED_LABELS", "FINISH_UNLOADING"].includes(action) && (unitType !== null || packageFormCode !== null || genericContents !== null || itemRef !== null || scanCode !== null || locationRef !== null || expectedItemVersion !== null || normalizedEvidence !== null || inspectionResult !== null || locationStatus !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action !== "PREPARE_LABEL" && labelQuantity !== null) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "RECORD_CONDITION" && (!itemRef || expectedItemVersion === null || normalizedEvidence === null || normalizedEvidence.length < 1 || scanCode !== null || locationRef !== null || unitType !== null || packageFormCode !== null || genericContents !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "DESCRIBE_ITEM" && (!itemRef || expectedItemVersion === null || !packageFormCode || unitType !== null || !genericContents || scanCode !== null || locationRef !== null || normalizedEvidence !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "REGISTER_UNLABELED_ITEM" && (!unitType || packageFormCode !== null || !genericContents || itemRef !== null || scanCode !== null || locationRef !== null || expectedItemVersion !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action !== "REGISTER_UNLABELED_ITEM" && unitType !== null) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action !== "DESCRIBE_ITEM" && packageFormCode !== null) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (!["DESCRIBE_ITEM", "REGISTER_UNLABELED_ITEM"].includes(action) && genericContents !== null) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "CONFIRM_INSPECTION" && (!itemRef || expectedItemVersion === null || !inspectionResult || scanCode !== null || locationRef !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "PUT_AWAY_SCAN" && (!scanCode || !locationRef || itemRef !== null || expectedItemVersion === null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "STAGE_EXCESS" && (!scanCode || !locationRef || itemRef !== null || expectedItemVersion === null || !excessReason)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action !== "STAGE_EXCESS" && excessReason !== null) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "SET_LOCATION_STATUS" && (!locationRef || !locationStatus || itemRef !== null || scanCode !== null || expectedItemVersion !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (["REPORT_EXCEPTION", "RESOLVE_EXCEPTION"].includes(action) && (!itemRef || expectedItemVersion === null || scanCode !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (["ARRIVE", "CONFIRM_HANDOFF", "CLOSE"].includes(action) && (itemRef !== null || scanCode !== null || locationRef !== null || expectedItemVersion !== null || normalizedEvidence !== null)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  if (action === "RECORD_VEHICLE_PHOTO" && (itemRef !== null || scanCode !== null || locationRef !== null || expectedItemVersion !== null || normalizedEvidence === null || normalizedEvidence.length !== 1 || !normalizedEvidence[0].startsWith("data:image/"))) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_CUSTODY_RECEPTION_ACTION", { storageRef: uuid(value.storageRef), action, itemRef, scanCode, locationRef, unitType, packageFormCode, genericContents, inspectionResult, locationStatus, excessReason, labelQuantity: action === "PREPARE_LABEL" ? labelQuantity ?? 1 : null, occurredAt: instant(value.occurredAt), notes: text(value.notes, 1000, true), evidence: normalizedEvidence, expectedLotVersion: integer(value.expectedLotVersion), expectedItemVersion });
}

export function normalizeCustodyWarehouseSetting(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "warehouseRef", "unloadTargetMinutes", "excessExitLocationRef", "excessGraceHours", "excessDailyRate", "excessCurrency", "expectedVersion"]);
  const excessCurrency = text(value.excessCurrency, 3); if (!/^[A-Z]{3}$/u.test(excessCurrency)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_CUSTODY_WAREHOUSE_SETTING_UPDATE", { warehouseRef: uuid(value.warehouseRef), unloadTargetMinutes: integer(value.unloadTargetMinutes, 15, 1440), excessExitLocationRef: uuid(value.excessExitLocationRef), excessGraceHours: integer(value.excessGraceHours, 0, 720), excessDailyRate: nonnegativeDecimal(value.excessDailyRate), excessCurrency, expectedVersion: integer(value.expectedVersion) });
}

export function normalizeCustodyMovement(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "authorizationRef", "storageRef", "itemRef", "movementType", "destinationLocationRef", "quantity", "occurredAt", "notes", "expectedVersion"]);
  const movementType = enumeration(value.movementType, MOVEMENTS); const destinationLocationRef = uuid(value.destinationLocationRef, true);
  if (["PUT_AWAY", "TRANSFER", "RETURN"].includes(movementType) !== Boolean(destinationLocationRef)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const authorizationRef = uuid(value.authorizationRef, true); if (["PREPARE_EXIT", "DISPATCH"].includes(movementType) !== Boolean(authorizationRef)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_CUSTODY_MOVE", { authorizationRef, storageRef: uuid(value.storageRef), itemRef: uuid(value.itemRef, true), movementType, destinationLocationRef, quantity: decimal(value.quantity, true), occurredAt: instant(value.occurredAt), notes: text(value.notes, 1000, true), expectedVersion: integer(value.expectedVersion) });
}

export function normalizeCustodyPreviewReset(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "storageRef", "confirmLotCode"]);
  return command(value, "CUSTOMER_CUSTODY_PREVIEW_RESET", { storageRef: uuid(value.storageRef), confirmLotCode: text(value.confirmLotCode, 64) });
}

export function normalizeWarehouseGrant(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "membershipRef", "warehouseRef", "locationRef", "inventoryScope", "operations"]);
  if (!Array.isArray(value.operations) || value.operations.length < 1 || value.operations.length > OPERATIONS.size) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const operations = value.operations.map((operation) => enumeration(operation, OPERATIONS)); if (new Set(operations).size !== operations.length) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "WAREHOUSE_ACCESS_GRANT_CREATE", { membershipRef: uuid(value.membershipRef), warehouseRef: uuid(value.warehouseRef, true), locationRef: uuid(value.locationRef, true), inventoryScope: enumeration(value.inventoryScope, SCOPES), operations: Object.freeze(operations) });
}

export function normalizeWarehouseGrantUpdate(input, grantRef) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion", "operations", "status"]);
  if (!Array.isArray(value.operations) || value.operations.length < 1 || value.operations.length > OPERATIONS.size) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const operations = value.operations.map((operation) => enumeration(operation, OPERATIONS)); if (new Set(operations).size !== operations.length) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const normalizedRef = uuid(grantRef); const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64); const body = { expectedVersion: value.expectedVersion, operations: value.operations, status: value.status };
  if (!SHA.test(payloadHash) || payloadHash !== custodyPayloadHash({ operation: "WAREHOUSE_ACCESS_GRANT_UPDATE", requestId, grantRef: normalizedRef, ...body })) custodyFail("CUSTOMER_CUSTODY_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation: "WAREHOUSE_ACCESS_GRANT_UPDATE", requestId, payloadHash, grantRef: normalizedRef, expectedVersion: integer(value.expectedVersion), operations: Object.freeze(operations), status: enumeration(value.status, new Set(["ACTIVE", "INACTIVE"])) });
}

export function normalizeCustodyCatalogCreate(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "kind", "code", "label", "baseValue", "sortOrder"]);
  const kind = enumeration(value.kind, CATALOG_KINDS);
  const code = text(value.code, 64); if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/u.test(code)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const baseValue = value.baseValue === null ? null : enumeration(value.baseValue, UNIT_TYPES);
  if ((kind === "PACKAGE_FORM") !== Boolean(baseValue)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_CUSTODY_CATALOG_CREATE", { kind, code, label: text(value.label, 120), baseValue, sortOrder: integer(value.sortOrder, 1, 10_000) });
}

export function normalizeCustodyCatalogUpdate(input, catalogRef) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "expectedVersion", "label", "baseValue", "status", "sortOrder"]);
  const normalizedRef = uuid(catalogRef); const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64);
  const body = { expectedVersion: value.expectedVersion, label: value.label, baseValue: value.baseValue, status: value.status, sortOrder: value.sortOrder };
  if (!SHA.test(payloadHash) || payloadHash !== custodyPayloadHash({ operation: "CUSTOMER_CUSTODY_CATALOG_UPDATE", requestId, catalogRef: normalizedRef, ...body })) custodyFail("CUSTOMER_CUSTODY_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation: "CUSTOMER_CUSTODY_CATALOG_UPDATE", requestId, payloadHash, catalogRef: normalizedRef, expectedVersion: integer(value.expectedVersion), label: text(value.label, 120), baseValue: value.baseValue === null ? null : enumeration(value.baseValue, UNIT_TYPES), status: enumeration(value.status, CATALOG_STATUSES), sortOrder: integer(value.sortOrder, 1, 10_000) });
}
