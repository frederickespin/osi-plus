import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CANONICAL_MIGRATIONS } from "./canonical-migrations.mjs";
import { WAREHOUSE_LOCALITIES_MIGRATION, WAREHOUSE_LOCALITIES_MIGRATION_CHECKSUM } from "../shared/warehouseLocalitiesMigration.js";
import { partitionWarehouseLocalitiesCatalog, sortWarehouseLocalitiesCatalogRows, validateWarehouseLocalitiesCatalogChange, validateWarehouseLocalitiesCatalogTransition, collectWarehouseLocalitiesCatalogEvidence } from "./capture-v17-warehouse-localities-catalog.mjs";
import { CATALOG_SQL, SQL_ONLY_SQL, summarizeCrm01b1Catalog } from "./crm-01b1-sql-drift-baseline.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const measured = (major) => JSON.parse(readFileSync(new URL(`../tests/crm-01b1/warehouse-localities-20e${major === 17 ? "-pg17" : ""}-catalog.json`, import.meta.url), "utf8"));
const checksums = Object.fromEntries(CANONICAL_MIGRATIONS.map((name) => [name, sha(readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url)))]));
function updateCatalog(value) { value.catalogRows = sortWarehouseLocalitiesCatalogRows(value.catalogRows); value.catalog = summarizeCrm01b1Catalog(value.catalogRows); }
// Synthetic preserved rows exercise negative controls, never an accepted baseline.
// The actual two added object definitions come from each engine's measured fixture.
function transition(major) {
  const fixture = measured(major);
  const target = { database: major === 17 ? "osi_warehouse_17_compat" : "osi_db01n_ci", schema: "osi", address: "127.0.0.1", port: major === 17 ? 55434 : 55432, ...(major === 17 ? { serverVersion: 170011 } : {}) };
  const preserved = { kind: "column", schema_name: "osi", table_name: "warehouse_sheet_profiles", object_name: "warehouse_number", definition: "unchanged synthetic column" };
  const evidence = (phase) => {
    const names = CANONICAL_MIGRATIONS.slice(0, phase === "before40" ? 40 : 41);
    const value = { evidenceOnly: true, baselineAccepted: false, phase,
      provenance: { kind: "LOCAL_DISPOSABLE_POSTGRESQL", catalogQuerySha256: sha(CATALOG_SQL), sqlOnlyQuerySha256: sha(SQL_ONLY_SQL), searchPath: "osi", readOnly: true },
      target: structuredClone(target), server: structuredClone(fixture.provenance.server),
      migration: { name: WAREHOUSE_LOCALITIES_MIGRATION, sha256: WAREHOUSE_LOCALITIES_MIGRATION_CHECKSUM },
      migrationChecksums: Object.fromEntries(names.map((name) => [name, checksums[name]])),
      history: { complete: names.length, migrations: names, rows: names.map((migration_name) => ({ migration_name, checksum: checksums[migration_name], finished_at: "2026-11-02T00:00:00Z", rolled_back_at: null, applied_steps_count: 1 })) },
      catalogRows: [structuredClone(preserved), ...(phase === "after41" ? structuredClone(fixture.delta.addedRows) : [])],
      dataFingerprint: [{ table: "warehouse_sheet_profiles", rows: 2, sha256: "a".repeat(64) }],
      sqlOnly: { counts: structuredClone(fixture.sqlOnlyCounts), unmapped: [] },
      extensions: [], extensionMembers: { count: 0, sha256: sha("[]") }, extensionMemberRows: [],
      localityNumberNonNullRows: phase === "after41" ? 0 : null };
    updateCatalog(value); return value;
  };
  const before = evidence("before40"), after = evidence("after41");
  fixture.previousCatalog = before.catalog; fixture.catalog = after.catalog;
  return { before, after, fixture };
}
for (const major of [17, 18]) {
  test(`PG${major} fixture independently adds exactly the nullable locality column and CHECK`, () => {
    const fixture = measured(major);
    assert.equal(Math.floor(Number(fixture.provenance.server.version_number) / 10000), major);
    assert.equal(fixture.provenance.previousObjectsUnchangedAfterMigration, true);
    assert.equal(fixture.catalog.count, fixture.previousCatalog.count + 2);
    assert.deepEqual(partitionWarehouseLocalitiesCatalog(fixture.delta.addedRows), { preservedRows: [], addedRows: fixture.delta.addedRows });
    assert.deepEqual(summarizeCrm01b1Catalog(fixture.delta.addedRows), fixture.delta.addedCatalog);
    const scenario = transition(major);
    assert.equal(validateWarehouseLocalitiesCatalogTransition(scenario.before, scenario.after, scenario.fixture, major).approvedEngineSpecificDeltaMatched, true);
  });
  for (const [label, mutate] of [
    ["preserved object change", (e) => { e.catalogRows.find((r) => r.object_name === "warehouse_number").definition += " changed"; }],
    ["preserved object removal", (e) => { e.catalogRows = e.catalogRows.filter((r) => r.object_name !== "warehouse_number"); }],
    ["unreviewed column", (e) => { e.catalogRows.push({ ...e.catalogRows[0], object_name: "unexpected" }); }],
    ["missing locality column", (e) => { e.catalogRows = e.catalogRows.filter((r) => r.object_name !== "locality_number"); }],
    ["duplicate CHECK", (e) => { e.catalogRows.push(structuredClone(e.catalogRows.find((r) => r.kind === "check"))); }],
    ["other schema", (e) => { e.catalogRows.find((r) => r.object_name === "locality_number").schema_name = "public"; }],
    ["historical data mutation", (e) => { e.dataFingerprint[0].sha256 = "b".repeat(64); }],
    ["inferred locality backfill", (e) => { e.localityNumberNonNullRows = 1; }],
    ["historical ledger mutation", (e) => { e.history.rows[0].finished_at = "2026-11-01T00:00:00Z"; }],
    ["historical SQL mutation", (e) => { const name = e.history.rows[0].migration_name; e.history.rows[0].checksum = "b".repeat(64); e.migrationChecksums[name] = "b".repeat(64); }],
    ["extension mutation", (e) => { e.extensions.push({ name: "unexpected" }); }],
    ["accepted-baseline marker", (e) => { e.baselineAccepted = true; }],
    ["non-read-only snapshot", (e) => { e.provenance.readOnly = false; }],
    ["wrong target", (e) => { e.target.database = "unexpected"; }],
  ]) test(`PG${major} rejects ${label} even when catalog hashes are recalculated`, () => {
    const { before, after } = transition(major); mutate(after); updateCatalog(after);
    assert.throws(() => validateWarehouseLocalitiesCatalogChange(before, after, major), /WAREHOUSE_LOCALITIES_CATALOG/);
  });
  test(`PG${major} rejects changed added definition and an engine-substituted fixture`, () => {
    const { before, after, fixture } = transition(major);
    after.catalogRows.find((r) => r.object_name === "locality_number").definition += " changed";
    updateCatalog(after); fixture.catalog = after.catalog;
    assert.throws(() => validateWarehouseLocalitiesCatalogTransition(before, after, fixture, major), /added objects differ/);
    assert.throws(() => validateWarehouseLocalitiesCatalogTransition(before, after, measured(major === 17 ? 18 : 17), major), /fixture provenance/);
  });
}
test("collector rejects invalid mode and nonlocal profile before accessing sources or connecting", async () => {
  await assert.rejects(() => collectWarehouseLocalitiesCatalogEvidence({ phase: "wrong", root: "/nonexistent", env: {} }), /invalid phase/);
  await assert.rejects(() => collectWarehouseLocalitiesCatalogEvidence({ phase: "before40", serverMajor: 16, root: "/nonexistent", env: {} }), /invalid phase/);
  await assert.rejects(() => collectWarehouseLocalitiesCatalogEvidence({ phase: "before40", root: "/nonexistent", env: {} }), /disposable canonical CI/);
});
