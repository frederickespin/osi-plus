import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { createWarehouse, createWarehouseLocation, listWarehouses, updateWarehouse, updateWarehouseLocation } from "../api/_lib/materialsInventoryDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";

const target = validateV17ServicesTestUrl(process.env.DATABASE_URL);
assert.equal(target.canonicalCi, true, "WAREHOUSE_DB_TEST_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = new PrismaClient({ datasourceUrl: target.raw }); const suffix = crypto.randomUUID().slice(0, 8);
const permissions = ["inventory:stock:view", "inventory:catalog:manage"];
const context = (tag) => ({ tenantId: `tenant-space-${suffix}-${tag}`, membershipId: `membership-space-${suffix}-${tag}`, userId: `user-space-${suffix}-${tag}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] });
const ctx = context("a"); const other = context("b");
function command(operation, payload, scope = {}, requestId = crypto.randomUUID()) { return { requestId, payloadHash: canonicalPayloadHash({ operation, requestId, ...scope, ...payload }), ...payload }; }
function childPayload(warehouse, parent, name = "Zona física") { return { warehouseRef: warehouse.warehouseRef, parentLocationRef: parent.locationRef, name, kind: "ZONE" }; }
let warehouse; let root; let child; let secondWarehouse; let foreignWarehouse;

before(async () => {
  await verifyV17ServicesLocalDatabase(prisma, target);
  for (const context of [ctx, other]) {
    await prisma.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Warehouse synthetic test" } });
    await prisma.user.create({ data: { id: context.userId, code: context.userId, name: "Warehouse test actor", email: `${context.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-01", passwordHash: "synthetic-not-authenticatable" } });
    await prisma.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", isDefault: true, grantedPermissions: permissions } });
  }
});
after(async () => { await prisma.$disconnect(); });

test("automatic warehouse creates only one root with stable public identity and DTO", async () => {
  warehouse = await createWarehouse(prisma, ctx, command("WAREHOUSE_CREATE", { name: "Principal sintético" })); root = warehouse.locations[0];
  assert.match(warehouse.code, /^ALM-[A-F0-9]{16}$/); assert.equal(warehouse.locations.length, 1);
  assert.equal(root.name, warehouse.name); assert.equal(root.code, warehouse.code); assert.equal(root.kind, "WAREHOUSE_ROOT");
  assert.equal(root.parentLocationRef, null); assert.equal(root.depth, 0); assert.equal(root.path, warehouse.code);
  assert.equal(root.version, 1); assert.equal(root.status, "ACTIVE"); assert.notEqual(root.locationRef, warehouse.warehouseRef);
  assert.equal(await prisma.materialInventoryMovement.count({ where: { tenantId: ctx.tenantId } }), 0);
  assert.equal(await prisma.assetInstance.count({ where: { tenantId: ctx.tenantId } }), 0);
});

test("concurrent identical warehouse request returns one receipt, root and audit", async () => {
  const input = command("WAREHOUSE_CREATE", { name: "Almacén concurrente" });
  const results = await Promise.all(Array.from({ length: 5 }, () => createWarehouse(prisma, ctx, input)));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(await prisma.materialWarehouse.count({ where: { tenantId: ctx.tenantId, warehouseRef: results[0].warehouseRef } }), 1);
  assert.equal(await prisma.materialLocation.count({ where: { tenantId: ctx.tenantId, warehouse: { warehouseRef: results[0].warehouseRef } } }), 1);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 1);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: input.requestId } }), 1);
  await assert.rejects(() => createWarehouse(prisma, ctx, command("WAREHOUSE_CREATE", { name: "Otro nombre" }, {}, input.requestId)), /MATERIALS_IDEMPOTENCY_CONFLICT/);
});

test("equal request ID in another tenant creates isolated identity", async () => {
  const requestId = crypto.randomUUID(); const input = command("WAREHOUSE_CREATE", { name: "Almacén explícito" }, {}, requestId);
  secondWarehouse = await createWarehouse(prisma, ctx, input); foreignWarehouse = await createWarehouse(prisma, other, input);
  assert.notEqual(secondWarehouse.warehouseRef, foreignWarehouse.warehouseRef); assert.notEqual(secondWarehouse.code, foreignWarehouse.code);
  const rows = await listWarehouses(prisma, ctx); assert.ok(rows.some((row) => row.warehouseRef === secondWarehouse.warehouseRef));
  assert.ok(!rows.some((row) => row.warehouseRef === foreignWarehouse.warehouseRef));
});

test("concurrent explicit child creation preserves selected parent without extra nodes", async () => {
  const input = command("WAREHOUSE_LOCATION_CREATE", childPayload(warehouse, root));
  const results = await Promise.all(Array.from({ length: 5 }, () => createWarehouseLocation(prisma, ctx, input))); child = results[0];
  for (const result of results) assert.deepEqual(result, child);
  assert.match(child.code, /^UBI-[A-F0-9]{16}$/); assert.equal(child.parentLocationRef, root.locationRef);
  assert.equal(child.depth, 1); assert.equal(child.path, `${root.path}/${child.code}`); assert.equal(child.version, 1); assert.equal(child.status, "ACTIVE");
  assert.equal(await prisma.materialLocation.count({ where: { tenantId: ctx.tenantId, warehouse: { warehouseRef: warehouse.warehouseRef } } }), 2);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 1);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: input.requestId } }), 1);
  await assert.rejects(() => createWarehouseLocation(prisma, ctx, command("WAREHOUSE_LOCATION_CREATE", { ...childPayload(warehouse, root), kind: "RACK" }, {}, input.requestId)), /MATERIALS_IDEMPOTENCY_CONFLICT/);
});

test("distinct concurrent child commands keep separate identities and valid hierarchy", async () => {
  const children = await Promise.all(Array.from({ length: 4 }, (_, index) => createWarehouseLocation(prisma, ctx, command("WAREHOUSE_LOCATION_CREATE", childPayload(warehouse, child, `Posición ${index + 1}`)))));
  assert.equal(new Set(children.map((entry) => entry.code)).size, 4); assert.equal(new Set(children.map((entry) => entry.locationRef)).size, 4);
  for (const entry of children) { assert.equal(entry.parentLocationRef, child.locationRef); assert.equal(entry.depth, 2); }
});

test("cross-warehouse and cross-tenant parents are opaque not-found failures", async () => {
  for (const payload of [childPayload(warehouse, secondWarehouse.locations[0]), childPayload(warehouse, foreignWarehouse.locations[0]), childPayload(foreignWarehouse, root)]) {
    const input = command("WAREHOUSE_LOCATION_CREATE", payload);
    await assert.rejects(() => createWarehouseLocation(prisma, ctx, input), /MATERIALS_RESOURCE_NOT_FOUND/);
    assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 0);
  }
});

test("inactive warehouse, parent or ancestor prevent extending the tree", async () => {
  await prisma.materialWarehouse.updateMany({ where: { tenantId: ctx.tenantId, warehouseRef: warehouse.warehouseRef }, data: { status: "INACTIVE" } });
  await assert.rejects(() => createWarehouseLocation(prisma, ctx, command("WAREHOUSE_LOCATION_CREATE", childPayload(warehouse, root))), /MATERIALS_RESOURCE_INACTIVE/);
  await prisma.materialWarehouse.updateMany({ where: { tenantId: ctx.tenantId, warehouseRef: warehouse.warehouseRef }, data: { status: "ACTIVE" } });
  await prisma.materialLocation.updateMany({ where: { tenantId: ctx.tenantId, locationRef: root.locationRef }, data: { status: "INACTIVE" } });
  await assert.rejects(() => createWarehouseLocation(prisma, ctx, command("WAREHOUSE_LOCATION_CREATE", childPayload(warehouse, root))), /MATERIALS_RESOURCE_INACTIVE/);
  await assert.rejects(() => createWarehouseLocation(prisma, ctx, command("WAREHOUSE_LOCATION_CREATE", childPayload(warehouse, child))), /MATERIALS_RESOURCE_INACTIVE/);
  await prisma.materialLocation.updateMany({ where: { tenantId: ctx.tenantId, locationRef: root.locationRef }, data: { status: "ACTIVE" } });
});

test("warehouse rename keeps all codes, refs and paths; root name follows warehouse", async () => {
  const before = (await listWarehouses(prisma, ctx)).find((entry) => entry.warehouseRef === warehouse.warehouseRef);
  const input = command("WAREHOUSE_UPDATE", { expectedVersion: warehouse.version, name: "Principal corregido" }, { warehouseRef: warehouse.warehouseRef });
  const results = await Promise.all([updateWarehouse(prisma, ctx, warehouse.warehouseRef, input), updateWarehouse(prisma, ctx, warehouse.warehouseRef, input)]);
  assert.deepEqual(results[0], results[1]); warehouse = results[0];
  assert.equal(warehouse.name, "Principal corregido"); assert.equal(warehouse.version, 2); assert.equal(warehouse.code, before.code);
  for (const location of warehouse.locations) {
    const old = before.locations.find((entry) => entry.locationRef === location.locationRef);
    assert.equal(location.code, old.code); assert.equal(location.path, old.path); assert.equal(location.parentLocationRef, old.parentLocationRef);
    if (location.parentLocationRef === null) { assert.equal(location.name, warehouse.name); assert.equal(location.version, old.version + 1); }
    else { assert.equal(location.name, old.name); assert.equal(location.version, old.version); }
  }
  await assert.rejects(() => updateWarehouse(prisma, ctx, warehouse.warehouseRef, command("WAREHOUSE_UPDATE", { expectedVersion: 1, name: "Desfasado" }, { warehouseRef: warehouse.warehouseRef })), /MATERIALS_VERSION_CONFLICT/);
});

test("competing name edits have one winner and stale changes cannot overwrite it", async () => {
  const results = await Promise.allSettled(["Nombre A", "Nombre B"].map((name) => updateWarehouse(prisma, ctx, warehouse.warehouseRef, command("WAREHOUSE_UPDATE", { expectedVersion: warehouse.version, name }, { warehouseRef: warehouse.warehouseRef }))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message, /MATERIALS_VERSION_CONFLICT/);
  warehouse = results.find((result) => result.status === "fulfilled").value; assert.equal(warehouse.version, 3);
});

test("location name edit is idempotent and preserves physical identity", async () => {
  const input = command("WAREHOUSE_LOCATION_UPDATE", { expectedVersion: child.version, name: "Zona corregida" }, { locationRef: child.locationRef });
  const results = await Promise.all([updateWarehouseLocation(prisma, ctx, child.locationRef, input), updateWarehouseLocation(prisma, ctx, child.locationRef, input)]);
  assert.deepEqual(results[0], results[1]); const updated = results[0];
  for (const key of ["locationRef", "parentLocationRef", "code", "kind", "path", "depth", "status"]) assert.equal(updated[key], child[key]);
  assert.equal(updated.name, "Zona corregida"); assert.equal(updated.version, 2);
  await assert.rejects(() => updateWarehouseLocation(prisma, ctx, child.locationRef, command("WAREHOUSE_LOCATION_UPDATE", { expectedVersion: 1, name: "Desfasado" }, { locationRef: child.locationRef })), /MATERIALS_VERSION_CONFLICT/);
  child = updated;
});

test("root is edited through warehouse and foreign identities cannot be renamed", async () => {
  await assert.rejects(() => updateWarehouseLocation(prisma, ctx, root.locationRef, command("WAREHOUSE_LOCATION_UPDATE", { expectedVersion: 1, name: "Desvinculado" }, { locationRef: root.locationRef })), /MATERIALS_WAREHOUSE_ROOT_EDIT_REQUIRED/);
  await assert.rejects(() => updateWarehouse(prisma, ctx, foreignWarehouse.warehouseRef, command("WAREHOUSE_UPDATE", { expectedVersion: 1, name: "Foreign" }, { warehouseRef: foreignWarehouse.warehouseRef })), /MATERIALS_RESOURCE_NOT_FOUND/);
  await assert.rejects(() => updateWarehouseLocation(prisma, other, child.locationRef, command("WAREHOUSE_LOCATION_UPDATE", { expectedVersion: child.version, name: "Foreign" }, { locationRef: child.locationRef })), /MATERIALS_RESOURCE_NOT_FOUND/);
});

test("explicit legacy trees retain requested codes and expose parent refs", async () => {
  const input = command("WAREHOUSE_CREATE", { code: "LEGACY", name: "Legado", locations: [{ code: "ROOT", name: "Principal", kind: "WAREHOUSE_ROOT", parentCode: null }, { code: "A-01", name: "Interior", kind: "AISLE", parentCode: "ROOT" }] });
  const legacy = await createWarehouse(prisma, ctx, input);
  assert.equal(legacy.code, "LEGACY"); assert.equal(legacy.locations[0].code, "ROOT"); assert.equal(legacy.locations[1].code, "A-01");
  assert.equal(legacy.locations[1].parentLocationRef, legacy.locations[0].locationRef);
  await assert.rejects(() => createWarehouse(prisma, ctx, command("WAREHOUSE_CREATE", { code: "LEGACY", name: "Duplicado", locations: [{ code: "ROOT", name: "Root", kind: "WAREHOUSE_ROOT", parentCode: null }] })), /MATERIALS_CODE_CONFLICT/);
});

test("depth and path limits fail atomically without creating a partial warehouse", async () => {
  for (const [code, count, width] of [["TOO-DEEP", 34, 0], ["TOO-LONG", 10, 64]]) {
    const locations = Array.from({ length: count }, (_, index) => ({ code: `N${index}`.padEnd(width, "X"), name: `Lugar ${index}`, kind: index ? "ZONE" : "WAREHOUSE_ROOT", parentCode: index ? `N${index - 1}`.padEnd(width, "X") : null }));
    const input = command("WAREHOUSE_CREATE", { code, name: "Árbol inválido", locations });
    await assert.rejects(() => createWarehouse(prisma, ctx, input), /MATERIALS_LOCATION_LIMIT_REACHED/);
    assert.equal(await prisma.materialWarehouse.count({ where: { tenantId: ctx.tenantId, code } }), 0);
    assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 0);
  }
});

test("adding a child respects depth and path limits in existing valid trees", async () => {
  for (const [code, count, width] of [["MAX-DEPTH", 33, 0], ["MAX-PATH", 9, 64]]) {
    const locations = Array.from({ length: count }, (_, index) => ({ code: `N${index}`.padEnd(width, "X"), name: `Lugar ${index}`, kind: index ? "ZONE" : "WAREHOUSE_ROOT", parentCode: index ? `N${index - 1}`.padEnd(width, "X") : null }));
    const tree = await createWarehouse(prisma, ctx, command("WAREHOUSE_CREATE", { code, name: "Árbol límite", locations }));
    const input = command("WAREHOUSE_LOCATION_CREATE", childPayload(tree, tree.locations.at(-1)));
    await assert.rejects(() => createWarehouseLocation(prisma, ctx, input), /MATERIALS_LOCATION_LIMIT_REACHED/);
    assert.equal(await prisma.materialLocation.count({ where: { tenantId: ctx.tenantId, warehouse: { warehouseRef: tree.warehouseRef } } }), count);
  }
});

test("all warehouse mutations have one atomic receipt and audit; denied actors make no writes", async () => {
  const countBefore = await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId } });
  for (const permissions of [["inventory:stock:view"], ["inventory:catalog:manage"], []]) {
    await assert.rejects(() => createWarehouse(prisma, { ...ctx, effectivePermissions: permissions }, command("WAREHOUSE_CREATE", { name: "No autorizado" })), /MATERIALS_FORBIDDEN/);
  }
  await assert.rejects(() => createWarehouse(prisma, { ...ctx, deniedPermissions: ["inventory:catalog:manage"] }, command("WAREHOUSE_CREATE", { name: "No autorizado" })), /MATERIALS_FORBIDDEN/);
  await assert.rejects(() => listWarehouses(prisma, { ...ctx, deniedPermissions: ["inventory:stock:view"] }), /MATERIALS_FORBIDDEN/);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId } }), countBefore);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, source: "V17_MATERIALS_INVENTORY" } }), countBefore);
});
