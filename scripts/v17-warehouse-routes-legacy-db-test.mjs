import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { listWarehouseSheets, saveWarehouseSheet } from "../api/_lib/warehouseSheetDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

// Run after migration39, using the client generated from schema40, and before
// the BEFORE40 capture. The missing column proves that the OFF path never reads it.
const pg17 = process.env.V17_WAREHOUSE_CONFIGURATION_LOCAL_COMPAT === "PG17";
const target = pg17 ? null : validateV17ServicesTestUrl(process.env.DATABASE_URL);
if (!pg17) assert.equal(target.canonicalCi, true, "WAREHOUSE_ROUTES_LEGACY_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = pg17 ? (await createWarehouseConfigurationPg17LocalPrisma(process.env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL)).prisma : new PrismaClient({ datasourceUrl: target.raw });
const id = crypto.randomUUID().slice(0, 8);
const permissions = ["inventory:stock:view", "inventory:catalog:manage"];
const context = { tenantId: `tenant-routes-legacy-${id}`, membershipId: `member-routes-legacy-${id}`, userId: `user-routes-legacy-${id}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] };
const options = { routesEnabled: false };
function command(body) { const requestId = crypto.randomUUID(); return { requestId, payloadHash: canonicalPayloadHash({ operation: "WAREHOUSE_SHEET_SAVE", requestId, ...body }), ...body }; }
const createRow = (kind, parentRowId = null) => ({ action: "CREATE", rowId: crypto.randomUUID(), parentRowId, parentLocationRef: null, kind, name: kind, areaUseRef: null });
let original, createInput;
async function assertSchema39() {
  const [row] = await prisma.$queryRawUnsafe(`SELECT
    (SELECT COUNT(*)::integer FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS count,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='warehouse_location_addresses' AND column_name='zone_code') AS zone_code`);
  assert.equal(row.count, 39); assert.equal(row.zone_code, false);
}
before(async () => {
  if (!pg17) await verifyV17ServicesLocalDatabase(prisma, target);
  assert.ok(Prisma.dmmf.datamodel.models.find((model) => model.name === "WarehouseLocationAddress").fields.some((field) => field.name === "zoneCode"), "Test requires the schema40-generated client");
  await assertSchema39();
  await prisma.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Synthetic schema39 compatibility" } });
  await prisma.user.create({ data: { id: context.userId, code: context.userId, name: "Synthetic legacy actor", email: `${context.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-02", passwordHash: "synthetic-not-authenticatable" } });
  await prisma.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", grantedPermissions: permissions } });
});
after(async () => { await prisma.$disconnect(); });

test("schema40 client reads and saves a full20C worksheet while zone_code is absent", async () => {
  assert.deepEqual(await listWarehouseSheets(prisma, context, options), { warehouses: [] });
  const rack = createRow("RACK"), bin = createRow("BIN", rack.rowId);
  createInput = command({ warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0, name: "Legacy worksheet", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [bin, rack] });
  original = await saveWarehouseSheet(prisma, context, createInput, options);
  assert.equal(original.warehouse.locations.find((row) => row.kind === "BIN").address.label, "ALM-01-000-00-AA-0-1");
  assert.ok(original.warehouse.locations.every((row) => !Object.hasOwn(row.address, "zoneCode")));
  assert.deepEqual((await listWarehouseSheets(prisma, context, options)).warehouses, [original.warehouse]);
  assert.deepEqual(await saveWarehouseSheet(prisma, context, createInput, options), original);
});

test("legacy edit inserts numeric segments and exact replay retains the original receipt on schema39", async () => {
  const previous = original.warehouse;
  const body = { warehouseRef: previous.warehouseRef, expectedWarehouseVersion: previous.version, expectedProfileVersion: previous.profileVersion, name: "Legacy edited", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [createRow("ZONE")] };
  const edited = await saveWarehouseSheet(prisma, context, command(body), options);
  assert.equal(edited.warehouse.locations.find((row) => row.kind === "ZONE").address.label, "ALM-01-001-00-00-0-0");
  assert.equal(edited.warehouse.version, 2);
  assert.deepEqual(await saveWarehouseSheet(prisma, context, createInput, options), original);
  const blocked = command({ ...body, rows: [{ ...createRow("ZONE"), identifier: "TRD" }] });
  await assert.rejects(() => saveWarehouseSheet(prisma, context, blocked, options), /WAREHOUSE_ROUTES_DISABLED/);
  assert.deepEqual((await listWarehouseSheets(prisma, context, options)).warehouses, [edited.warehouse]);
  await assertSchema39();
});
