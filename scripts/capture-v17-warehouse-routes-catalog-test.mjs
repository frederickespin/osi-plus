import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  WAREHOUSE_ROUTES_MIGRATION, WAREHOUSE_ROUTES_MIGRATION_CHECKSUM,
  partitionWarehouseRoutesCatalog, sortWarehouseRoutesCatalogRows,
  validateWarehouseRoutesCatalogChange, validateWarehouseRoutesCatalogTransition,
  collectWarehouseRoutesCatalogEvidence,
} from "./capture-v17-warehouse-routes-catalog.mjs";
import { CATALOG_SQL, SQL_ONLY_SQL, summarizeCrm01b1Catalog } from "./crm-01b1-sql-drift-baseline.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const measuredFixture = (major) => JSON.parse(readFileSync(new URL(
  `../tests/crm-01b1/warehouse-routes-20d${major === 17 ? "-pg17" : ""}-catalog.json`, import.meta.url), "utf8"));
const updateCatalog = (evidence) => {
  evidence.catalogRows = sortWarehouseRoutesCatalogRows(evidence.catalogRows);
  evidence.catalog = summarizeCrm01b1Catalog(evidence.catalogRows);
};

// Small synthetic preserved set exercises the comparator without committing
// two complete database dumps. Changed rows and SQL pins come from the actual
// independently captured fixtures; these synthetic catalogs are never baselines.
function syntheticTransition(major) {
  const fixture = measuredFixture(major);
  const base = {
    evidenceOnly: true, baselineAccepted: false,
    provenance: { kind: "LOCAL_DISPOSABLE_POSTGRESQL", catalogQuerySha256: sha(CATALOG_SQL),
      sqlOnlyQuerySha256: sha(SQL_ONLY_SQL), searchPath: "osi", readOnly: true },
    server: fixture.server, target: fixture.target,
    extensions: [], extensionMembers: { count: 0, sha256: sha("[]") }, extensionMemberRows: [],
    dataFingerprint: [{ table: "warehouse_location_addresses", rows: 2, sha256: "a".repeat(64) }],
  };
  const preserved = { kind: "column", schema_name: "osi", table_name: "warehouse_location_addresses",
    object_name: "label", definition: "5|character varying(32)|t|||" };
  const evidence = (phase) => {
    const names = Object.keys(fixture.migrationChecksums).slice(0, phase === "before39" ? 39 : 40);
    const rows = names.map((migration_name) => ({ migration_name, checksum: fixture.migrationChecksums[migration_name],
      finished_at: "2026-11-02T00:00:00.000Z", rolled_back_at: null, applied_steps_count: 1 }));
    const result = { ...structuredClone(base), phase,
      migration: { name: WAREHOUSE_ROUTES_MIGRATION, ...(phase === "after40" ? { sha256: WAREHOUSE_ROUTES_MIGRATION_CHECKSUM } : {}) },
      migrationChecksums: Object.fromEntries(names.map((name) => [name, fixture.migrationChecksums[name]])),
      history: { complete: names.length, migrations: names, rows },
      catalogRows: [preserved, ...(phase === "before39" ? fixture.delta.replacedBeforeRows
        : [...fixture.delta.addedRows, ...fixture.delta.replacedAfterRows])],
      sqlOnly: { counts: structuredClone(fixture.sqlOnlyCounts), unmapped: [] },
      zoneCodeNonNullRows: phase === "after40" ? 0 : null,
    };
    updateCatalog(result);
    return result;
  };
  const before = evidence("before39"), after = evidence("after40");
  fixture.previousCatalog = before.catalog;
  fixture.catalog = after.catalog;
  return { before, after, fixture };
}

for (const major of [17, 18]) {
  test(`PG${major} fixture is independently measured, replaces exactly one guard and adds two objects`, () => {
    const fixture = measuredFixture(major);
    assert.equal(fixture.provenance.kind, "LOCAL_DISPOSABLE_POSTGRESQL");
    assert.equal(Math.floor(Number(fixture.server.version_number) / 10000), major);
    assert.equal(fixture.catalog.count, fixture.previousCatalog.count + 2);
    assert.equal(fixture.provenance.previousObjectsUnchangedExceptReviewedReplacement, true);
    assert.notEqual(fixture.provenance.previousObjectsUnchangedAfterMigration, true);
    assert.equal(fixture.dataPreservation.beforeSha256, fixture.dataPreservation.afterSha256);
    assert.ok(fixture.dataPreservation.existingAddresses > 0);
    assert.equal(fixture.dataPreservation.zoneCodeNonNullRows, 0);
    assert.deepEqual(partitionWarehouseRoutesCatalog(fixture.delta.addedRows), {
      preservedRows: [], addedRows: fixture.delta.addedRows, replacedRows: [],
    });
    for (const prefix of ["added", "replacedBefore", "replacedAfter"]) {
      assert.deepEqual(summarizeCrm01b1Catalog(fixture.delta[`${prefix}Rows`]), fixture.delta[`${prefix}Catalog`]);
    }
    const { before, after, fixture: syntheticFixture } = syntheticTransition(major);
    assert.equal(validateWarehouseRoutesCatalogTransition(before, after, syntheticFixture, major).approvedEngineSpecificDeltaMatched, true);
  });

  const catalogMutations = [
    ["changes preserved column", (e) => { e.catalogRows.find((r) => r.object_name === "label").definition += " changed"; }],
    ["removes preserved column", (e) => { e.catalogRows = e.catalogRows.filter((r) => r.object_name !== "label"); }],
    ["adds unreviewed column", (e) => { e.catalogRows.push({ ...e.catalogRows.find((r) => r.object_name === "label"), object_name: "unexpected" }); }],
    ["omits zone column", (e) => { e.catalogRows = e.catalogRows.filter((r) => r.object_name !== "zone_code"); }],
    ["omits new CHECK", (e) => { e.catalogRows = e.catalogRows.filter((r) => r.kind !== "check"); }],
    ["moves new column to another schema", (e) => { e.catalogRows.find((r) => r.object_name === "zone_code").schema_name = "public"; }],
    ["duplicates replaced function", (e) => { e.catalogRows.push({ ...e.catalogRows.find((r) => r.kind === "function") }); }],
  ];
  for (const [label, mutate] of catalogMutations) {
    test(`PG${major} transition rejects ${label}, even with recomputed fingerprints`, () => {
      const { before, after } = syntheticTransition(major);
      mutate(after);
      updateCatalog(after);
      assert.throws(() => validateWarehouseRoutesCatalogChange(before, after, major), /WAREHOUSE_ROUTES_CATALOG/);
    });
  }

  for (const [label, mutate] of [
    ["historical data mutation", (e) => { e.dataFingerprint[0].sha256 = "b".repeat(64); }],
    ["backfilled zone_code", (e) => { e.zoneCodeNonNullRows = 1; }],
    ["historical ledger mutation", (e) => { e.history.rows[0].finished_at = "2026-11-01T00:00:00.000Z"; }],
    ["historical SQL checksum mutation", (e) => { const name = e.history.rows[0].migration_name; e.history.rows[0].checksum = "b".repeat(64); e.migrationChecksums[name] = "b".repeat(64); }],
    ["extension mutation", (e) => { e.extensions.push({ extension_name: "unexpected", version: "1.0", schema_name: "osi" }); }],
    ["accepted-baseline marker", (e) => { e.baselineAccepted = true; }],
    ["unknown migration SQL", (e) => { e.migration.sha256 = "b".repeat(64); }],
    ["non-read-only snapshot", (e) => { e.provenance.readOnly = false; }],
    ["changed target", (e) => { e.target.database = "unexpected"; }],
  ]) {
    test(`PG${major} transition rejects ${label}`, () => {
      const { before, after } = syntheticTransition(major);
      mutate(after);
      assert.throws(() => validateWarehouseRoutesCatalogChange(before, after, major), /WAREHOUSE_ROUTES_CATALOG/);
    });
  }
  test(`PG${major} transition requires replacement and matches the measured function body`, () => {
    const { before, after, fixture } = syntheticTransition(major);
    after.catalogRows = after.catalogRows.map((r) => r.kind === "function" ? fixture.delta.replacedBeforeRows[0] : r);
    updateCatalog(after);
    assert.throws(() => validateWarehouseRoutesCatalogChange(before, after, major), /was not replaced/);
    const changed = syntheticTransition(major);
    changed.after.catalogRows.find((r) => r.kind === "function").definition += " altered";
    updateCatalog(changed.after);
    changed.fixture.catalog = changed.after.catalog;
    assert.throws(() => validateWarehouseRoutesCatalogTransition(changed.before, changed.after, changed.fixture, major), /replacedAfter/);
  });
  test(`PG${major} rejects engine substitution and a blanket claim that all old objects are unchanged`, () => {
    const { before, after, fixture } = syntheticTransition(major);
    assert.throws(() => validateWarehouseRoutesCatalogTransition(before, after, measuredFixture(major === 17 ? 18 : 17), major), /fixture provenance/);
    fixture.provenance.previousObjectsUnchangedAfterMigration = true;
    assert.throws(() => validateWarehouseRoutesCatalogTransition(before, after, fixture, major), /fixture provenance/);
  });
}

test("collector requires explicit phase, server and canonical local mode before reading or connecting", async () => {
  await assert.rejects(() => collectWarehouseRoutesCatalogEvidence({ phase: "wrong", root: "/nonexistent", env: {} }), /phase must/);
  await assert.rejects(() => collectWarehouseRoutesCatalogEvidence({ phase: "before39", serverMajor: 16, root: "/nonexistent", env: {} }), /server profile/);
  await assert.rejects(() => collectWarehouseRoutesCatalogEvidence({ phase: "before39", root: "/nonexistent", env: {} }), /disposable canonical CI/);
});
