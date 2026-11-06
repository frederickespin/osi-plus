import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPERATIONS = new Set(["VIEW", "RECEIVE", "PUT_AWAY", "TRANSFER", "COUNT", "PREPARE_EXIT", "DISPATCH", "RETURN", "ADJUST"]);
const SCOPES = new Set(["INTERNAL_MATERIALS", "INTERNAL_ASSETS", "CUSTOMER_CUSTODY"]);
const CONDITIONS = new Set(["UNSPECIFIED", "GOOD", "USED", "DAMAGED"]);
const MOVEMENTS = new Set(["PUT_AWAY", "TRANSFER", "COUNT", "PREPARE_EXIT", "DISPATCH", "RETURN", "ADJUST", "HOLD", "RELEASE_HOLD"]);

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
function integer(value, min = 1, max = 1_000_000) { if (!Number.isSafeInteger(value) || value < min || value > max) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return value; }
function decimal(value, optional = false) { if (optional && (value === null || value === undefined)) return null; if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return value; }
function enumeration(value, allowed) { const result = text(value, 80); if (!allowed.has(result)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return result; }
function instant(value) { const result = text(value, 40); if (new Date(result).toISOString() !== result) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return result; }
function command(value, operation, payload) { const requestId = text(value.requestId, 191); const payloadHash = text(value.payloadHash, 64); const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key))); if (!SHA.test(payloadHash) || payloadHash !== custodyPayloadHash({ operation, requestId, ...body })) custodyFail("CUSTOMER_CUSTODY_PAYLOAD_HASH_MISMATCH"); return Object.freeze({ operation, requestId, payloadHash, ...payload }); }

export function normalizeCustodyReceipt(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "clientRef", "caseRef", "warehouseRef", "destinationLocationRef", "receivedAt", "billingStartAt", "notes", "items"]);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 500) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  const items = value.items.map((entry, index) => { const row = object(entry); exact(row, ["description", "category", "quantity", "unit", "volumeM3", "weightKg", "condition", "evidence", "notes"]); if (row.evidence !== null && (!Array.isArray(row.evidence) || row.evidence.length > 12 || row.evidence.some((item) => typeof item !== "string" || item.length > 500))) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID"); return Object.freeze({ position: index + 1, description: text(row.description), category: text(row.category, 120, true), quantity: decimal(row.quantity), unit: text(row.unit, 24), volumeM3: decimal(row.volumeM3, true), weightKg: decimal(row.weightKg, true), condition: enumeration(row.condition, CONDITIONS), evidence: row.evidence === null ? null : Object.freeze([...row.evidence]), notes: text(row.notes, 2000, true) }); });
  const receivedAt = instant(value.receivedAt); const billingStartAt = value.billingStartAt ? instant(value.billingStartAt) : null;
  return command(value, "CUSTOMER_CUSTODY_RECEIVE", { clientRef: uuid(value.clientRef), caseRef: uuid(value.caseRef, true), warehouseRef: uuid(value.warehouseRef), destinationLocationRef: uuid(value.destinationLocationRef), receivedAt, billingStartAt, notes: text(value.notes, 2000, true), items: Object.freeze(items) });
}

export function normalizeCustodyMovement(input) {
  const value = object(input); exact(value, ["requestId", "payloadHash", "storageRef", "itemRef", "movementType", "destinationLocationRef", "quantity", "occurredAt", "notes", "expectedVersion"]);
  const movementType = enumeration(value.movementType, MOVEMENTS); const destinationLocationRef = uuid(value.destinationLocationRef, true);
  if (["PUT_AWAY", "TRANSFER", "RETURN"].includes(movementType) !== Boolean(destinationLocationRef)) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
  return command(value, "CUSTOMER_CUSTODY_MOVE", { storageRef: uuid(value.storageRef), itemRef: uuid(value.itemRef, true), movementType, destinationLocationRef, quantity: decimal(value.quantity, true), occurredAt: instant(value.occurredAt), notes: text(value.notes, 1000, true), expectedVersion: integer(value.expectedVersion) });
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
