import assert from "node:assert/strict";
import test from "node:test";
import { formatWarehouseAddress } from "../shared/warehouseSheetAddress.js";
import { formatWarehouseDisplayAddress, isWarehouseLocalityNumber } from "../shared/warehouseLocalityAddress.js";

const address = Object.freeze({ warehouseNumber: 4, zoneNumber: 0, aisleNumber: 0, rackCode: "AA", levelNumber: 2, positionNumber: 0 });

test("requested locality labels retain sparse segments and pad only the shelf level", () => {
  assert.equal(formatWarehouseDisplayAddress(1, address), "S1-ALM4-000-00-AA-02-0");
  assert.equal(formatWarehouseDisplayAddress(1, { ...address, warehouseNumber: 2, zoneCode: "GM1", aisleNumber: 1, rackCode: "AB", levelNumber: 3 }), "S1-ALM2-GM1-01-AB-03-0");
  assert.equal(formatWarehouseDisplayAddress(999, { ...address, warehouseNumber: 99, zoneNumber: 999, aisleNumber: 99, rackCode: "ZZ", levelNumber: 9, positionNumber: 4 }), "S999-ALM99-999-99-ZZ-09-4");
});

test("an unassigned locality has no display label and historical identity is unchanged", () => {
  const previous = structuredClone(address);
  assert.equal(formatWarehouseDisplayAddress(null, address), null);
  assert.equal(formatWarehouseAddress(address), "ALM-04-000-00-AA-2-0");
  assert.equal(formatWarehouseDisplayAddress(1, { ...address, rackCode: null, levelNumber: 0 }), "S1-ALM4-000-00-00-00-0");
  assert.deepEqual(address, previous);
});

test("locality numbers are bounded integers without coercion or a fabricated default", () => {
  for (const value of [1, 2, 999]) assert.equal(isWarehouseLocalityNumber(value), true);
  for (const value of [null, undefined, 0, -1, 1000, 1.5, NaN, Infinity, "1", "S1", {}, true]) {
    assert.equal(isWarehouseLocalityNumber(value), false);
    if (value !== null) assert.throws(() => formatWarehouseDisplayAddress(value, address), { name: "WarehouseAddressError", code: "LOCALITY_INPUT_INVALID" });
  }
});

test("display formatting enforces the existing warehouse, level, position and hierarchy ranges", () => {
  for (const patch of [{ warehouseNumber: 0 }, { warehouseNumber: 100 }, { levelNumber: 10 }, { positionNumber: 5 }, { levelNumber: "02" }, { zoneCode: "gm1" }]) {
    assert.throws(() => formatWarehouseDisplayAddress(1, { ...address, ...patch }), { name: "WarehouseAddressError", code: "ADDRESS_INPUT_INVALID" });
  }
  assert.throws(() => formatWarehouseDisplayAddress(1, { ...address, rackCode: null }), { name: "WarehouseAddressError", code: "HIERARCHY_INVALID" });
  assert.throws(() => formatWarehouseDisplayAddress(null, { ...address, positionNumber: 5 }), { name: "WarehouseAddressError", code: "ADDRESS_INPUT_INVALID" });
});
