import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { createWarehouse, recordMovement, updateWarehouse, updateWarehouseLocation } from "../api/_lib/materialsInventoryDomain.js";
import { createWarehouseAreaUse, updateWarehouseAreaUse, updateWarehouseLocationConfiguration } from "../api/_lib/warehouseConfigurationDomain.js";
import { listWarehouseManagerOptions, listWarehouseSheets, saveWarehouseSheet } from "../api/_lib/warehouseSheetDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

const pg17 = process.env.V17_WAREHOUSE_CONFIGURATION_LOCAL_COMPAT === "PG17";
const target = pg17 ? null : validateV17ServicesTestUrl(process.env.DATABASE_URL);
if (!pg17) assert.equal(target.canonicalCi, true, "WAREHOUSE_SHEET_DB_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = pg17 ? (await createWarehouseConfigurationPg17LocalPrisma(process.env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL)).prisma : new PrismaClient({ datasourceUrl: target.raw });
const suffix = crypto.randomUUID().slice(0, 8);
const permissions = ["inventory:stock:view", "inventory:catalog:manage", "inventory:stock:receive"];
const actor = (tag) => ({ tenantId: `tenant-sheet-${suffix}-${tag}`, membershipId: `membership-sheet-${suffix}-${tag}`, userId: `user-sheet-${suffix}-${tag}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] });
const ctx = actor("a"), foreign = actor("b");
function command(operation, body, scope = {}, requestId = crypto.randomUUID()) { return { requestId, payloadHash: canonicalPayloadHash({ operation, requestId, ...scope, ...body }), ...body }; }
function createBody(patch = {}) { return { warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0, name: "Almacén hoja", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [], ...patch }; }
function editBody(value, patch = {}) { return createBody({ warehouseRef: value.warehouseRef, expectedWarehouseVersion: value.version, expectedProfileVersion: value.profileVersion, name: value.name, managerMembershipRef: value.manager?.membershipRef ?? null, rootAreaUseRef: value.rootAreaUseRef, expectedRootConfigurationVersion: value.rootConfigurationVersion, ...patch }); }
function newRow(patch = {}) { return { action: "CREATE", rowId: crypto.randomUUID(), parentRowId: null, parentLocationRef: null, kind: "ZONE", name: "Zona explícita", areaUseRef: null, ...patch }; }
function changedRow(location, patch = {}) { return { action: "UPDATE", rowId: crypto.randomUUID(), locationRef: location.locationRef, expectedVersion: location.version, expectedConfigurationVersion: location.configurationVersion, name: location.name, areaUseRef: location.areaUseRef, ...patch }; }
async function sheet(warehouseRef, context = ctx) { return (await listWarehouseSheets(prisma, context)).warehouses.find((row) => row.warehouseRef === warehouseRef); }
async function save(body, context = ctx, database = prisma) { return saveWarehouseSheet(database, context, command("WAREHOUSE_SHEET_SAVE", body)); }
async function noReceipt(input) { assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 0); assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: input.requestId } }), 0); }
async function epoch() { return (await prisma.warehouseLocationPolicyEpoch.findUnique({ where: { tenantId: ctx.tenantId } }))?.revision ?? 0n; }
let legacy, foreignWarehouse, use, foreignUse, manager, trade, actorMembership, foreignMembership, complete, completeInput, initialMovements;
async function makePerson(id, role = "C") {
  const userId = `user-sheet-${suffix}-${id}`;
  await prisma.user.create({ data: { id: userId, code: userId, name: `Synthetic ${id}`, email: `${userId}@example.test`, phone: "000", role, status: "ACTIVE", joinDate: "2026-11-01", passwordHash: "synthetic-not-authenticatable" } });
  return prisma.tenantMembership.create({ data: { tenantId: ctx.tenantId, userId, role, status: "ACTIVE" } });
}
before(async () => {
  if (!pg17) await verifyV17ServicesLocalDatabase(prisma, target);
  for (const context of [ctx, foreign]) {
    await prisma.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Synthetic worksheet fixture" } });
    await prisma.user.create({ data: { id: context.userId, code: context.userId, name: "Synthetic worksheet actor", email: `${context.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-01", passwordHash: "synthetic-not-authenticatable" } });
    const member = await prisma.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", grantedPermissions: permissions } });
    if (context === ctx) actorMembership = member; else foreignMembership = member;
  }
  manager = await makePerson("manager"); trade = await makePerson("trade", "PA");
  legacy = await createWarehouse(prisma, ctx, command("WAREHOUSE_CREATE", { code: "LEGACY", name: "Almacén anterior", locations: [
    { code: "ROOT", name: "Almacén anterior", kind: "WAREHOUSE_ROOT", parentCode: null },
    { code: "ZONE", name: "Zona anterior", kind: "ZONE", parentCode: "ROOT" },
    { code: "OTHER", name: "Área histórica", kind: "OTHER", parentCode: "ROOT" },
    { code: "OLDLEVEL", name: "Nivel histórico sin rack", kind: "LEVEL", parentCode: "ROOT" },
  ] }));
  foreignWarehouse = await createWarehouse(prisma, foreign, command("WAREHOUSE_CREATE", { name: "Otra empresa" }));
  use = await createWarehouseAreaUse(prisma, ctx, command("WAREHOUSE_AREA_USE_CREATE", { name: "Uso explícito", description: null, purpose: "INTERNAL" }));
  foreignUse = await createWarehouseAreaUse(prisma, foreign, command("WAREHOUSE_AREA_USE_CREATE", { name: "Uso ajeno", description: null, purpose: "MIXED" }));
  const unit = await prisma.materialUnit.create({ data: { tenantId: ctx.tenantId, code: "UNIT", name: "Unidad sintética" } });
  const material = await prisma.materialCatalogItem.create({ data: { tenantId: ctx.tenantId, code: "ITEM", name: "Material sintético", family: "TEST", baseUnitId: unit.id, purchaseUnitId: unit.id, consumptionUnitId: unit.id } });
  await recordMovement(prisma, ctx, command("INVENTORY_MOVEMENT", { movementType: "RECEIPT", materialRef: material.materialRef, locationRef: legacy.locations.find((row) => row.code === "ZONE").locationRef, counterpartLocationRef: null, quantity: 7, lotCode: null, reasonCode: "SYNTHETIC_RECEIPT", reservationRef: null, requirementRef: null }));
  initialMovements = await prisma.materialInventoryMovement.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } });
});
after(async () => { await prisma.$disconnect(); });

test("legacy read supplies absent profile/address metadata and performs no backfill", async () => {
  const value = await sheet(legacy.warehouseRef); assert.equal(value.profileVersion, 0); assert.equal(value.warehouseNumber, null); assert.equal(value.manager, null);
  assert.ok(value.locations.every((row) => row.address === null));
  assert.equal(await prisma.warehouseSheetProfile.count({ where: { tenantId: ctx.tenantId } }), 0);
  assert.equal(await prisma.warehouseLocationAddress.count({ where: { tenantId: ctx.tenantId } }), 0);
});
test("concurrent complete-tree retry creates one warehouse, exact rows, uses, manager, audit and receipt", async () => {
  const aisle = newRow({ kind: "AISLE", name: "Pasillo" }); const rack = newRow({ kind: "RACK", parentRowId: aisle.rowId, name: "Estantería" });
  const level = newRow({ kind: "LEVEL", parentRowId: rack.rowId, name: "Nivel" }); const bin = newRow({ kind: "BIN", parentRowId: level.rowId, name: "Posición", areaUseRef: use.useRef });
  completeInput = command("WAREHOUSE_SHEET_SAVE", createBody({ managerMembershipRef: manager.publicRef, rootAreaUseRef: use.useRef, rows: [bin, level, rack, aisle] }));
  const beforeEpoch = await epoch(); const results = await Promise.all(Array.from({ length: 5 }, () => saveWarehouseSheet(prisma, ctx, completeInput)));
  for (const value of results) assert.deepEqual(value, results[0]); complete = results[0].warehouse;
  assert.equal(complete.locations.length, 5); assert.equal(complete.warehouseNumber, 1); assert.equal(complete.profileVersion, 1); assert.equal(complete.version, 1);
  assert.equal(complete.manager.membershipRef, manager.publicRef); assert.equal(complete.rootAreaUseRef, use.useRef);
  assert.equal(complete.locations.find((row) => row.kind === "BIN").address.label, "ALM-01-000-01-AA-1-1");
  assert.equal(complete.locations.find((row) => row.kind === "WAREHOUSE_ROOT").address.label, "ALM-01-000-00-00-0-0");
  assert.ok(complete.locations.every((row) => row.kind !== "ZONE")); assert.equal(await epoch(), beforeEpoch + 1n);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: completeInput.requestId } }), 1);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: completeInput.requestId } }), 1);
});
test("request/hash conflicts are rejected and different concurrent warehouses receive unique numbers", async () => {
  const { requestId, payloadHash: _hash, ...body } = completeInput;
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, command("WAREHOUSE_SHEET_SAVE", { ...body, name: "Conflicto" }, {}, requestId)), /IDEMPOTENCY_CONFLICT/);
  const values = await Promise.all(["Uno", "Dos"].map((name) => save(createBody({ name }))));
  assert.deepEqual(values.map((row) => row.warehouse.warehouseNumber).sort(), [2, 3]);
  await prisma.materialWarehouse.update({ where: { id: (await prisma.materialWarehouse.findFirst({ where: { tenantId: ctx.tenantId, warehouseRef: values[0].warehouse.warehouseRef } })).id }, data: { status: "INACTIVE", version: { increment: 1 } } });
  assert.equal((await save(createBody({ name: "No reutiliza inactivo" }))).warehouse.warehouseNumber, 4);
});
test("explicit legacy edit adopts supported addresses, preserves unsupported rows and all stock identities", async () => {
  const previous = await sheet(legacy.warehouseRef);
  const value = (await save(editBody(previous, { name: "Almacén ajustado", rootAreaUseRef: use.useRef, rows: previous.locations.filter((row) => row.parentLocationRef).map((row) => changedRow(row, { name: `${row.name} ajustada` })) }))).warehouse;
  assert.equal(value.locations.find((row) => row.code === "ZONE").address.label, "ALM-05-001-00-00-0-0");
  for (const code of ["OTHER", "OLDLEVEL"]) assert.equal(value.locations.find((row) => row.code === code).address, null);
  for (const row of previous.locations) {
    const next = value.locations.find((item) => item.locationRef === row.locationRef);
    for (const field of ["locationRef", "parentLocationRef", "code", "kind", "depth", "path", "status"]) assert.equal(next[field], row[field]);
  }
  assert.deepEqual(await prisma.materialInventoryMovement.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } }), initialMovements);
});
test("old20A rename invalidates sheet header version and no partial sheet changes survive", async () => {
  const previous = await sheet(legacy.warehouseRef);
  await updateWarehouse(prisma, ctx, previous.warehouseRef, command("WAREHOUSE_UPDATE", { expectedVersion: previous.version, name: "Cambio20A" }, { warehouseRef: previous.warehouseRef }));
  const input = command("WAREHOUSE_SHEET_SAVE", editBody(previous, { name: "Obsoleto", managerMembershipRef: trade.publicRef }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input), /WAREHOUSE_SHEET_VERSION_CONFLICT/); await noReceipt(input);
  const value = await sheet(legacy.warehouseRef); assert.equal(value.name, "Cambio20A"); assert.equal(value.profileVersion, previous.profileVersion); assert.equal(value.manager, null);
});
test("old20A location rename invalidates row version within atomic sheet", async () => {
  const previous = await sheet(legacy.warehouseRef); const zone = previous.locations.find((row) => row.code === "ZONE");
  await updateWarehouseLocation(prisma, ctx, zone.locationRef, command("WAREHOUSE_LOCATION_UPDATE", { expectedVersion: zone.version, name: "Nombre20A" }, { locationRef: zone.locationRef }));
  const input = command("WAREHOUSE_SHEET_SAVE", editBody(previous, { name: "No persiste", rows: [changedRow(zone)] }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input), /WAREHOUSE_SHEET_VERSION_CONFLICT/); await noReceipt(input);
  assert.equal((await sheet(legacy.warehouseRef)).name, previous.name);
});
test("use-only sheet save preserves20B controls, notes and reason and rejects stale config versions", async () => {
  let previous = await sheet(legacy.warehouseRef); let zone = previous.locations.find((row) => row.code === "ZONE");
  const configured = await updateWarehouseLocationConfiguration(prisma, ctx, zone.locationRef, command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { expectedVersion: zone.configurationVersion, areaUseRef: null, characteristics: "Cubierta", notes: "Conservar", operationalStatus: "RESTRICTED", availabilityRule: "BLOCKED", changeReason: "Revisión sintética", acknowledgeImpact: true }, { locationRef: zone.locationRef }));
  const stale = command("WAREHOUSE_SHEET_SAVE", editBody(previous, { rows: [changedRow(zone, { areaUseRef: use.useRef })] }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, stale), /WAREHOUSE_SHEET_VERSION_CONFLICT/); await noReceipt(stale);
  previous = await sheet(legacy.warehouseRef); zone = previous.locations.find((row) => row.code === "ZONE");
  await save(editBody(previous, { rows: [changedRow(zone, { areaUseRef: use.useRef })] }));
  const current = await prisma.warehouseLocationConfiguration.findFirst({ where: { tenantId: ctx.tenantId, configRef: configured.configRef } });
  assert.equal(current.operationalStatus, "RESTRICTED"); assert.equal(current.availabilityRule, "BLOCKED"); assert.equal(current.controlReason, "Revisión sintética"); assert.equal(current.notes, "Conservar"); assert.equal(current.characteristics, "Cubierta");
});
test("foreign references are opaque and every failed batch rolls back header, rows, addresses and epoch", async () => {
  const previous = await sheet(complete.warehouseRef); const beforeEpoch = await epoch();
  for (const patch of [
    { managerMembershipRef: foreignMembership.publicRef }, { rootAreaUseRef: foreignUse.useRef },
    { rows: [newRow({ parentLocationRef: foreignWarehouse.locations[0].locationRef })] },
    { rows: [{ ...changedRow(previous.locations.find((row) => row.kind === "BIN")), locationRef: foreignWarehouse.locations[0].locationRef }] },
  ]) {
    const input = command("WAREHOUSE_SHEET_SAVE", editBody(previous, { name: "Debe revertirse", ...patch }));
    await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input), /WAREHOUSE_SHEET_(?:MANAGER|USE|LOCATION)_NOT_FOUND/); await noReceipt(input);
    assert.deepEqual(await sheet(complete.warehouseRef), previous);
  }
  assert.equal(await epoch(), beforeEpoch);
});
test("new position overflow is atomic and skipped-level or terminal-parent errors cannot create nodes", async () => {
  const previous = await sheet(complete.warehouseRef); const level = previous.locations.find((row) => row.kind === "LEVEL");
  const input = command("WAREHOUSE_SHEET_SAVE", editBody(previous, { name: "Revertir todo", rows: Array.from({ length: 4 }, () => newRow({ kind: "BIN", parentLocationRef: level.locationRef })) }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input), /WAREHOUSE_SHEET_ADDRESS_CAPACITY_EXCEEDED/); await noReceipt(input); assert.deepEqual(await sheet(complete.warehouseRef), previous);
  for (const row of [newRow({ kind: "LEVEL" }), newRow({ kind: "RACK", parentLocationRef: previous.locations.find((entry) => entry.kind === "BIN").locationRef })]) {
    const bad = command("WAREHOUSE_SHEET_SAVE", editBody(previous, { rows: [row] })); await assert.rejects(() => saveWarehouseSheet(prisma, ctx, bad), /WAREHOUSE_SHEET_HIERARCHY_INVALID/); await noReceipt(bad);
  }
});
test("manager selector is minimal and includes active trades; retained inactive assignment is explicit", async () => {
  const options = await listWarehouseManagerOptions(prisma, ctx, { q: "Synthetic", pageSize: "50" });
  assert.ok(options.data.some((row) => row.membershipRef === trade.publicRef)); assert.ok(options.data.every((row) => Object.keys(row).sort().join() === "displayName,membershipRef"));
  await prisma.tenantMembership.update({ where: { id: manager.id }, data: { status: "INACTIVE", authorizationVersion: { increment: 1 } } });
  const previous = await sheet(complete.warehouseRef); assert.equal(previous.manager.eligible, false);
  const kept = (await save(editBody(previous, { name: "Mantiene encargado histórico" }))).warehouse; assert.equal(kept.manager.membershipRef, manager.publicRef); assert.equal(kept.manager.eligible, false);
  await assert.rejects(() => save(createBody({ managerMembershipRef: manager.publicRef })), /WAREHOUSE_SHEET_MANAGER_INELIGIBLE/);
  assert.ok(!(await listWarehouseManagerOptions(prisma, ctx)).data.some((row) => row.membershipRef === manager.publicRef));
});
test("manager employment dates follow tenant business day, independently of DB timezone", async () => {
  const person = await makePerson("dated");
  const [day] = await prisma.$queryRawUnsafe("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Etc/GMT+12')::date AS early, (CURRENT_TIMESTAMP AT TIME ZONE 'Pacific/Kiritimati')::date AS late");
  assert.ok(day.late > day.early);
  await prisma.employeeProfile.create({ data: { tenantId: ctx.tenantId, membershipId: person.id, userId: person.userId, employeeCode: "DATED", normalizedEmployeeCode: "DATED", employmentStatus: "ACTIVE", availabilityStatus: "AVAILABLE", contractEndsAt: day.early } });
  try {
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { timezone: "Etc/GMT+12" } });
    assert.ok((await listWarehouseManagerOptions(prisma, ctx, { q: "dated" })).data.some((row) => row.membershipRef === person.publicRef));
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { timezone: "Pacific/Kiritimati" } });
    assert.equal((await listWarehouseManagerOptions(prisma, ctx, { q: "dated" })).data.length, 0);
  } finally { await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { timezone: "America/Santo_Domingo" } }); }
});
test("inactive uses remain on existing areas but cannot be assigned to a new row", async () => {
  use = await updateWarehouseAreaUse(prisma, ctx, use.useRef, command("WAREHOUSE_AREA_USE_UPDATE", { expectedVersion: use.version, name: use.name, description: use.description, purpose: use.purpose, status: "INACTIVE" }, { useRef: use.useRef }));
  const previous = await sheet(complete.warehouseRef); const kept = (await save(editBody(previous))).warehouse; assert.equal(kept.rootAreaUseRef, use.useRef);
  const input = command("WAREHOUSE_SHEET_SAVE", editBody(kept, { rows: [newRow({ areaUseRef: use.useRef })] }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input), /WAREHOUSE_SHEET_USE_INACTIVE/); await noReceipt(input);
});
test("current actor denial blocks normal replay and receipt recovery after a serialization rollback", async () => {
  for (const permission of permissions.slice(0, 2)) await assert.rejects(() => saveWarehouseSheet(prisma, { ...ctx, deniedPermissions: [permission] }, completeInput), /WAREHOUSE_SHEET_FORBIDDEN/);
  let calls = 0;
  const revokedRetry = { $transaction: async (execute, options) => {
    calls++;
    if (calls === 1) {
      await prisma.tenantMembership.update({ where: { id: actorMembership.id }, data: { grantedPermissions: permissions.filter((permission) => permission !== "inventory:catalog:manage"), deniedPermissions: ["inventory:catalog:manage"], authorizationVersion: { increment: 1 } } });
      throw Object.assign(new Error("forced rolled-back snapshot"), { code: "P2034" });
    }
    return prisma.$transaction(execute, options);
  } };
  try {
    await assert.rejects(() => saveWarehouseSheet(revokedRetry, ctx, completeInput), /WAREHOUSE_SHEET_FORBIDDEN/); assert.equal(calls, 2);
    await assert.rejects(() => saveWarehouseSheet(prisma, ctx, completeInput), /WAREHOUSE_SHEET_FORBIDDEN/);
  } finally { await prisma.tenantMembership.update({ where: { id: actorMembership.id }, data: { grantedPermissions: permissions, deniedPermissions: [], authorizationVersion: { increment: 1 } } }); }
  assert.deepEqual(await saveWarehouseSheet(prisma, ctx, completeInput), { warehouse: complete, rowResults: (await prisma.materialInventoryCommand.findUnique({ where: { tenantId_requestId: { tenantId: ctx.tenantId, requestId: completeInput.requestId } } })).resultJson.rowResults });
});
test("SQL guards enforce immutable addresses/profile number and tenant warehouse correspondence", async () => {
  const profile = await prisma.warehouseSheetProfile.findFirst({ where: { tenantId: ctx.tenantId } });
  const address = await prisma.warehouseLocationAddress.findFirst({ where: { tenantId: ctx.tenantId, warehouseId: profile.warehouseId } });
  await assert.rejects(() => prisma.warehouseSheetProfile.update({ where: { id: profile.id }, data: { warehouseNumber: 99, version: { increment: 1 } } }), /V17_WAREHOUSE_SHEET_IDENTITY_IMMUTABLE/);
  await assert.rejects(() => prisma.warehouseSheetProfile.delete({ where: { id: profile.id } }), /V17_WAREHOUSE_SHEET_DELETE_FORBIDDEN/);
  await assert.rejects(() => prisma.warehouseLocationAddress.update({ where: { id: address.id }, data: { label: "MANUAL" } }), /V17_WAREHOUSE_ADDRESS_IMMUTABLE/);
  await assert.rejects(() => prisma.warehouseLocationAddress.delete({ where: { id: address.id } }), /V17_WAREHOUSE_ADDRESS_IMMUTABLE/);
  const otherLocation = await prisma.materialLocation.findFirst({ where: { tenantId: ctx.tenantId, warehouseId: { not: profile.warehouseId }, parentLocationId: null } });
  await assert.rejects(() => prisma.warehouseLocationAddress.create({ data: { tenantId: ctx.tenantId, warehouseId: profile.warehouseId, locationId: otherLocation.id, label: "ALM-99-000-00-00-0-0" } }), /V17_WAREHOUSE_ADDRESS_SCOPE_INVALID/);
  assert.deepEqual(await prisma.materialInventoryMovement.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } }), initialMovements);
});
