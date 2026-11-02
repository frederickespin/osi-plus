import { canonicalPayloadHash } from "./materialsInventoryContract.js";
import { normalizeWarehouseAddressIdentifier } from "../../shared/warehouseSheetAddress.js";

export const WAREHOUSE_SHEET_OPERATION = "WAREHOUSE_SHEET_SAVE";
export const WAREHOUSE_SHEET_MAX_ROWS = 200;
export const WAREHOUSE_SHEET_MAX_BYTES = 256 * 1024;
export const WAREHOUSE_SHEET_KINDS = Object.freeze(["ZONE", "AISLE", "RACK", "LEVEL", "BIN"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class WarehouseSheetError extends Error {
  constructor(code, status = 400) { super(code); this.name = "WarehouseSheetError"; this.code = code; this.status = status; }
}
export function warehouseSheetFail(code, status = 400) { throw new WarehouseSheetError(code, status); }
const invalid = () => warehouseSheetFail("WAREHOUSE_SHEET_INPUT_INVALID");
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid();
}
function reference(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}
function version(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000) invalid();
  return value;
}
function name(value) {
  if (typeof value !== "string" || value !== value.trim() || !value.length || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  return value;
}
function row(value) {
  if (value?.action === "CREATE") {
    const hasIdentifier = Object.hasOwn(value, "identifier");
    exact(value, ["action", "rowId", "parentRowId", "parentLocationRef", "kind", "name", "areaUseRef", ...(hasIdentifier ? ["identifier"] : [])]);
    if (!WAREHOUSE_SHEET_KINDS.includes(value.kind) || value.parentRowId !== null && value.parentLocationRef !== null) invalid();
    if (hasIdentifier) {
      try { if (normalizeWarehouseAddressIdentifier(value.kind, value.identifier) !== value.identifier) invalid(); }
      catch { invalid(); }
    }
    return Object.freeze({ action: "CREATE", rowId: reference(value.rowId), parentRowId: reference(value.parentRowId, true), parentLocationRef: reference(value.parentLocationRef, true), kind: value.kind, name: name(value.name), areaUseRef: reference(value.areaUseRef, true), ...(hasIdentifier ? { identifier: value.identifier } : {}) });
  }
  if (value?.action === "UPDATE") {
    exact(value, ["action", "rowId", "locationRef", "expectedVersion", "expectedConfigurationVersion", "name", "areaUseRef"]);
    return Object.freeze({ action: "UPDATE", rowId: reference(value.rowId), locationRef: reference(value.locationRef), expectedVersion: version(value.expectedVersion, 1), expectedConfigurationVersion: version(value.expectedConfigurationVersion), name: name(value.name), areaUseRef: reference(value.areaUseRef, true) });
  }
  invalid();
}
export function normalizeWarehouseSheetSave(value) {
  exact(value, ["requestId", "payloadHash", "warehouseRef", "expectedWarehouseVersion", "expectedProfileVersion", "name", "managerMembershipRef", "rootAreaUseRef", "expectedRootConfigurationVersion", "rows"]);
  if (!Array.isArray(value.rows) || value.rows.length > WAREHOUSE_SHEET_MAX_ROWS) invalid();
  const rows = value.rows.map(row);
  const byId = new Map(rows.map((entry) => [entry.rowId, entry]));
  const updates = rows.filter((entry) => entry.action === "UPDATE");
  if (byId.size !== rows.length || new Set(updates.map((entry) => entry.locationRef)).size !== updates.length) invalid();
  for (const entry of rows) {
    if (entry.action !== "CREATE") continue;
    const seen = new Set([entry.rowId]); let parentId = entry.parentRowId;
    while (parentId !== null) {
      const parent = byId.get(parentId);
      if (!parent || parent.action !== "CREATE" || seen.has(parentId)) invalid();
      seen.add(parentId); parentId = parent.parentRowId;
    }
  }
  const warehouseRef = reference(value.warehouseRef, true);
  const expectedWarehouseVersion = version(value.expectedWarehouseVersion, warehouseRef ? 1 : 0);
  const expectedProfileVersion = version(value.expectedProfileVersion);
  const expectedRootConfigurationVersion = version(value.expectedRootConfigurationVersion);
  if (!warehouseRef && (expectedWarehouseVersion !== 0 || expectedProfileVersion !== 0 || expectedRootConfigurationVersion !== 0 || updates.length || rows.some((entry) => entry.parentLocationRef !== null))) invalid();
  const requestId = reference(value.requestId);
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["requestId", "payloadHash"].includes(key)));
  if (typeof value.payloadHash !== "string" || !/^[0-9a-f]{64}$/u.test(value.payloadHash)
    || value.payloadHash !== canonicalPayloadHash({ operation: WAREHOUSE_SHEET_OPERATION, requestId, ...body })) warehouseSheetFail("WAREHOUSE_SHEET_PAYLOAD_HASH_MISMATCH");
  return Object.freeze({ operation: WAREHOUSE_SHEET_OPERATION, requestId, payloadHash: value.payloadHash, warehouseRef, expectedWarehouseVersion, expectedProfileVersion, expectedRootConfigurationVersion, name: name(value.name), managerMembershipRef: reference(value.managerMembershipRef, true), rootAreaUseRef: reference(value.rootAreaUseRef, true), rows: Object.freeze(rows) });
}

export function normalizeWarehouseManagerQuery(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["q", "page", "pageSize"].includes(key))) invalid();
  const positive = (input, fallback, max) => {
    if (input === undefined) return fallback;
    if (typeof input !== "string" || !/^[1-9]\d*$/u.test(input) || !Number.isSafeInteger(Number(input)) || Number(input) > max) invalid();
    return Number(input);
  };
  const q = value.q === undefined ? null : value.q;
  if (q !== null && (typeof q !== "string" || !q.length || q.length > 120 || q !== q.trim() || /[\u0000-\u001f\u007f]/u.test(q))) invalid();
  return Object.freeze({ q, page: positive(value.page, 1, 100_000), pageSize: positive(value.pageSize, 25, 50) });
}
