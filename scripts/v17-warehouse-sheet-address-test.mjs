import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WAREHOUSE_ADDRESS_LIMITS, allocateWarehouseAddressOrdinal, canPlaceWarehouseAddressKind,
  formatWarehouseAddress, normalizeWarehouseAddressIdentifier, warehouseAddressIdentifier, warehouseAddressOrdinal, warehouseAddressSegments, warehouseAddressSegmentsFromIdentifier, warehouseAddressToken,
} from "../shared/warehouseSheetAddress.js";

const root = warehouseAddressSegments(null, "WAREHOUSE_ROOT", 3);
const rejects = (operation, code = "ADDRESS_INPUT_INVALID") => assert.throws(operation, { name: "WarehouseAddressError", code });

test("reference label preserves the skipped zone and every fixed-width segment", () => {
  const aisle = warehouseAddressSegments(root, "AISLE", 1);
  const rack = warehouseAddressSegments(aisle, "RACK", 26);
  const level = warehouseAddressSegments(rack, "LEVEL", 9);
  const position = warehouseAddressSegments(level, "BIN", 4);
  assert.equal(formatWarehouseAddress(root), "ALM-03-000-00-00-0-0");
  assert.equal(formatWarehouseAddress(position), "ALM-03-000-01-AZ-9-4");
  assert.equal(formatWarehouseAddress(rack), "ALM-03-000-01-AZ-0-0");
  assert.equal(root.zoneNumber, 0);
  assert.equal(root.rackCode, null);
  assert.ok(Object.isFrozen(position));
});

test("zones use automatic numeric segments and first rack is AA, followed by AB", () => {
  assert.equal(formatWarehouseAddress(warehouseAddressSegments(root, "ZONE", 1)), "ALM-03-001-00-00-0-0");
  assert.equal(warehouseAddressToken("RACK", 1), "AA");
  assert.equal(warehouseAddressToken("RACK", 2), "AB");
  assert.equal(warehouseAddressToken("RACK", 27), "BA");
  assert.equal(warehouseAddressToken("RACK", 676), "ZZ");
  assert.equal(warehouseAddressOrdinal("RACK", "AZ"), 26);
  assert.equal(warehouseAddressOrdinal("RACK", "ZZ"), 676);
  assert.equal(warehouseAddressOrdinal("ZONE", "001"), 1);
  rejects(() => warehouseAddressOrdinal("ZONE", "1"));
  rejects(() => warehouseAddressOrdinal("RACK", "aa"));
  rejects(() => warehouseAddressOrdinal("RACK", "00"));
});

test("a rack may follow the warehouse directly and a position may omit a level", () => {
  const rack = warehouseAddressSegments(root, "RACK", 1);
  assert.equal(formatWarehouseAddress(warehouseAddressSegments(rack, "BIN", 2)), "ALM-03-000-00-AA-0-2");
  assert.equal(formatWarehouseAddress(warehouseAddressSegments(root, "BIN", 1)), "ALM-03-000-00-00-0-1");
  assert.ok(canPlaceWarehouseAddressKind("LEVEL", ["WAREHOUSE_ROOT", "RACK"]));
  assert.ok(canPlaceWarehouseAddressKind("BIN", ["WAREHOUSE_ROOT", "ZONE", "AISLE", "RACK", "LEVEL"]));
});

test("levels require a rack and branches cannot move backwards or nest below a position", () => {
  for (const ancestors of [["WAREHOUSE_ROOT"], ["WAREHOUSE_ROOT", "ZONE"], ["WAREHOUSE_ROOT", "AISLE"]]) {
    assert.equal(canPlaceWarehouseAddressKind("LEVEL", ancestors), false);
  }
  for (const [kind, ancestors] of [
    ["AISLE", ["WAREHOUSE_ROOT", "RACK"]], ["ZONE", ["WAREHOUSE_ROOT", "ZONE"]],
    ["BIN", ["WAREHOUSE_ROOT", "BIN"]], ["RACK", ["WAREHOUSE_ROOT", "OTHER"]],
    ["BIN", ["WAREHOUSE_ROOT", "LEVEL"]], ["ZONE", []], ["ZONE", ["ZONE"]],
    ["RACK", ["WAREHOUSE_ROOT", "WAREHOUSE_ROOT"]],
  ]) assert.equal(canPlaceWarehouseAddressKind(kind, ancestors), false);
  rejects(() => warehouseAddressSegments(root, "LEVEL", 1), "HIERARCHY_INVALID");
  const bin = warehouseAddressSegments(root, "BIN", 1);
  rejects(() => warehouseAddressSegments(bin, "RACK", 1), "HIERARCHY_INVALID");
  rejects(() => warehouseAddressSegments(root, "WAREHOUSE_ROOT", 1), "HIERARCHY_INVALID");
});

test("allocation uses only a free positive ordinal and never exceeds each reviewed range", () => {
  for (const [kind, maximum] of Object.entries(WAREHOUSE_ADDRESS_LIMITS)) {
    assert.equal(allocateWarehouseAddressOrdinal(kind, []), 1);
    assert.equal(allocateWarehouseAddressOrdinal(kind, new Set([1, 3])), 2);
    const occupied = Array.from({ length: maximum - 1 }, (_, index) => index + 1);
    assert.equal(allocateWarehouseAddressOrdinal(kind, occupied), maximum);
    rejects(() => allocateWarehouseAddressOrdinal(kind, [...occupied, maximum]), "ADDRESS_CAPACITY_EXCEEDED");
    rejects(() => warehouseAddressToken(kind, 0));
    rejects(() => warehouseAddressToken(kind, maximum + 1));
  }
});

test("invalid persisted segments and corrupted allocation inputs fail explicitly", () => {
  for (const value of [null, {}, [], { ...root, warehouseNumber: 0 }, { ...root, zoneNumber: 1000 },
    { ...root, aisleNumber: "01" }, { ...root, rackCode: "00" }, { ...root, rackCode: "A" },
    { ...root, levelNumber: 1.5 }, { ...root, positionNumber: 5 }, { ...root, warehouseNumber: Infinity }]) {
    rejects(() => formatWarehouseAddress(value));
  }
  rejects(() => formatWarehouseAddress({ ...root, levelNumber: 1 }), "HIERARCHY_INVALID");
  for (const used of [null, {}, [0], [-1], [1.1], ["1"], [100]]) rejects(() => allocateWarehouseAddressOrdinal("AISLE", used));
  rejects(() => allocateWarehouseAddressOrdinal("OTHER", []));
  rejects(() => warehouseAddressSegments(root, "ZONE", NaN));
});

test("reference TRD route skips the aisle without allocating a zero-placeholder node", () => {
  const warehouse = warehouseAddressSegments(null, "WAREHOUSE_ROOT", 1);
  const zone = warehouseAddressSegmentsFromIdentifier(warehouse, "ZONE", "TRD");
  const rack = warehouseAddressSegmentsFromIdentifier(zone, "RACK", "AA");
  assert.equal(formatWarehouseAddress(rack), "ALM-01-TRD-00-AA-0-0");
  assert.equal(rack.zoneNumber, 0); assert.equal(rack.zoneCode, "TRD");
  assert.equal(warehouseAddressIdentifier("ZONE", rack), "TRD");
  assert.equal(warehouseAddressIdentifier("AISLE", rack), "00");
  assert.equal(warehouseAddressIdentifier("LEVEL", rack), "0");
  assert.equal(warehouseAddressIdentifier("BIN", rack), "0");
  assert.equal(formatWarehouseAddress(warehouseAddressSegments(rack, "BIN", 4)), "ALM-01-TRD-00-AA-0-4");
  rejects(() => warehouseAddressSegments(zone, "ZONE", 1), "HIERARCHY_INVALID");
  rejects(() => warehouseAddressSegmentsFromIdentifier(zone, "LEVEL", "1"), "HIERARCHY_INVALID");
});

test("individual identifiers normalize input while strict construction keeps widths and ranges", () => {
  for (const [kind, raw, expected] of [["ZONE", " trd ", "TRD"], ["ZONE", "a01", "A01"], ["ZONE", "1", "001"], ["AISLE", "2", "02"], ["RACK", "az", "AZ"], ["LEVEL", "9", "9"], ["BIN", "4", "4"]]) {
    assert.equal(normalizeWarehouseAddressIdentifier(kind, raw), expected);
    if (raw !== expected) rejects(() => warehouseAddressSegmentsFromIdentifier(root, kind, raw));
  }
  for (const [kind, zero] of [["ZONE", "000"], ["AISLE", "00"], ["RACK", "00"], ["LEVEL", "0"], ["BIN", "0"]]) {
    assert.equal(normalizeWarehouseAddressIdentifier(kind, "", { allowDisabled: true }), zero);
    assert.equal(normalizeWarehouseAddressIdentifier(kind, zero, { allowDisabled: true }), zero);
    rejects(() => normalizeWarehouseAddressIdentifier(kind, zero));
    rejects(() => warehouseAddressSegmentsFromIdentifier(root, kind, zero));
  }
  for (const [kind, token] of [["ZONE", "A"], ["ZONE", "ABCD"], ["ZONE", "Á01"], ["ZONE", "A-1"], ["ZONE", "0001"], ["AISLE", "A1"], ["AISLE", "100"], ["RACK", "A1"], ["RACK", "AAA"], ["LEVEL", "10"], ["BIN", "5"]]) rejects(() => normalizeWarehouseAddressIdentifier(kind, token));
});

test("numeric legacy addresses keep their shape; malformed paired zones cannot be formatted", () => {
  const numeric = warehouseAddressSegmentsFromIdentifier(root, "ZONE", "999");
  assert.equal(formatWarehouseAddress(numeric), "ALM-03-999-00-00-0-0");
  assert.equal(Object.hasOwn(numeric, "zoneCode"), false);
  assert.equal(warehouseAddressIdentifier("ZONE", numeric), "999");
  assert.equal(formatWarehouseAddress({ ...numeric, zoneCode: null }), formatWarehouseAddress(numeric));
  for (const zoneCode of ["001", "trd", "TR", "TRDD", "A-1", 123]) rejects(() => formatWarehouseAddress({ ...root, zoneCode }));
  rejects(() => formatWarehouseAddress({ ...numeric, zoneCode: "TRD" }));
});
