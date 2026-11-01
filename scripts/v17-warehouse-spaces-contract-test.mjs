import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPayloadHash, normalizeWarehouseCreate, normalizeWarehouseLocationCreate, normalizeWarehouseUpdate, normalizeWarehouseLocationUpdate } from "../api/_lib/materialsInventoryContract.js";

const warehouseRef = crypto.randomUUID(); const locationRef = crypto.randomUUID();
function command(operation, payload, scope = {}, requestId = crypto.randomUUID()) {
  return { requestId, payloadHash: canonicalPayloadHash({ operation, requestId, ...scope, ...payload }), ...payload };
}

test("automatic warehouse registration carries only its name and creates no inferred tree", () => {
  const input = normalizeWarehouseCreate(command("WAREHOUSE_CREATE", { name: "Almacén físico" }));
  assert.equal(input.name, "Almacén físico"); assert.equal(input.code, null); assert.equal(input.locations, null);
});

test("explicit legacy tree remains accepted unchanged", () => {
  const input = normalizeWarehouseCreate(command("WAREHOUSE_CREATE", { code: "LEGACY", name: "Almacén existente", locations: [{ code: "ROOT", name: "Almacén existente", kind: "WAREHOUSE_ROOT", parentCode: null }, { code: "ZONA-A", name: "Zona A", kind: "ZONE", parentCode: "ROOT" }] }));
  assert.equal(input.code, "LEGACY"); assert.equal(input.locations[1].parentCode, "ROOT");
  assert.equal(input.locations[1].code, "ZONA-A");
});

test("automatic registration rejects hidden codes, generated levels, or extra authority", () => {
  for (const extra of [{ code: "MANUAL" }, { locations: [] }, { levels: 0 }, { tenantId: "tenant" }, { status: "ACTIVE" }]) {
    assert.throws(() => normalizeWarehouseCreate(command("WAREHOUSE_CREATE", { name: "Almacén", ...extra })), /MATERIALS_INPUT_INVALID/);
  }
});

test("names are required, bounded, and exact", () => {
  for (const name of ["", " ", " Almacén", "Almacén ", "a".repeat(161), 0, null]) {
    assert.throws(() => normalizeWarehouseCreate(command("WAREHOUSE_CREATE", { name })), /MATERIALS_INPUT_INVALID/);
  }
  assert.equal(normalizeWarehouseCreate(command("WAREHOUSE_CREATE", { name: "a".repeat(160) })).name.length, 160);
});

test("warehouse command hash covers the name and request ID", () => {
  const input = command("WAREHOUSE_CREATE", { name: "Almacén" });
  assert.throws(() => normalizeWarehouseCreate({ ...input, name: "Otro" }), /MATERIALS_PAYLOAD_HASH_MISMATCH/);
  assert.throws(() => normalizeWarehouseCreate({ ...input, requestId: crypto.randomUUID() }), /MATERIALS_PAYLOAD_HASH_MISMATCH/);
});

test("explicit trees still reject duplicate, missing or forward parents", () => {
  const root = { code: "ROOT", name: "Principal", kind: "WAREHOUSE_ROOT", parentCode: null };
  for (const locations of [[], [root, root], [root, { code: "CHILD", name: "Interior", kind: "ZONE", parentCode: "MISSING" }], [{ code: "CHILD", name: "Interior", kind: "ZONE", parentCode: "ROOT" }, root]]) {
    assert.throws(() => normalizeWarehouseCreate(command("WAREHOUSE_CREATE", { code: "MAIN", name: "Principal", locations })), /MATERIALS_INPUT_INVALID|MATERIALS_LOCATION_TREE_INVALID/);
  }
});

test("new child uses opaque warehouse and parent references and each supported structural kind", () => {
  for (const kind of ["ZONE", "AISLE", "RACK", "LEVEL", "BIN", "RECEIVING", "DISPATCH", "QUARANTINE", "OTHER"]) {
    const input = normalizeWarehouseLocationCreate(command("WAREHOUSE_LOCATION_CREATE", { warehouseRef, parentLocationRef: locationRef, name: "Interior", kind }));
    assert.equal(input.warehouseRef, warehouseRef); assert.equal(input.parentLocationRef, locationRef); assert.equal(input.kind, kind);
  }
});

test("child command forbids roots, arbitrary kinds, client codes and malformed refs", () => {
  const payload = { warehouseRef, parentLocationRef: locationRef, name: "Interior", kind: "ZONE" };
  for (const change of [{ kind: "WAREHOUSE_ROOT" }, { kind: "CLIENT_GOODS" }, { code: "CUSTOM" }, { parentCode: "ROOT" }, { tenantId: "other" }, { name: " " }]) {
    assert.throws(() => normalizeWarehouseLocationCreate(command("WAREHOUSE_LOCATION_CREATE", { ...payload, ...change })), /MATERIALS_INPUT_INVALID/);
  }
  for (const change of [{ warehouseRef: "MAIN" }, { parentLocationRef: null }]) {
    assert.throws(() => normalizeWarehouseLocationCreate(command("WAREHOUSE_LOCATION_CREATE", { ...payload, ...change })), /MATERIALS_RESOURCE_NOT_FOUND|MATERIALS_INPUT_INVALID/);
  }
});

test("child hash binds chosen parent and warehouse", () => {
  const input = command("WAREHOUSE_LOCATION_CREATE", { warehouseRef, parentLocationRef: locationRef, name: "Interior", kind: "ZONE" });
  assert.throws(() => normalizeWarehouseLocationCreate({ ...input, parentLocationRef: crypto.randomUUID() }), /MATERIALS_PAYLOAD_HASH_MISMATCH/);
  assert.throws(() => normalizeWarehouseLocationCreate({ ...input, warehouseRef: crypto.randomUUID() }), /MATERIALS_PAYLOAD_HASH_MISMATCH/);
});

for (const [operation, key, reference, normalize] of [["WAREHOUSE_UPDATE", "warehouseRef", warehouseRef, normalizeWarehouseUpdate], ["WAREHOUSE_LOCATION_UPDATE", "locationRef", locationRef, normalizeWarehouseLocationUpdate]]) {
  test(`${operation} permits only versioned name edits and binds the URL reference`, () => {
    const input = command(operation, { expectedVersion: 1, name: "Nombre corregido" }, { [key]: reference });
    const normalized = normalize(input, reference);
    assert.equal(normalized[key], reference); assert.equal(normalized.name, "Nombre corregido"); assert.equal(normalized.expectedVersion, 1);
    assert.throws(() => normalize(input, crypto.randomUUID()), /MATERIALS_PAYLOAD_HASH_MISMATCH/);
    for (const extra of [{ code: "RECODE" }, { status: "INACTIVE" }, { parentLocationRef: crypto.randomUUID() }, { [key]: reference }]) {
      assert.throws(() => normalize(command(operation, { expectedVersion: 1, name: "Nombre", ...extra }, { [key]: reference }), reference), /MATERIALS_INPUT_INVALID/);
    }
    for (const expectedVersion of [0, -1, 1.5, "1", null]) {
      assert.throws(() => normalize(command(operation, { expectedVersion, name: "Nombre" }, { [key]: reference }), reference), /MATERIALS_INPUT_INVALID/);
    }
  });
}
