import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { normalizeWarehouseManagerQuery, normalizeWarehouseSheetSave, WAREHOUSE_SHEET_MAX_BYTES } from "../api/_lib/warehouseSheetContract.js";

const ref = () => crypto.randomUUID();
function command(patch = {}) {
  const body = { warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0, name: "Almacén principal", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [], ...patch };
  const requestId = ref(); return { requestId, payloadHash: canonicalPayloadHash({ operation: "WAREHOUSE_SHEET_SAVE", requestId, ...body }), ...body };
}
function row(patch = {}) { return { action: "CREATE", rowId: ref(), parentRowId: null, parentLocationRef: null, kind: "ZONE", name: "Zona", areaUseRef: null, ...patch }; }
function update(patch = {}) { return { action: "UPDATE", rowId: ref(), locationRef: ref(), expectedVersion: 1, expectedConfigurationVersion: 0, name: "Nueva descripción", areaUseRef: null, ...patch }; }
const invalid = (body) => assert.throws(() => normalizeWarehouseSheetSave(body), /WAREHOUSE_SHEET_INPUT_INVALID/);

test("one root-only command uses automatic identities and immutable normalized rows", () => {
  const value = normalizeWarehouseSheetSave(command()); assert.equal(value.operation, "WAREHOUSE_SHEET_SAVE"); assert.equal(value.warehouseRef, null); assert.deepEqual(value.rows, []);
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.rows)); assert.equal(WAREHOUSE_SHEET_MAX_BYTES, 256 * 1024);
});
test("explicit tree allows parent rows in any input order and no zero placeholders", () => {
  const rack = row({ kind: "RACK" }); const level = row({ kind: "LEVEL", parentRowId: rack.rowId });
  const value = normalizeWarehouseSheetSave(command({ rows: [level, rack] })); assert.equal(value.rows.length, 2); assert.ok(Object.isFrozen(value.rows[0]));
});
test("sparse edits retain each resource's independent expected version", () => {
  const value = normalizeWarehouseSheetSave(command({ warehouseRef: ref(), expectedWarehouseVersion: 8, expectedProfileVersion: 3, expectedRootConfigurationVersion: 4, rows: [update({ expectedVersion: 9, expectedConfigurationVersion: 7 })] }));
  assert.equal(value.rows[0].expectedVersion, 9); assert.equal(value.rows[0].expectedConfigurationVersion, 7);
});
test("client tenant, code, labels, hierarchy moves and control fields are rejected", () => {
  for (const extra of [{ tenantId: "forged" }, { code: "MANUAL" }, { warehouseNumber: 3 }, { operationalStatus: "ACTIVE" }, { delete: true }]) invalid(command(extra));
  for (const extra of [{ code: "MANUAL" }, { label: "ALM-01" }, { expectedVersion: 1 }, { status: "ACTIVE" }]) invalid(command({ rows: [row(extra)] }));
  for (const extra of [{ parentLocationRef: ref() }, { kind: "RACK" }, { code: "RECODE" }]) invalid(command({ warehouseRef: ref(), expectedWarehouseVersion: 1, rows: [update(extra)] }));
});
test("array bounds and unknown or contradictory row structures fail", () => {
  assert.equal(normalizeWarehouseSheetSave(command({ rows: Array.from({ length: 200 }, () => row()) })).rows.length, 200);
  invalid(command({ rows: Array.from({ length: 201 }, () => row()) }));
  for (const kind of ["WAREHOUSE_ROOT", "OTHER", "RECEIVING", "DISPATCH", "QUARANTINE"]) invalid(command({ rows: [row({ kind })] }));
  invalid(command({ rows: [row({ parentLocationRef: ref(), parentRowId: ref() })] }));
});
test("cycles, unknown parent rows and duplicate row identities fail before mutation", () => {
  const a = row(); const b = row({ parentRowId: a.rowId }); a.parentRowId = b.rowId;
  for (const rows of [[a, b], [row({ parentRowId: ref() })], [b, b]]) invalid(command({ rows }));
  const existing = update(); invalid(command({ warehouseRef: ref(), expectedWarehouseVersion: 1, rows: [existing, update({ locationRef: existing.locationRef })] }));
});
test("create never references existing locations or positive versions", () => {
  for (const field of ["expectedWarehouseVersion", "expectedProfileVersion", "expectedRootConfigurationVersion"]) invalid(command({ [field]: 1 }));
  invalid(command({ rows: [update()] })); invalid(command({ rows: [row({ parentLocationRef: ref() })] }));
});
test("all references, bounded integers and names are strict", () => {
  for (const field of ["warehouseRef", "managerMembershipRef", "rootAreaUseRef"]) invalid(command({ [field]: "foreign-internal-id" }));
  for (const expectedProfileVersion of [-1, 1.5, "1", 1_000_001]) invalid(command({ expectedProfileVersion }));
  for (const name of ["", " padded", "line\nbreak", "x".repeat(161)]) invalid(command({ name }));
});
test("hash binds action, all rows, scope and expected versions", () => {
  const value = command({ rows: [row()] });
  for (const changed of [{ ...value, name: "Otro" }, { ...value, rows: [] }, { ...value, payloadHash: "0".repeat(64) }]) assert.throws(() => normalizeWarehouseSheetSave(changed), /WAREHOUSE_SHEET_PAYLOAD_HASH_MISMATCH/);
});
test("manager lookup query is bounded and rejects tenant or arbitrary filters", () => {
  assert.deepEqual(normalizeWarehouseManagerQuery(), { q: null, page: 1, pageSize: 25 });
  assert.deepEqual(normalizeWarehouseManagerQuery({ q: "Ana", page: "2", pageSize: "50" }), { q: "Ana", page: 2, pageSize: 50 });
  for (const value of [{ q: "" }, { q: " padded" }, { q: "a".repeat(121) }, { page: "0" }, { pageSize: "51" }, { tenantId: "foreign" }, { role: "A" }, { q: ["x"] }]) assert.throws(() => normalizeWarehouseManagerQuery(value), /WAREHOUSE_SHEET_INPUT_INVALID/);
});
