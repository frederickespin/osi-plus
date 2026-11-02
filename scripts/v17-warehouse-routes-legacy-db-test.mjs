import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { listWarehouseSheets, saveWarehouseSheet } from "../api/_lib/warehouseSheetDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

// Run after migration39, using the client generated from schema40, and before
// the BEFORE40 capture. The missing column proves that the OFF path never reads it.
// Each fixture rolls back with its outer transaction. Receipt reads here verify
// schema compatibility within that transaction; durable commits, fresh-snapshot
// replay and concurrency are covered by the normal 20C/20D suites after40.
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
async function assertSchema39(database = prisma) {
  const [row] = await database.$queryRawUnsafe(`SELECT
    (SELECT COUNT(*)::integer FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS count,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='warehouse_location_addresses' AND column_name='zone_code') AS zone_code`);
  assert.equal(row.count, 39); assert.equal(row.zone_code, false);
}
const fixtureModels = ["user", "tenant", "tenantMembership", "materialWarehouse", "materialLocation", "warehouseSheetProfile", "warehouseLocationAddress", "warehouseLocationConfiguration", "warehouseLocationPolicyEpoch", "materialInventoryCommand", "commercialAuditLog"];
async function globalCounts() {
  return Object.fromEntries(await Promise.all(fixtureModels.map(async (model) => [model, await prisma[model].count()])));
}
async function withRolledBackFixture(run) {
  const initialCounts = await globalCounts();
  const rollback = new Error("WAREHOUSE_ROUTES_LEGACY_EXPECTED_ROLLBACK");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Synthetic schema39 compatibility" } });
      await tx.user.create({ data: { id: context.userId, code: context.userId, name: "Synthetic legacy actor", email: `${context.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-02", passwordHash: "synthetic-not-authenticatable" } });
      await tx.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", grantedPermissions: permissions } });
      // The domain callbacks use the real Prisma transaction and execute every
      // SQL statement and trigger. Only their commit boundary belongs to this
      // harness, which always rolls back; no fixture rows are deleted manually.
      const database = { $transaction: (callback) => callback(tx) };
      await run(database, tx);
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 }), (error) => error === rollback);
  } finally {
    assert.deepEqual(await globalCounts(), initialCounts, "Schema39 compatibility fixtures must leave every touched table's row count unchanged");
    await assertSchema39();
  }
}
async function createLegacyWorksheet(database) {
  const rack = createRow("RACK"), bin = createRow("BIN", rack.rowId);
  const createInput = command({ warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0, name: "Legacy worksheet", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [bin, rack] });
  return { original: await saveWarehouseSheet(database, context, createInput, options), createInput };
}
before(async () => {
  if (!pg17) await verifyV17ServicesLocalDatabase(prisma, target);
  assert.ok(Prisma.dmmf.datamodel.models.find((model) => model.name === "WarehouseLocationAddress").fields.some((field) => field.name === "zoneCode"), "Test requires the schema40-generated client");
  await assertSchema39();
});
after(async () => { await prisma.$disconnect(); });

test("schema40 client reads and saves a full20C worksheet while zone_code is absent", async () => {
  await withRolledBackFixture(async (database) => {
    assert.deepEqual(await listWarehouseSheets(database, context, options), { warehouses: [] });
    const { original, createInput } = await createLegacyWorksheet(database);
    assert.equal(original.warehouse.locations.find((row) => row.kind === "BIN").address.label, "ALM-01-000-00-AA-0-1");
    assert.ok(original.warehouse.locations.every((row) => !Object.hasOwn(row.address, "zoneCode")));
    assert.deepEqual((await listWarehouseSheets(database, context, options)).warehouses, [original.warehouse]);
    assert.deepEqual(await saveWarehouseSheet(database, context, createInput, options), original);
  });
});

test("legacy edit inserts numeric segments and exact replay retains the original receipt on schema39", async () => {
  await withRolledBackFixture(async (database, tx) => {
    const { original, createInput } = await createLegacyWorksheet(database);
    const previous = original.warehouse;
    const body = { warehouseRef: previous.warehouseRef, expectedWarehouseVersion: previous.version, expectedProfileVersion: previous.profileVersion, name: "Legacy edited", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [createRow("ZONE")] };
    const edited = await saveWarehouseSheet(database, context, command(body), options);
    assert.equal(edited.warehouse.locations.find((row) => row.kind === "ZONE").address.label, "ALM-01-001-00-00-0-0");
    assert.equal(edited.warehouse.version, 2);
    assert.deepEqual(await saveWarehouseSheet(database, context, createInput, options), original);
    const blocked = command({ ...body, rows: [{ ...createRow("ZONE"), identifier: "TRD" }] });
    await assert.rejects(() => saveWarehouseSheet(database, context, blocked, options), /WAREHOUSE_ROUTES_DISABLED/);
    assert.deepEqual((await listWarehouseSheets(database, context, options)).warehouses, [edited.warehouse]);
    await assertSchema39(tx);
  });
});
