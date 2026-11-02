import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { listWarehouseSheets, saveWarehouseSheet } from "../api/_lib/warehouseSheetDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

const pg17 = process.env.V17_WAREHOUSE_CONFIGURATION_LOCAL_COMPAT === "PG17";
const target = pg17 ? null : validateV17ServicesTestUrl(process.env.DATABASE_URL);
if (!pg17) assert.equal(target.canonicalCi, true, "WAREHOUSE_LOCALITIES_DB_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = pg17 ? (await createWarehouseConfigurationPg17LocalPrisma(process.env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL)).prisma : new PrismaClient({ datasourceUrl: target.raw });
const suffix = crypto.randomUUID().slice(0, 8);
const permissions = ["inventory:stock:view", "inventory:catalog:manage"];
const actor = (tag) => ({ tenantId: `tenant-localities-${suffix}-${tag}`, membershipId: `member-localities-${suffix}-${tag}`, userId: `user-localities-${suffix}-${tag}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] });
const ctx = actor("a"), foreign = actor("b");
const enabled = { routesEnabled: true, localitiesEnabled: true }, legacy = { routesEnabled: true, localitiesEnabled: false };
function command(body, requestId = crypto.randomUUID()) { return { requestId, payloadHash: canonicalPayloadHash({ operation: "WAREHOUSE_SHEET_SAVE", requestId, ...body }), ...body }; }
function body(patch = {}) { return { warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0, name: "Synthetic locality warehouse", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [], ...patch }; }
function edit(value, patch = {}) { return body({ warehouseRef: value.warehouseRef, expectedWarehouseVersion: value.version, expectedProfileVersion: value.profileVersion, name: value.name, managerMembershipRef: value.manager?.membershipRef ?? null, rootAreaUseRef: value.rootAreaUseRef, expectedRootConfigurationVersion: value.rootConfigurationVersion, ...patch }); }
function row(kind, identifier, parentRowId = null) { return { action: "CREATE", rowId: crypto.randomUUID(), parentRowId, parentLocationRef: null, kind, identifier, name: `${kind} ${identifier}`, areaUseRef: null }; }
async function save(input, context = ctx, options = enabled) { return saveWarehouseSheet(prisma, context, command(input), options); }
async function get(ref, context = ctx, options = enabled) { return (await listWarehouseSheets(prisma, context, options)).warehouses.find((item) => item.warehouseRef === ref); }
async function profile(ref, context = ctx) { return prisma.warehouseSheetProfile.findFirst({ where: { tenantId: context.tenantId, warehouse: { warehouseRef: ref } } }); }
async function locations(ref, context = ctx) { return prisma.materialLocation.findMany({ where: { tenantId: context.tenantId, warehouse: { warehouseRef: ref } }, include: { address: true, configuration: true }, orderBy: { id: "asc" } }); }
async function noReceipt(input, context = ctx) {
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: context.tenantId, requestId: input.requestId } }), 0);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: context.tenantId, request_id: input.requestId } }), 0);
}
let first, second, fourth, oldInput, oldReceipt, foreignWarehouse;
before(async () => {
  if (!pg17) await verifyV17ServicesLocalDatabase(prisma, target);
  const [column] = await prisma.$queryRawUnsafe("SELECT COUNT(*)::integer AS total FROM information_schema.columns WHERE table_schema='osi' AND table_name='warehouse_sheet_profiles' AND column_name='locality_number'");
  assert.equal(column.total, 1, "Migration41 required");
  for (const context of [ctx, foreign]) {
    await prisma.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Synthetic locality fixture" } });
    await prisma.user.create({ data: { id: context.userId, code: context.userId, name: "Synthetic actor", email: `${context.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-02", passwordHash: "synthetic-not-authenticatable" } });
    await prisma.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", grantedPermissions: permissions } });
  }
  foreignWarehouse = (await save(body({ localityNumber: 1 }), foreign)).warehouse;
});
after(async () => { await prisma.$disconnect(); });

test("durable pre41 payload replays the exact stored40 receipt without adding20E fields", { skip: !process.env.V17_WAREHOUSE_LOCALITIES_LEGACY_EVIDENCE_PATH }, async () => {
  const checkpoint = JSON.parse(await readFile(process.env.V17_WAREHOUSE_LOCALITIES_LEGACY_EVIDENCE_PATH, "utf8"));
  assert.equal(checkpoint.synthetic, true); assert.equal(checkpoint.fromMigration, 40);
  const { context, createInput, original } = checkpoint;
  assert.equal((await profile(original.warehouse.warehouseRef, context)).localityNumber, null);
  assert.deepEqual(await saveWarehouseSheet(prisma, context, createInput, enabled), original);
  assert.equal(Object.hasOwn(original.warehouse, "localityNumber"), false);
  const current = await get(original.warehouse.warehouseRef, context);
  const saved = await save(edit(current, { localityNumber: 1 }), context);
  assert.equal(saved.warehouse.localityNumber, 1);
  assert.deepEqual(await saveWarehouseSheet(prisma, context, createInput, enabled), original);
});
test("absence preserves legacy request hashing and creates no inferred locality", async () => {
  oldInput = command(body()); oldReceipt = await saveWarehouseSheet(prisma, ctx, oldInput, legacy); first = oldReceipt.warehouse;
  assert.equal(first.warehouseNumber, 1); assert.equal(Object.hasOwn(first, "localityNumber"), false);
  const current = await get(first.warehouseRef);
  assert.equal(current.localityNumber, null);
  assert.ok(current.locations.every((item) => item.address?.displayLabel === null));
  assert.deepEqual(await saveWarehouseSheet(prisma, ctx, oldInput, enabled), oldReceipt);
});
test("persisted locality produces the approved GM1 route for warehouse2", async () => {
  const zone = row("ZONE", "GM1"), aisle = row("AISLE", "01", zone.rowId), rack = row("RACK", "AB", aisle.rowId), level = row("LEVEL", "3", rack.rowId);
  second = (await save(body({ localityNumber: 1, rows: [level, rack, aisle, zone] }))).warehouse;
  assert.equal(second.warehouseNumber, 2); assert.equal(second.localityNumber, 1);
  const address = second.locations.find((item) => item.kind === "LEVEL").address;
  assert.equal(address.label, "ALM-02-GM1-01-AB-3-0"); assert.equal(address.displayLabel, "S1-ALM2-GM1-01-AB-03-0");
  assert.equal((await profile(second.warehouseRef)).localityNumber, 1);
  assert.deepEqual(await get(second.warehouseRef), second);
});
test("container bank skips unused segments and renders the approved warehouse4 example", async () => {
  await save(body());
  const rack = row("RACK", "AA"), level = row("LEVEL", "2", rack.rowId);
  fourth = (await save(body({ name: "Synthetic bank", localityNumber: 1, rows: [level, rack] }))).warehouse;
  assert.equal(fourth.warehouseNumber, 4);
  const address = fourth.locations.find((item) => item.kind === "LEVEL").address;
  assert.equal(address.label, "ALM-04-000-00-AA-2-0"); assert.equal(address.displayLabel, "S1-ALM4-000-00-AA-02-0");
});
test("locality changes advance profile and warehouse versions while preserving all historical location bytes", async () => {
  const previous = await get(second.warehouseRef), stored = await locations(second.warehouseRef);
  second = (await save(edit(previous, { localityNumber: 2 }))).warehouse;
  assert.equal(second.profileVersion, previous.profileVersion + 1); assert.equal(second.version, previous.version + 1);
  for (const key of ["warehouseRef", "code", "warehouseNumber", "rootLocationRef"]) assert.equal(second[key], previous[key]);
  assert.deepEqual(await locations(second.warehouseRef), stored);
  assert.equal(second.locations.find((item) => item.kind === "LEVEL").address.displayLabel, "S2-ALM2-GM1-01-AB-03-0");
});
test("omission in both new and legacy edits retains the saved locality; explicit null clears it", async () => {
  second = (await save(edit(second))).warehouse;
  assert.equal(second.localityNumber, 2);
  const oldShape = (await save(edit(second), ctx, legacy)).warehouse;
  assert.equal(Object.hasOwn(oldShape, "localityNumber"), false);
  assert.ok(oldShape.locations.every((item) => !Object.hasOwn(item.address, "displayLabel")));
  assert.equal((await profile(second.warehouseRef)).localityNumber, 2);
  second = (await save(edit(oldShape, { localityNumber: null }))).warehouse;
  assert.equal(second.localityNumber, null); assert.ok(second.locations.every((item) => item.address.displayLabel === null));
});
test("application and SQL reject invalid ranges without modifying profiles, receipts or old labels", async () => {
  const previous = await get(second.warehouseRef), stored = await profile(second.warehouseRef), oldLocations = await locations(second.warehouseRef);
  for (const localityNumber of [0, -1, 1000, 1.5, "1", "", undefined]) {
    const input = command(edit(previous, { localityNumber }));
    await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input, enabled), /WAREHOUSE_SHEET_INPUT_INVALID/); await noReceipt(input);
  }
  for (const invalid of [0, -1, 1000]) await assert.rejects(() => prisma.warehouseSheetProfile.updateMany({ where: { id: stored.id, tenantId: ctx.tenantId, version: stored.version }, data: { localityNumber: invalid, version: { increment: 1 } } }));
  await assert.rejects(() => prisma.warehouseSheetProfile.updateMany({ where: { id: stored.id }, data: { localityNumber: 1 } }));
  assert.deepEqual(await profile(second.warehouseRef), stored); assert.deepEqual(await locations(second.warehouseRef), oldLocations);
  second = (await save(edit(previous, { localityNumber: 999 }))).warehouse; assert.equal(second.localityNumber, 999);
});
test("a failing row rolls back locality, versions and the entire command", async () => {
  const previous = await get(second.warehouseRef), stored = await profile(second.warehouseRef), oldLocations = await locations(second.warehouseRef);
  const input = command(edit(previous, { localityNumber: 3, rows: [{ ...row("ZONE", "X01"), parentLocationRef: foreignWarehouse.rootLocationRef }] }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input, enabled), /WAREHOUSE_SHEET_LOCATION_NOT_FOUND/);
  await noReceipt(input); assert.deepEqual(await get(second.warehouseRef), previous);
  assert.deepEqual(await profile(second.warehouseRef), stored); assert.deepEqual(await locations(second.warehouseRef), oldLocations);
});
test("concurrent identical commands produce one durable receipt and audit; stale versions cannot overwrite", async () => {
  const previous = await get(fourth.warehouseRef), input = command(edit(previous, { localityNumber: 2 }));
  const results = await Promise.all(Array.from({ length: 4 }, () => saveWarehouseSheet(prisma, ctx, input, enabled)));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: ctx.tenantId, requestId: input.requestId } }), 1);
  assert.equal(await prisma.commercialAuditLog.count({ where: { tenant_id: ctx.tenantId, request_id: input.requestId } }), 1);
  const stale = command(edit(previous, { localityNumber: 3 }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, stale, enabled), /WAREHOUSE_SHEET_VERSION_CONFLICT/); await noReceipt(stale);
  const changedPayload = command(edit(previous, { localityNumber: 3 }), input.requestId);
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, changedPayload, enabled), /IDEMPOTENCY_CONFLICT/);
  assert.deepEqual(await get(fourth.warehouseRef), results[0].warehouse);
});
test("localities do not bypass tenant authorization and OFF rejects only the new field", async () => {
  const input = command(edit(foreignWarehouse, { localityNumber: 2 }));
  await assert.rejects(() => saveWarehouseSheet(prisma, ctx, input, enabled), /WAREHOUSE_SHEET_NOT_FOUND/); await noReceipt(input);
  const previous = await get(fourth.warehouseRef);
  for (const localityNumber of [1, null]) await assert.rejects(() => saveWarehouseSheet(prisma, ctx, command(edit(previous, { localityNumber })), legacy), /WAREHOUSE_LOCALITIES_DISABLED/);
  assert.equal((await listWarehouseSheets(prisma, ctx, enabled)).warehouses.some((item) => item.warehouseRef === foreignWarehouse.warehouseRef), false);
  assert.equal((await get(foreignWarehouse.warehouseRef, foreign)).localityNumber, 1);
});
