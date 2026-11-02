import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { createWarehouseAreaUse, updateWarehouseLocationConfiguration } from "../api/_lib/warehouseConfigurationDomain.js";
import { listWarehouseSheets, saveWarehouseSheet } from "../api/_lib/warehouseSheetDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

const pg17 = process.env.V17_WAREHOUSE_CONFIGURATION_LOCAL_COMPAT === "PG17";
const target = pg17 ? null : validateV17ServicesTestUrl(process.env.DATABASE_URL);
if (!pg17) assert.equal(target.canonicalCi, true, "WAREHOUSE_ROUTES_DB_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = pg17 ? (await createWarehouseConfigurationPg17LocalPrisma(process.env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL)).prisma : new PrismaClient({ datasourceUrl: target.raw });
const suffix = crypto.randomUUID().slice(0, 8);
const permissions = ["inventory:stock:view", "inventory:catalog:manage"];
const actor = (tag) => ({ tenantId: `tenant-routes-${suffix}-${tag}`, membershipId: `membership-routes-${suffix}-${tag}`, userId: `user-routes-${suffix}-${tag}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] });
const ctx = actor("a"), foreign = actor("b"), enabled = { routesEnabled: true };
function command(operation, body, scope = {}, requestId = crypto.randomUUID()) { return { requestId, payloadHash: canonicalPayloadHash({ operation, requestId, ...scope, ...body }), ...body }; }
const sheetCommand = (body, requestId) => command("WAREHOUSE_SHEET_SAVE", body, {}, requestId);
function createBody(patch = {}) { return { warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0, name: "Almacén de recorridos", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [], ...patch }; }
function editBody(value, patch = {}) { return createBody({ warehouseRef: value.warehouseRef, expectedWarehouseVersion: value.version, expectedProfileVersion: value.profileVersion, name: value.name, managerMembershipRef: value.manager?.membershipRef ?? null, rootAreaUseRef: value.rootAreaUseRef, expectedRootConfigurationVersion: value.rootConfigurationVersion, ...patch }); }
function newRow(patch = {}) { return { action: "CREATE", rowId: crypto.randomUUID(), parentRowId: null, parentLocationRef: null, kind: "ZONE", name: "Zona TRD", areaUseRef: null, ...patch }; }
function changedRow(location, patch = {}) { return { action: "UPDATE", rowId: crypto.randomUUID(), locationRef: location.locationRef, expectedVersion: location.version, expectedConfigurationVersion: location.configurationVersion, name: location.name, areaUseRef: location.areaUseRef, ...patch }; }
async function save(body, context = ctx, database = prisma) { return saveWarehouseSheet(database, context, sheetCommand(body), enabled); }
async function sheet(warehouseRef, context = ctx, options = enabled) { return (await listWarehouseSheets(prisma, context, options)).warehouses.find((row) => row.warehouseRef === warehouseRef); }
async function createWarehouse(context = ctx) { return (await saveWarehouseSheet(prisma, context, sheetCommand(createBody()))).warehouse; }
async function noReceipt(input, context = ctx) { assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: context.tenantId, requestId: input.requestId } }), 0); assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: context.tenantId, request_id: input.requestId } }), 0); }
async function epoch(context = ctx) { return (await prisma.warehouseLocationPolicyEpoch.findUnique({ where: { tenantId: context.tenantId } }))?.revision ?? 0n; }
const label = (warehouse, segments) => `${warehouse.warehouseLabel}-${segments}`;
let use, otherUse, foreignUse, reference, foreignWarehouse;
async function storedLocations(warehouse) {
  const record = await prisma.materialWarehouse.findFirst({ where: { tenantId: ctx.tenantId, warehouseRef: warehouse.warehouseRef } });
  return prisma.materialLocation.findMany({ where: { tenantId: ctx.tenantId, warehouseId: record.id }, include: { address: true, configuration: true }, orderBy: { id: "asc" } });
}
before(async () => {
  if (!pg17) await verifyV17ServicesLocalDatabase(prisma, target);
  const [column] = await prisma.$queryRawUnsafe("SELECT COUNT(*)::integer AS count FROM information_schema.columns WHERE table_schema='osi' AND table_name='warehouse_location_addresses' AND column_name='zone_code'");
  assert.equal(column.count, 1, "Migration40 is required");
  for (const context of [ctx, foreign]) {
    await prisma.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Synthetic routes fixture" } });
    await prisma.user.create({ data: { id: context.userId, code: context.userId, name: "Synthetic routes actor", email: `${context.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-02", passwordHash: "synthetic-not-authenticatable" } });
    await prisma.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", grantedPermissions: permissions } });
  }
  for (const [name, context, assign] of [["Uso de zona", ctx, (value) => { use = value; }], ["Uso alternativo", ctx, (value) => { otherUse = value; }], ["Uso ajeno", foreign, (value) => { foreignUse = value; }]]) {
    assign(await createWarehouseAreaUse(prisma, context, command("WAREHOUSE_AREA_USE_CREATE", { name, description: null, purpose: "INTERNAL" })));
  }
  foreignWarehouse = await createWarehouse(foreign);
});
after(async () => { await prisma.$disconnect(); });

test("explicit TRD/AA route preserves the existing warehouse and creates only enabled levels", async () => {
  const previous = await createWarehouse();
  const zone = newRow({ identifier: "TRD", areaUseRef: use.useRef });
  const rack = newRow({ kind: "RACK", identifier: "AA", name: "Estantería AA", parentRowId: zone.rowId, areaUseRef: otherUse.useRef });
  const result = await save(editBody(previous, { rows: [rack, zone] })); reference = result.warehouse;
  assert.equal(reference.warehouseNumber, 1); assert.equal(reference.code, previous.code); assert.equal(reference.locations.length, 3);
  assert.deepEqual(reference.locations.map((row) => row.kind).sort(), ["RACK", "WAREHOUSE_ROOT", "ZONE"]);
  const created = reference.locations.find((row) => row.kind === "RACK");
  assert.equal(created.address.label, "ALM-01-TRD-00-AA-0-0"); assert.equal(created.areaUseRef, otherUse.useRef);
  assert.equal(created.address.zoneCode, "TRD"); assert.equal(created.address.zoneNumber, 0);
  const root = reference.locations.find((row) => row.kind === "WAREHOUSE_ROOT");
  for (const field of ["locationRef", "code", "path", "parentLocationRef", "version"]) assert.equal(root[field], previous.locations[0][field]);
  assert.equal(new Set(result.rowResults.map((row) => row.locationRef)).size, 2);
});

test("reuse keeps names, uses, identity, address and20B controls unchanged", async () => {
  const rack = reference.locations.find((row) => row.kind === "RACK");
  await updateWarehouseLocationConfiguration(prisma, ctx, rack.locationRef, command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { expectedVersion: rack.configurationVersion, areaUseRef: rack.areaUseRef, characteristics: "Referencia de tamaño existente", notes: "Conservar", operationalStatus: "RESTRICTED", availabilityRule: "BLOCKED", changeReason: "Revisión sintética", acknowledgeImpact: true }, { locationRef: rack.locationRef }));
  const previous = await sheet(reference.warehouseRef), stored = await storedLocations(previous);
  const zone = newRow({ identifier: "TRD", areaUseRef: use.useRef });
  const existingRack = newRow({ kind: "RACK", identifier: "AA", name: "Estantería AA", parentRowId: zone.rowId, areaUseRef: otherUse.useRef });
  const result = await save(editBody(previous, { rows: [existingRack, zone] })); reference = result.warehouse;
  assert.deepEqual(await storedLocations(previous), stored);
  assert.equal(result.rowResults.find((row) => row.rowId === existingRack.rowId).locationRef, rack.locationRef);
  assert.equal(reference.locations.length, 3);
});

test("different name or use on reuse rejects the whole command without overwriting the existing space", async () => {
  const previous = await sheet(reference.warehouseRef), stored = await storedLocations(previous), initialEpoch = await epoch();
  for (const patch of [{ name: "Otro nombre", areaUseRef: use.useRef }, { areaUseRef: otherUse.useRef }, { areaUseRef: null }]) {
    const input = sheetCommand(editBody(previous, { name: "Debe revertirse", rows: [newRow({ identifier: "TRD", ...patch })] }));
    await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input, enabled), /WAREHOUSE_ROUTES_REUSE_CONFLICT/); await noReceipt(input);
    assert.deepEqual(await sheet(previous.warehouseRef), previous); assert.deepEqual(await storedLocations(previous), stored);
  }
  assert.equal(await epoch(), initialEpoch);
});

test("duplicate CREATE aliases and UPDATE plus explicit reuse cannot emit ambiguous row mappings", async () => {
  const previous = await sheet(reference.warehouseRef), zone = previous.locations.find((row) => row.kind === "ZONE");
  const explicit = () => newRow({ identifier: "TRD", areaUseRef: use.useRef });
  for (const rows of [[explicit(), explicit()], [changedRow(zone), explicit()]]) {
    const input = sheetCommand(editBody(previous, { rows }));
    await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input, enabled), /WAREHOUSE_ROUTES_DUPLICATE_TARGET/); await noReceipt(input);
    assert.deepEqual(await sheet(previous.warehouseRef), previous);
  }
});

test("explicit identifiers reserve capacity before automatic siblings regardless of input order", async () => {
  const autoZone = newRow({ name: "Zona automática" }); const numericZone = newRow({ identifier: "001", name: "Zona 001" });
  const zone = newRow({ identifier: "TRD" }); const autoRack = newRow({ kind: "RACK", name: "Rack automático", parentRowId: zone.rowId });
  const rack = newRow({ kind: "RACK", identifier: "AA", name: "Rack AA", parentRowId: zone.rowId });
  const autoLevel = newRow({ kind: "LEVEL", name: "Nivel automático", parentRowId: rack.rowId }); const level = newRow({ kind: "LEVEL", identifier: "1", name: "Nivel 1", parentRowId: rack.rowId });
  const autoBin = newRow({ kind: "BIN", name: "Posición automática", parentRowId: level.rowId }); const bin = newRow({ kind: "BIN", identifier: "1", name: "Posición 1", parentRowId: level.rowId });
  const result = await save(createBody({ rows: [autoZone, autoRack, autoLevel, autoBin, bin, numericZone, zone, rack, level] }));
  const addressOf = (row) => result.warehouse.locations.find((location) => location.locationRef === result.rowResults.find((entry) => entry.rowId === row.rowId).locationRef).address;
  assert.equal(addressOf(autoZone).zoneNumber, 2); assert.equal(addressOf(numericZone).zoneNumber, 1);
  assert.equal(addressOf(autoRack).rackCode, "AB"); assert.equal(addressOf(rack).rackCode, "AA");
  assert.equal(addressOf(autoLevel).levelNumber, 2); assert.equal(addressOf(level).levelNumber, 1);
  assert.equal(addressOf(autoBin).positionNumber, 2); assert.equal(addressOf(bin).positionNumber, 1);
  assert.equal(addressOf(zone).zoneCode, "TRD");
});

test("automatic allocation sees reservations through later reused parent aliases and ignores alphabetic zone zero", async () => {
  const previous = await sheet(reference.warehouseRef), zone = previous.locations.find((row) => row.kind === "ZONE");
  const autoRack = newRow({ kind: "RACK", name: "Rack automático", parentLocationRef: zone.locationRef });
  const parentAlias = newRow({ identifier: "TRD", areaUseRef: use.useRef });
  const reserved = newRow({ kind: "RACK", identifier: "AB", name: "Estantería AB", parentRowId: parentAlias.rowId });
  const numericZone = newRow({ name: "Zona numérica" });
  const result = await save(editBody(previous, { rows: [autoRack, reserved, numericZone, parentAlias] })); reference = result.warehouse;
  const automatic = reference.locations.find((row) => row.locationRef === result.rowResults.find((row) => row.rowId === autoRack.rowId).locationRef);
  assert.equal(automatic.address.rackCode, "AC");
  assert.equal(reference.locations.find((row) => row.name === "Zona numérica").address.label, label(reference, "001-00-00-0-0"));
});

test("concurrent identical requests and lost transport responses replay the exact committed route once", async () => {
  const row = newRow({ identifier: "A01" }); const input = sheetCommand(createBody({ rows: [row] })); const initialEpoch = await epoch();
  const values = await Promise.all(Array.from({ length: 5 }, () => saveWarehouseSheet(prisma, ctx, input, enabled)));
  for (const value of values) assert.deepEqual(value, values[0]);
  assert.equal(await epoch(), initialEpoch + 1n);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 1);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: input.requestId } }), 1);
  const lostInput = sheetCommand(createBody({ rows: [newRow({ identifier: "B02" })] })); let committed;
  const lostResponse = { $transaction: async (execute, options) => { committed = await prisma.$transaction(execute, options); throw Object.assign(new Error("synthetic response lost"), { code: "ECONNRESET" }); } };
  await assert.rejects(() => saveWarehouseSheet(lostResponse, ctx, lostInput, enabled), /synthetic response lost/);
  assert.deepEqual(await saveWarehouseSheet(prisma, ctx, lostInput, enabled), committed);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: lostInput.requestId } }), 1);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: lostInput.requestId } }), 1);
  const { requestId, payloadHash: _hash, ...body } = lostInput;
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, sheetCommand({ ...body, rows: [newRow({ identifier: "C03" })] }, requestId), enabled), /IDEMPOTENCY_CONFLICT/);
});

test("competing new commands keep optimistic versions and reuse the winner after a fresh read", async () => {
  const previous = await createWarehouse();
  const inputs = [1, 2].map(() => sheetCommand(editBody(previous, { rows: [newRow({ identifier: "R01" })] })));
  const values = await Promise.allSettled(inputs.map((input) => saveWarehouseSheet(prisma, ctx, input, enabled)));
  assert.equal(values.filter((value) => value.status === "fulfilled").length, 1);
  assert.equal(values.find((value) => value.status === "rejected").reason.code, "WAREHOUSE_SHEET_VERSION_CONFLICT");
  const fresh = await sheet(previous.warehouseRef); assert.equal(fresh.locations.length, 2);
  const reused = await save(editBody(fresh, { rows: [newRow({ identifier: "R01" })] }));
  assert.equal(reused.warehouse.locations.length, 2);
  assert.equal(reused.rowResults[0].locationRef, fresh.locations.find((row) => row.kind === "ZONE").locationRef);
});

test("route identifiers cannot cross tenant or warehouse boundaries; failing batches retain no partial rows", async () => {
  const previous = await sheet(reference.warehouseRef), initialEpoch = await epoch();
  for (const patch of [
    { warehouseRef: foreignWarehouse.warehouseRef },
    { rows: [newRow({ identifier: "X01", parentLocationRef: foreignWarehouse.rootLocationRef })] },
    { rows: [newRow({ identifier: "X01", areaUseRef: foreignUse.useRef })] },
  ]) {
    const input = sheetCommand(editBody(previous, { name: "Revertir", ...patch }));
    await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input, enabled), /WAREHOUSE_SHEET_(?:(?:LOCATION|USE)_)?NOT_FOUND/); await noReceipt(input);
    assert.deepEqual(await sheet(previous.warehouseRef), previous);
  }
  assert.equal(await epoch(), initialEpoch);
  const sameToken = await save(editBody(foreignWarehouse, { rows: [newRow({ identifier: "TRD" })] }), foreign);
  assert.equal(sameToken.warehouse.locations.find((row) => row.kind === "ZONE").address.label, "ALM-01-TRD-00-00-0-0");
  assert.ok(!(await listWarehouseSheets(prisma, ctx, enabled)).warehouses.some((row) => row.warehouseRef === foreignWarehouse.warehouseRef));
});

test("routes OFF keeps numeric20C operations available and hides only alphanumeric presentation addresses", async () => {
  const previous = await sheet(reference.warehouseRef), off = await sheet(reference.warehouseRef, ctx, { routesEnabled: false });
  const alpha = previous.locations.filter((row) => row.address?.zoneCode);
  for (const old of alpha) {
    const current = off.locations.find((row) => row.locationRef === old.locationRef);
    assert.equal(current.address, null);
    for (const field of ["code", "path", "name", "kind", "parentLocationRef"]) assert.equal(current[field], old[field]);
  }
  assert.ok(off.locations.some((row) => row.address?.zoneNumber === 1));
  assert.ok(off.locations.every((row) => !row.address || !Object.hasOwn(row.address, "zoneCode")));
  const zone = alpha.find((row) => row.kind === "ZONE");
  for (const rows of [[changedRow(zone, { name: "No guardar" })], [newRow({ kind: "RACK", parentLocationRef: zone.locationRef })]]) {
    const input = sheetCommand(editBody(off, { name: "No guardar", rows }));
    await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input), /WAREHOUSE_ROUTES_DISABLED/); await noReceipt(input);
    assert.deepEqual(await sheet(previous.warehouseRef), previous);
  }
  const numeric = off.locations.find((row) => row.kind === "ZONE" && row.address?.zoneNumber === 1);
  const input = sheetCommand(editBody(off, { rows: [newRow({ kind: "RACK", parentLocationRef: numeric.locationRef })] }));
  const saved = await saveWarehouseSheet(prisma, ctx, input);
  assert.equal(saved.warehouse.locations.find((row) => row.parentLocationRef === numeric.locationRef).address.label, label(off, "001-00-AA-0-0"));
  assert.deepEqual(await saveWarehouseSheet(prisma, ctx, input), saved);
});

test("SQL validates zone pairs, inheritance, root omission and address immutability", async () => {
  const previous = await sheet(reference.warehouseRef), records = await storedLocations(previous);
  const root = records.find((row) => row.kind === "WAREHOUSE_ROOT"), zone = records.find((row) => row.kind === "ZONE" && row.address.zoneCode === "TRD");
  const bare = async (parent, kind) => {
    const code = `SQL-${crypto.randomUUID()}`;
    return prisma.materialLocation.create({ data: { tenantId: ctx.tenantId, warehouseId: root.warehouseId, parentLocationId: parent.id, code, name: "Synthetic guard target", kind, depth: parent.depth + 1, path: `${parent.path}/${code}` } });
  };
  const insertAddress = (location, fields, segments) => prisma.warehouseLocationAddress.create({ data: { tenantId: ctx.tenantId, warehouseId: root.warehouseId, locationId: location.id, label: label(previous, segments), ...fields } });
  for (const [zoneCode, zoneNumber] of [["001", 0], ["trd", 0], ["A-1", 0], ["D01", 1]]) {
    const location = await bare(root, "ZONE");
    await assert.rejects(() => insertAddress(location, { zoneCode, zoneNumber }, `${zoneCode}-00-00-0-0`), /warehouse_location_addresses_zone_code_check/);
  }
  const rack = await bare(zone, "RACK");
  for (const [zoneCode, zoneNumber, token] of [[null, 0, "000"], ["ABC", 0, "ABC"], [null, 1, "001"]]) {
    await assert.rejects(() => insertAddress(rack, { zoneCode, zoneNumber, rackCode: "ZZ" }, `${token}-00-ZZ-0-0`), /V17_WAREHOUSE_ADDRESS_SEGMENTS_INVALID/);
  }
  const address = await insertAddress(rack, { zoneCode: "TRD", rackCode: "ZZ" }, "TRD-00-ZZ-0-0");
  assert.equal(address.zoneCode, "TRD");
  await assert.rejects(() => insertAddress(root, { zoneCode: "ABC" }, "ABC-00-00-0-0"), /V17_WAREHOUSE_ADDRESS_HIERARCHY_INVALID/);
  await assert.rejects(() => prisma.warehouseLocationAddress.update({ where: { id: address.id }, data: { zoneCode: "ABC" } }), /V17_WAREHOUSE_ADDRESS_IMMUTABLE/);
  await assert.rejects(() => prisma.warehouseLocationAddress.delete({ where: { id: address.id } }), /V17_WAREHOUSE_ADDRESS_IMMUTABLE/);
});
