import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { createWarehouse, recordMovement } from "../api/_lib/materialsInventoryDomain.js";
import { createWarehouseAreaUse, listWarehouseConfiguration, updateWarehouseAreaUse, updateWarehouseLocationConfiguration } from "../api/_lib/warehouseConfigurationDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";

import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

const pg17 = process.env.V17_WAREHOUSE_CONFIGURATION_LOCAL_COMPAT === "PG17";
const target = pg17 ? null : validateV17ServicesTestUrl(process.env.DATABASE_URL);
if (!pg17) assert.equal(target.canonicalCi, true, "WAREHOUSE_CONFIGURATION_DB_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = pg17
  ? (await createWarehouseConfigurationPg17LocalPrisma(process.env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL)).prisma
  : new PrismaClient({ datasourceUrl: target.raw });
const suffix = crypto.randomUUID().slice(0, 8);
const permissions = ["inventory:stock:view", "inventory:catalog:manage", "inventory:stock:receive"];
const context = (tag) => ({ tenantId: `tenant-config-${suffix}-${tag}`, membershipId: `membership-config-${suffix}-${tag}`, userId: `user-config-${suffix}-${tag}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] });
const ctx = context("a"); const other = context("b");
function command(operation, payload, scope = {}, requestId = crypto.randomUUID()) { return { requestId, payloadHash: canonicalPayloadHash({ operation, requestId, ...scope, ...payload }), ...payload }; }
const usePayload = (name = "Depósito de clientes") => ({ name, description: "Uso explícito; no representa ocupación", purpose: "CLIENT_STORAGE" });
function useUpdate(row, patch = {}) { return { expectedVersion: row.version, name: row.name, description: row.description, purpose: row.purpose, status: row.status, ...patch }; }
function configurationPayload(row = {}, patch = {}) { return { expectedVersion: row.version ?? 0, areaUseRef: row.areaUseRef ?? null, characteristics: row.characteristics ?? null, notes: row.notes ?? null, operationalStatus: row.operationalStatus ?? "ACTIVE", availabilityRule: row.availabilityRule ?? "CONDITION_BASED", changeReason: null, acknowledgeImpact: false, ...patch }; }
async function configuration(locationRef, actor = ctx) { return (await listWarehouseConfiguration(prisma, actor)).locations.find((row) => row.locationRef === locationRef); }
async function saveConfiguration(locationRef, patch, actor = ctx) {
  const current = await configuration(locationRef, actor);
  return updateWarehouseLocationConfiguration(prisma, actor, locationRef, command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload(current, patch), { locationRef }));
}
async function epoch(actor = ctx) { return (await prisma.warehouseLocationPolicyEpoch.findUnique({ where: { tenantId: actor.tenantId } }))?.revision ?? 0n; }
async function noReceipt(input, actor = ctx) {
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: actor.tenantId, requestId: input.requestId } }), 0);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: actor.tenantId, request_id: input.requestId } }), 0);
}
const change = (patch) => ({ ...patch, changeReason: "Cambio de control sintético confirmado", acknowledgeImpact: true });
let warehouse; let foreignWarehouse; let root; let zone; let leaf; let sibling; let areaUse; let foreignUse;
let material; let insideAsset; let outsideAsset; const locationIds = new Map();

before(async () => {
  if (!pg17) await verifyV17ServicesLocalDatabase(prisma, target);
  for (const actor of [ctx, other]) {
    await prisma.tenant.create({ data: { id: actor.tenantId, code: actor.tenantId.toUpperCase(), name: "Warehouse configuration synthetic test" } });
    await prisma.user.create({ data: { id: actor.userId, code: actor.userId, name: "Synthetic configuration actor", email: `${actor.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-01", passwordHash: "synthetic-not-authenticatable" } });
    await prisma.tenantMembership.create({ data: { id: actor.membershipId, tenantId: actor.tenantId, userId: actor.userId, role: "A", status: "ACTIVE", isDefault: true, grantedPermissions: permissions } });
  }
  warehouse = await createWarehouse(prisma, ctx, command("WAREHOUSE_CREATE", { code: "CONFIG", name: "Almacén sintético", locations: [{ code: "ROOT", name: "Almacén sintético", kind: "WAREHOUSE_ROOT", parentCode: null }, { code: "ZONE", name: "Zona explícita", kind: "ZONE", parentCode: "ROOT" }, { code: "LEAF", name: "Posición explícita", kind: "BIN", parentCode: "ZONE" }, { code: "SAFE", name: "Zona independiente", kind: "ZONE", parentCode: "ROOT" }] }));
  [root, zone, leaf, sibling] = ["ROOT", "ZONE", "LEAF", "SAFE"].map((code) => warehouse.locations.find((row) => row.code === code));
  foreignWarehouse = await createWarehouse(prisma, other, command("WAREHOUSE_CREATE", { name: "Almacén de otra empresa" }));
  for (const row of await prisma.materialLocation.findMany({ where: { tenantId: ctx.tenantId } })) locationIds.set(row.locationRef, row.id);
});
after(async () => { await prisma.$disconnect(); });

test("reading legacy locations supplies defaults without creating uses, configuration or epoch rows", async () => {
  const result = await listWarehouseConfiguration(prisma, ctx);
  assert.deepEqual(result.areaUses, []); assert.equal(result.locations.length, 4);
  for (const row of result.locations) {
    assert.equal(row.configRef, null); assert.equal(row.version, 0); assert.equal(row.areaUseRef, null);
    assert.equal(row.operationalStatus, "ACTIVE"); assert.equal(row.availabilityRule, "CONDITION_BASED");
    assert.equal(row.lastControlReason, null); assert.equal(row.effective.canReceive, true); assert.equal(row.effective.canDispatch, true);
    assert.deepEqual(row.effective.blockedBy, []); assert.equal(row.effective.inherited, false);
  }
  assert.equal(await prisma.warehouseLocationConfiguration.count({ where: { tenantId: ctx.tenantId } }), 0);
  assert.equal(await epoch(), 0n);
});

test("concurrent area-use retries return one immutable automatic code, receipt, audit and epoch increment", async () => {
  const input = command("WAREHOUSE_AREA_USE_CREATE", usePayload());
  const rows = await Promise.all(Array.from({ length: 5 }, () => createWarehouseAreaUse(prisma, ctx, input)));
  areaUse = rows[0]; for (const row of rows) assert.deepEqual(row, areaUse);
  assert.match(areaUse.code, /^USO-[A-F0-9]{16}$/); assert.equal(areaUse.version, 1); assert.equal(areaUse.status, "ACTIVE"); assert.equal(areaUse.assignedLocationCount, 0);
  assert.equal(await prisma.warehouseAreaUse.count({ where: { tenantId: ctx.tenantId } }), 1);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 1);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: input.requestId } }), 1);
  assert.equal(await epoch(), 1n);
  await assert.rejects(() => createWarehouseAreaUse(prisma, ctx, command("WAREHOUSE_AREA_USE_CREATE", usePayload("Otro uso"), {}, input.requestId)), /WAREHOUSE_CONFIGURATION_IDEMPOTENCY_CONFLICT/);
  assert.equal(await epoch(), 1n);
  foreignUse = await createWarehouseAreaUse(prisma, other, input);
  assert.notEqual(foreignUse.code, areaUse.code); assert.notEqual(foreignUse.useRef, areaUse.useRef);
});

test("normalized duplicate names are rejected per tenant with no partial command", async () => {
  const beforeEpoch = await epoch(); const input = command("WAREHOUSE_AREA_USE_CREATE", usePayload("DEPÓSITO  DE CLIENTES"));
  await assert.rejects(() => createWarehouseAreaUse(prisma, ctx, input), /WAREHOUSE_AREA_USE_NAME_CONFLICT/);
  await noReceipt(input); assert.equal(await epoch(), beforeEpoch);
  assert.equal((await listWarehouseConfiguration(prisma, ctx)).areaUses.length, 1);
  assert.equal((await listWarehouseConfiguration(prisma, other)).areaUses.length, 1);
});

test("explicit assignment creates one versioned overlay and leaves the physical location unchanged", async () => {
  const beforeLocation = await prisma.materialLocation.findUnique({ where: { id: locationIds.get(zone.locationRef) } });
  const input = command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload({}, { areaUseRef: areaUse.useRef, characteristics: "Cubierta; acceso lateral", notes: "Revisión visual antes de cargar" }), { locationRef: zone.locationRef });
  const results = await Promise.all(Array.from({ length: 4 }, () => updateWarehouseLocationConfiguration(prisma, ctx, zone.locationRef, input)));
  for (const row of results) assert.deepEqual(row, results[0]);
  assert.equal(results[0].version, 1); assert.ok(results[0].configRef); assert.equal(results[0].areaUseRef, areaUse.useRef); assert.equal(results[0].lastControlReason, null);
  assert.deepEqual(await prisma.materialLocation.findUnique({ where: { id: beforeLocation.id } }), beforeLocation);
  assert.equal(await prisma.warehouseLocationConfiguration.count({ where: { tenantId: ctx.tenantId } }), 1);
  const stale = command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload({}, { notes: "Sobrescritura antigua" }), { locationRef: zone.locationRef });
  await assert.rejects(() => updateWarehouseLocationConfiguration(prisma, ctx, zone.locationRef, stale), /WAREHOUSE_CONFIGURATION_VERSION_CONFLICT/); await noReceipt(stale);
});

test("use rename and competing edits preserve public identity and reject stale versions", async () => {
  const initial = areaUse;
  areaUse = await updateWarehouseAreaUse(prisma, ctx, areaUse.useRef, command("WAREHOUSE_AREA_USE_UPDATE", useUpdate(areaUse, { name: "Custodia de clientes", purpose: "MIXED" }), { useRef: areaUse.useRef }));
  assert.equal(areaUse.code, initial.code); assert.equal(areaUse.useRef, initial.useRef); assert.equal(areaUse.version, 2); assert.equal(areaUse.assignedLocationCount, 1);
  const results = await Promise.allSettled(["Custodia A", "Custodia B"].map((name) => updateWarehouseAreaUse(prisma, ctx, areaUse.useRef, command("WAREHOUSE_AREA_USE_UPDATE", useUpdate(areaUse, { name }), { useRef: areaUse.useRef }))));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.match(results.find((row) => row.status === "rejected").reason.message, /WAREHOUSE_CONFIGURATION_VERSION_CONFLICT/);
  areaUse = results.find((row) => row.status === "fulfilled").value; assert.equal(areaUse.version, 3); assert.equal(areaUse.code, initial.code);
});

test("inactive use keeps existing assignments and metadata edits but cannot be newly assigned", async () => {
  areaUse = await updateWarehouseAreaUse(prisma, ctx, areaUse.useRef, command("WAREHOUSE_AREA_USE_UPDATE", useUpdate(areaUse, { status: "INACTIVE" }), { useRef: areaUse.useRef }));
  assert.equal(areaUse.assignedLocationCount, 1);
  const result = await saveConfiguration(zone.locationRef, { notes: "Actualizada conservando el uso histórico" });
  assert.equal(result.areaUseRef, areaUse.useRef);
  const input = command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload({}, { areaUseRef: areaUse.useRef }), { locationRef: leaf.locationRef });
  await assert.rejects(() => updateWarehouseLocationConfiguration(prisma, ctx, leaf.locationRef, input), /WAREHOUSE_AREA_USE_INACTIVE/); await noReceipt(input);
  assert.equal((await configuration(leaf.locationRef)).version, 0);
});

test("foreign use and location references remain opaque and cannot cross tenant boundaries", async () => {
  const inputs = [
    [ctx, zone.locationRef, configurationPayload(await configuration(zone.locationRef), { areaUseRef: foreignUse.useRef }), /WAREHOUSE_AREA_USE_NOT_FOUND/],
    [ctx, foreignWarehouse.locations[0].locationRef, configurationPayload(), /WAREHOUSE_LOCATION_NOT_FOUND/],
    [other, zone.locationRef, configurationPayload(), /WAREHOUSE_LOCATION_NOT_FOUND/],
  ];
  for (const [actor, locationRef, payload, error] of inputs) {
    const input = command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", payload, { locationRef });
    await assert.rejects(() => updateWarehouseLocationConfiguration(prisma, actor, locationRef, input), error); await noReceipt(input, actor);
  }
  await assert.rejects(() => updateWarehouseAreaUse(prisma, ctx, foreignUse.useRef, command("WAREHOUSE_AREA_USE_UPDATE", useUpdate(foreignUse), { useRef: foreignUse.useRef })), /WAREHOUSE_AREA_USE_NOT_FOUND/);
  assert.ok(!(await listWarehouseConfiguration(prisma, ctx)).locations.some((row) => row.locationRef === foreignWarehouse.locations[0].locationRef));
});

test("either control requires both fresh reason and acknowledgement while metadata preserves the last reason", async () => {
  const beforeEpoch = await epoch(); const current = await configuration(zone.locationRef);
  for (const patch of [{ operationalStatus: "RESTRICTED" }, { availabilityRule: "BLOCKED", changeReason: "Motivo sin confirmación" }, { availabilityRule: "BLOCKED", acknowledgeImpact: true }]) {
    const input = command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload(current, patch), { locationRef: zone.locationRef });
    await assert.rejects(() => updateWarehouseLocationConfiguration(prisma, ctx, zone.locationRef, input), /WAREHOUSE_CONFIGURATION_IMPACT_ACK_REQUIRED/); await noReceipt(input);
  }
  assert.equal(await epoch(), beforeEpoch);
  const blocked = await saveConfiguration(zone.locationRef, change({ availabilityRule: "BLOCKED" }));
  assert.equal(blocked.effective.canReceive, true); assert.equal(blocked.effective.canDispatch, false);
  const metadata = await saveConfiguration(zone.locationRef, { notes: "Solo metadatos; el control conserva su motivo", changeReason: "Este texto no reemplaza el último motivo de control" });
  assert.equal(metadata.lastControlReason, blocked.lastControlReason); assert.equal(metadata.configRef, current.configRef);
  await assert.rejects(() => saveConfiguration(zone.locationRef, { availabilityRule: "CONDITION_BASED" }), /WAREHOUSE_CONFIGURATION_IMPACT_ACK_REQUIRED/);
});

test("root restrictions inherit to descendants with reasons and cannot be overridden by child defaults", async () => {
  await saveConfiguration(root.locationRef, { ...change({ operationalStatus: "RESTRICTED" }), changeReason: "Inspección de cubierta del almacén" });
  let result = await configuration(leaf.locationRef);
  assert.equal(result.version, 0); assert.equal(result.operationalStatus, "ACTIVE"); assert.equal(result.availabilityRule, "CONDITION_BASED");
  assert.equal(result.effective.operationalStatus, "RESTRICTED"); assert.equal(result.effective.availabilityRule, "BLOCKED");
  assert.equal(result.effective.canReceive, false); assert.equal(result.effective.canDispatch, false); assert.equal(result.effective.inherited, true);
  assert.ok(result.effective.blockedBy.some((row) => row.locationRef === root.locationRef && row.reason === "Inspección de cubierta del almacén"));
  assert.ok(result.effective.blockedBy.some((row) => row.locationRef === zone.locationRef && row.kind === "DISPATCH_BLOCKED"));
  await saveConfiguration(root.locationRef, change({ operationalStatus: "ACTIVE" }));
  result = await configuration(leaf.locationRef); assert.equal(result.effective.canReceive, true); assert.equal(result.effective.canDispatch, false);
  await saveConfiguration(zone.locationRef, change({ availabilityRule: "CONDITION_BASED" }));
  result = await configuration(leaf.locationRef); assert.equal(result.effective.canDispatch, true); assert.deepEqual(result.effective.blockedBy, []);
});

test("concurrent initial configuration and competing updates produce one receipt or one version winner", async () => {
  const input = command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload({}, { characteristics: "Pasillo señalizado" }), { locationRef: sibling.locationRef });
  const beforeEpoch = await epoch();
  const results = await Promise.all(Array.from({ length: 5 }, () => updateWarehouseLocationConfiguration(prisma, ctx, sibling.locationRef, input)));
  for (const row of results) assert.deepEqual(row, results[0]);
  assert.equal(await epoch(), beforeEpoch + 1n);
  const original = results[0]; const updates = await Promise.allSettled(["Nota A", "Nota B"].map((notes) => updateWarehouseLocationConfiguration(prisma, ctx, sibling.locationRef, command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload(original, { notes }), { locationRef: sibling.locationRef }))));
  assert.equal(updates.filter((row) => row.status === "fulfilled").length, 1);
  assert.match(updates.find((row) => row.status === "rejected").reason.message, /WAREHOUSE_CONFIGURATION_VERSION_CONFLICT/);
  const replay = await updateWarehouseLocationConfiguration(prisma, ctx, sibling.locationRef, input);
  assert.deepEqual(replay, original); assert.equal((await configuration(sibling.locationRef)).version, 2);
});

test("descendant RESERVED and ASSIGNED material commitments block closing and reopening controls", async () => {
  const unit = await prisma.materialUnit.create({ data: { tenantId: ctx.tenantId, code: "UNIT", name: "Unidad sintética" } });
  material = await prisma.materialCatalogItem.create({ data: { tenantId: ctx.tenantId, code: "SYNTHETIC", name: "Material sintético", family: "TEST", baseUnitId: unit.id, purchaseUnitId: unit.id, consumptionUnitId: unit.id } });
  const reservation = await prisma.materialReservation.create({ data: { tenantId: ctx.tenantId, materialId: material.id, locationId: locationIds.get(leaf.locationRef), quantityBase: 1, cratingReference: "SYNTHETIC_GUARD_TEST" } });
  let beforeEpoch = await epoch();
  await assert.rejects(() => saveConfiguration(root.locationRef, change({ availabilityRule: "BLOCKED" })), /WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE/);
  await assert.rejects(() => saveConfiguration(zone.locationRef, change({ operationalStatus: "OUT_OF_SERVICE" })), /WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE/);
  assert.equal(await epoch(), beforeEpoch);
  await saveConfiguration(zone.locationRef, { notes: "Metadatos permitidos con compromiso vigente" });
  await prisma.materialReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", version: { increment: 1 } } });
  await saveConfiguration(root.locationRef, change({ availabilityRule: "BLOCKED" }));
  await prisma.materialReservation.update({ where: { id: reservation.id }, data: { status: "ASSIGNED", version: { increment: 1 } } });
  beforeEpoch = await epoch();
  await assert.rejects(() => saveConfiguration(root.locationRef, change({ availabilityRule: "CONDITION_BASED" })), /WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE/);
  assert.equal(await epoch(), beforeEpoch);
  await prisma.materialReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", version: { increment: 1 } } });
  await saveConfiguration(root.locationRef, change({ availabilityRule: "CONDITION_BASED" }));
});

test("still-ACTIVE asset reservations block descendants even when their time interval has passed", async () => {
  const model = await prisma.assetModel.create({ data: { tenantId: ctx.tenantId, code: "SYNTHETIC", name: "Modelo sintético", family: "TEST", resourceType: "TOOL" } });
  insideAsset = await prisma.assetInstance.create({ data: { tenantId: ctx.tenantId, assetModelId: model.id, currentLocationId: locationIds.get(leaf.locationRef), internalCode: "ASSET-IN" } });
  outsideAsset = await prisma.assetInstance.create({ data: { tenantId: ctx.tenantId, assetModelId: model.id, currentLocationId: locationIds.get(sibling.locationRef), internalCode: "ASSET-OUT" } });
  const reservation = await prisma.assetReservation.create({ data: { tenantId: ctx.tenantId, assetInstanceId: insideAsset.id, operationalReference: "SYNTHETIC_EXPIRED_INTERVAL", startsAt: new Date("2025-01-01T00:00:00.000Z"), endsAt: new Date("2025-01-02T00:00:00.000Z"), actorMembershipId: ctx.membershipId, actorUserId: ctx.userId } });
  await assert.rejects(() => saveConfiguration(zone.locationRef, change({ operationalStatus: "OUT_OF_SERVICE" })), /WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE/);
  await prisma.assetReservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED", version: { increment: 1 } } });
  const result = await saveConfiguration(zone.locationRef, change({ operationalStatus: "OUT_OF_SERVICE" }));
  assert.equal(result.effective.canReceive, false);
  await saveConfiguration(zone.locationRef, change({ operationalStatus: "ACTIVE" }));
});

test("planned and active asset assignments guard origin, destination and current location scopes", async () => {
  const base = { tenantId: ctx.tenantId, operationalReference: "SYNTHETIC_SCOPE_GUARD", actorMembershipId: ctx.membershipId, actorUserId: ctx.userId };
  const fixtures = [
    { assetInstanceId: outsideAsset.id, originLocationId: locationIds.get(leaf.locationRef) },
    { assetInstanceId: outsideAsset.id, destinationLocationId: locationIds.get(leaf.locationRef) },
    { assetInstanceId: insideAsset.id },
    { assetInstanceId: outsideAsset.id, destinationLocationId: locationIds.get(leaf.locationRef), status: "ACTIVE", custodianMembershipId: ctx.membershipId, custodianUserId: ctx.userId, handedOutAt: new Date("2026-10-31T00:00:00.000Z"), handoutCondition: "GOOD" },
  ];
  for (const fixture of fixtures) {
    const assignment = await prisma.assetAssignment.create({ data: { ...base, ...fixture } });
    await assert.rejects(() => saveConfiguration(zone.locationRef, change({ availabilityRule: "BLOCKED" })), /WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE/);
    await prisma.assetAssignment.update({ where: { id: assignment.id }, data: { status: "CANCELLED", version: { increment: 1 } } });
  }
  await saveConfiguration(zone.locationRef, change({ availabilityRule: "BLOCKED" }));
  await saveConfiguration(zone.locationRef, change({ availabilityRule: "CONDITION_BASED" }));
});

test("physical stock and stored assets alone allow controls without altering codes, stocks or custody", async () => {
  await recordMovement(prisma, ctx, command("INVENTORY_MOVEMENT", { movementType: "RECEIPT", materialRef: material.materialRef, locationRef: leaf.locationRef, counterpartLocationRef: null, quantity: 10, lotCode: null, reasonCode: "SYNTHETIC_RECEIPT", reservationRef: null, requirementRef: null }));
  const snapshot = async () => ({
    locations: await prisma.materialLocation.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } }),
    warehouses: await prisma.materialWarehouse.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } }),
    movements: await prisma.materialInventoryMovement.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } }),
    assets: await prisma.assetInstance.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } }),
    assignments: await prisma.assetAssignment.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: "asc" } }),
  });
  const beforeRows = await snapshot();
  const result = await saveConfiguration(root.locationRef, change({ operationalStatus: "OUT_OF_SERVICE", availabilityRule: "BLOCKED" }));
  assert.equal(result.effective.canReceive, false); assert.equal(result.effective.canDispatch, false);
  await saveConfiguration(root.locationRef, change({ operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED" }));
  assert.deepEqual(await snapshot(), beforeRows);
});

test("database guards preserve configuration identity, codes, versions and tenant-bound foreign keys", async () => {
  const use = await prisma.warehouseAreaUse.findFirstOrThrow({ where: { tenantId: ctx.tenantId, useRef: areaUse.useRef } });
  const config = await prisma.warehouseLocationConfiguration.findFirstOrThrow({ where: { tenantId: ctx.tenantId, locationId: locationIds.get(zone.locationRef) } });
  const foreignLocation = await prisma.materialLocation.findFirstOrThrow({ where: { tenantId: other.tenantId } });
  const foreignAreaUse = await prisma.warehouseAreaUse.findFirstOrThrow({ where: { tenantId: other.tenantId } });
  for (const data of [{ code: "RECODE" }, { useRef: crypto.randomUUID() }, { tenantId: other.tenantId }]) {
    await assert.rejects(() => prisma.warehouseAreaUse.update({ where: { id: use.id }, data: { ...data, version: { increment: 1 } } }), /V17_WAREHOUSE_CONFIGURATION_IDENTITY_IMMUTABLE/);
  }
  await assert.rejects(() => prisma.warehouseAreaUse.delete({ where: { id: use.id } }), /V17_WAREHOUSE_CONFIGURATION_DELETE_FORBIDDEN/);
  await assert.rejects(() => prisma.warehouseAreaUse.update({ where: { id: use.id }, data: { name: "Sin versión" } }));
  await assert.rejects(() => prisma.warehouseLocationConfiguration.update({ where: { id: config.id }, data: { locationId: locationIds.get(leaf.locationRef), version: { increment: 1 } } }), /V17_WAREHOUSE_CONFIGURATION_IDENTITY_IMMUTABLE/);
  await assert.rejects(() => prisma.warehouseLocationConfiguration.delete({ where: { id: config.id } }), /V17_WAREHOUSE_CONFIGURATION_DELETE_FORBIDDEN/);
  await assert.rejects(() => prisma.warehouseLocationConfiguration.create({ data: { tenantId: ctx.tenantId, locationId: foreignLocation.id } }), (error) => error.code === "P2003");
  await assert.rejects(() => prisma.warehouseLocationConfiguration.create({ data: { tenantId: ctx.tenantId, locationId: locationIds.get(leaf.locationRef), areaUseId: foreignAreaUse.id } }), (error) => error.code === "P2003");
  await assert.rejects(() => prisma.warehouseAreaUse.create({ data: { tenantId: ctx.tenantId, code: "INVALID", name: "Versión inicial inválida", nameKey: "invalid-initial", purpose: "INTERNAL", version: 2 } }), /V17_WAREHOUSE_CONFIGURATION_INITIAL_VERSION_INVALID/);
  const revision = await epoch();
  await assert.rejects(() => prisma.warehouseLocationPolicyEpoch.update({ where: { tenantId: ctx.tenantId }, data: { revision } }));
  await assert.rejects(() => prisma.warehouseLocationPolicyEpoch.delete({ where: { tenantId: ctx.tenantId } }), /V17_WAREHOUSE_POLICY_EPOCH_DELETE_FORBIDDEN/);
  assert.deepEqual(await prisma.warehouseAreaUse.findUnique({ where: { id: use.id } }), use);
  assert.deepEqual(await prisma.warehouseLocationConfiguration.findUnique({ where: { id: config.id } }), config);
  assert.equal(await epoch(), revision);
});

test("receipt or audit failure rolls back the catalog row and epoch together", async () => {
  const beforeEpoch = await epoch(); const name = "Fallo de actor sintético";
  const input = command("WAREHOUSE_AREA_USE_CREATE", usePayload(name));
  await assert.rejects(() => createWarehouseAreaUse(prisma, { ...ctx, membershipId: other.membershipId, userId: other.userId }, input), (error) => error.code === "P2003");
  assert.equal(await prisma.warehouseAreaUse.count({ where: { tenantId: ctx.tenantId, name } }), 0);
  await noReceipt(input); assert.equal(await epoch(), beforeEpoch);
});

test("domain permissions deny mutations before writes and all accepted commands have atomic audit receipts", async () => {
  const beforeEpoch = await epoch();
  for (const actor of [{ ...ctx, effectivePermissions: ["inventory:stock:view"] }, { ...ctx, effectivePermissions: ["inventory:catalog:manage"] }, { ...ctx, deniedPermissions: ["inventory:catalog:manage"] }, { ...ctx, deniedPermissions: ["inventory:stock:view"] }]) {
    await assert.rejects(() => createWarehouseAreaUse(prisma, actor, command("WAREHOUSE_AREA_USE_CREATE", usePayload("Denegado"))), /WAREHOUSE_CONFIGURATION_FORBIDDEN/);
    await assert.rejects(() => updateWarehouseAreaUse(prisma, actor, areaUse.useRef, command("WAREHOUSE_AREA_USE_UPDATE", useUpdate(areaUse), { useRef: areaUse.useRef })), /WAREHOUSE_CONFIGURATION_FORBIDDEN/);
    await assert.rejects(() => updateWarehouseLocationConfiguration(prisma, actor, leaf.locationRef, command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", configurationPayload(), { locationRef: leaf.locationRef })), /WAREHOUSE_CONFIGURATION_FORBIDDEN/);
  }
  await assert.rejects(() => listWarehouseConfiguration(prisma, { ...ctx, deniedPermissions: ["inventory:stock:view"] }), /WAREHOUSE_CONFIGURATION_FORBIDDEN/);
  assert.equal(await epoch(), beforeEpoch);
  const commands = await prisma.materialInventoryCommand.findMany({ where: { tenantId: ctx.tenantId, operation: { in: ["WAREHOUSE_AREA_USE_CREATE", "WAREHOUSE_AREA_USE_UPDATE", "WAREHOUSE_LOCATION_CONFIGURATION_UPDATE"] } } });
  const audits = await prisma.commercialAuditLog.findMany({ where: { tenant_id: ctx.tenantId, source: "V17_WAREHOUSE_CONFIGURATION" } });
  assert.ok(commands.length > 15); assert.equal(audits.length, commands.length);
  for (const row of commands) { assert.equal(audits.filter((audit) => audit.request_id === row.requestId).length, 1); assert.ok(!Object.hasOwn(row.resultJson, "id")); assert.ok(!Object.hasOwn(row.resultJson, "tenantId")); }
});
