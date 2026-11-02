import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { listWarehouseSheets, saveWarehouseSheet } from "../api/_lib/warehouseSheetDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

// The schema41-generated client must keep20D available while locality_number
// does not exist. Ordinary tests roll back; an explicit synthetic evidence path
// also records one durable40 receipt for a fresh post41 replay verification.
const pg17 = process.env.V17_WAREHOUSE_CONFIGURATION_LOCAL_COMPAT === "PG17";
const target = pg17 ? null : validateV17ServicesTestUrl(process.env.DATABASE_URL);
if (!pg17) assert.equal(target.canonicalCi, true, "WAREHOUSE_LOCALITIES_LEGACY_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = pg17 ? (await createWarehouseConfigurationPg17LocalPrisma(process.env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL)).prisma : new PrismaClient({ datasourceUrl: target.raw });
const id = crypto.randomUUID().slice(0, 8);
const permissions = ["inventory:stock:view", "inventory:catalog:manage"];
const context = { tenantId: `tenant-localities-legacy-${id}`, membershipId: `member-localities-legacy-${id}`, userId: `user-localities-legacy-${id}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] };
const options = { routesEnabled: true, localitiesEnabled: false };
function command(body) { const requestId = crypto.randomUUID(); return { requestId, payloadHash: canonicalPayloadHash({ operation: "WAREHOUSE_SHEET_SAVE", requestId, ...body }), ...body }; }
const createRow = (kind, parentRowId = null) => ({ action: "CREATE", rowId: crypto.randomUUID(), parentRowId, parentLocationRef: null, kind, name: kind, areaUseRef: null });
async function assertSchema40(database = prisma) {
  const [row] = await database.$queryRawUnsafe(`SELECT
    (SELECT COUNT(*)::integer FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS count,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='warehouse_sheet_profiles' AND column_name='locality_number') AS locality_number`);
  assert.equal(row.count, 40); assert.equal(row.locality_number, false);
}
const fixtureModels = ["user", "tenant", "tenantMembership", "materialWarehouse", "materialLocation", "warehouseSheetProfile", "warehouseLocationAddress", "warehouseLocationConfiguration", "warehouseLocationPolicyEpoch", "materialInventoryCommand", "commercialAuditLog"];
async function globalCounts() {
  return Object.fromEntries(await Promise.all(fixtureModels.map(async (model) => [model, await prisma[model].count()])));
}
async function withRolledBackFixture(run) {
  const initialCounts = await globalCounts();
  const rollback = new Error("WAREHOUSE_LOCALITIES_LEGACY_EXPECTED_ROLLBACK");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Synthetic schema40 compatibility" } });
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
    assert.deepEqual(await globalCounts(), initialCounts, "Schema40 compatibility fixtures must leave every touched table's row count unchanged");
    await assertSchema40();
  }
}
async function createLegacyWorksheet(database) {
  const zone = { ...createRow("ZONE"), identifier: "GM1" };
  const aisle = { ...createRow("AISLE", zone.rowId), identifier: "01" };
  const rack = { ...createRow("RACK", aisle.rowId), identifier: "AB" };
  const level = { ...createRow("LEVEL", rack.rowId), identifier: "3" };
  const createInput = command({ warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0, name: "Legacy worksheet", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [level, rack, aisle, zone] });
  return { original: await saveWarehouseSheet(database, context, createInput, options), createInput };
}
before(async () => {
  if (!pg17) await verifyV17ServicesLocalDatabase(prisma, target);
  assert.ok(Prisma.dmmf.datamodel.models.find((model) => model.name === "WarehouseSheetProfile").fields.some((field) => field.name === "localityNumber"), "Test requires schema41-generated client");
  await assertSchema40();
});
after(async () => { await prisma.$disconnect(); });

test("schema41 client reads, creates and replays a full20D worksheet without locality_number", async () => {
  await withRolledBackFixture(async (database) => {
    assert.deepEqual(await listWarehouseSheets(database, context, options), { warehouses: [] });
    const { original, createInput } = await createLegacyWorksheet(database);
    assert.equal(original.warehouse.locations.find((row) => row.kind === "LEVEL").address.label, "ALM-01-GM1-01-AB-3-0");
    assert.equal(Object.hasOwn(original.warehouse, "localityNumber"), false);
    assert.ok(original.warehouse.locations.every((row) => !row.address || !Object.hasOwn(row.address, "displayLabel")));
    assert.deepEqual((await listWarehouseSheets(database, context, options)).warehouses, [original.warehouse]);
    assert.deepEqual(await saveWarehouseSheet(database, context, createInput, options), original);
  });
});
test("schema40 edit keeps20D active, rejects20E fields and preserves the original receipt", async () => {
  await withRolledBackFixture(async (database, tx) => {
    const { original, createInput } = await createLegacyWorksheet(database);
    const previous = original.warehouse;
    const body = { warehouseRef: previous.warehouseRef, expectedWarehouseVersion: previous.version, expectedProfileVersion: previous.profileVersion, name: "Legacy edited", managerMembershipRef: null, rootAreaUseRef: null, expectedRootConfigurationVersion: 0, rows: [{ ...createRow("ZONE"), identifier: "TRD" }] };
    const edited = await saveWarehouseSheet(database, context, command(body), options);
    assert.equal(edited.warehouse.locations.find((row) => row.kind === "ZONE" && row.name === "ZONE" && row.address.zoneCode === "TRD").address.label, "ALM-01-TRD-00-00-0-0");
    assert.equal(edited.warehouse.version, 2);
    assert.deepEqual(await saveWarehouseSheet(database, context, createInput, options), original);
    for (const localityNumber of [1, null]) await assert.rejects(() => saveWarehouseSheet(database, context, command({ ...body, localityNumber }), options), /WAREHOUSE_LOCALITIES_DISABLED/);
    assert.deepEqual((await listWarehouseSheets(database, context, options)).warehouses, [edited.warehouse]);
    await assertSchema40(tx);
  });
});
test("optional synthetic checkpoint commits an exact40 receipt for post41 replay", { skip: !process.env.V17_WAREHOUSE_LOCALITIES_LEGACY_EVIDENCE_PATH }, async () => {
  await prisma.tenant.create({ data: { id: context.tenantId, code: context.tenantId.toUpperCase(), name: "Synthetic migration40 checkpoint" } });
  await prisma.user.create({ data: { id: context.userId, code: context.userId, name: "Synthetic actor", email: `${context.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-02", passwordHash: "synthetic-not-authenticatable" } });
  await prisma.tenantMembership.create({ data: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: "A", status: "ACTIVE", grantedPermissions: permissions } });
  const { original, createInput } = await createLegacyWorksheet(prisma);
  await writeFile(process.env.V17_WAREHOUSE_LOCALITIES_LEGACY_EVIDENCE_PATH, JSON.stringify({ synthetic: true, fromMigration: 40, context, createInput, original }), { flag: "wx", mode: 0o600 });
  await assertSchema40();
});
