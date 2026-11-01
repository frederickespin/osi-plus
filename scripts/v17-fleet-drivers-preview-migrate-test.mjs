import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CANONICAL_MIGRATIONS } from "./canonical-migrations.mjs";
import { test } from "node:test";
import { ADMIN_FLEET_BATCH } from "../shared/adminFleet.js";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH } from "../shared/adminMembershipPreview.js";
import { FLEET_DRIVERS_MIGRATION, FLEET_DRIVERS_MIGRATION_CHECKSUM } from "../shared/adminFleetDrivers.js";
import { FLEET_PREVIEW_MIGRATION_OPERATION, RETAINED_PREVIEW_EXTENSION, previewMigrationOperation, previewMigrationManifest, validatePreviewDriverHistory, validatePreviewCatalogPin, validatePreviewDatabaseIdentity, selectPreviewDriverCatalogProfile, normalizePreviewSnapshotSchema, runFleetDriverPreviewMigration } from "./v17-fleet-drivers-preview-migrate.mjs";

const commit = "a".repeat(40);
const historicalManifest = () => Object.fromEntries(CANONICAL_MIGRATIONS.slice(0, 37).map((name) => [name, createHash("sha256").update(readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url))).digest("hex")]));
const preview = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview", VERCEL_GIT_COMMIT_SHA: commit,
  [FLEET_PREVIEW_MIGRATION_OPERATION]: `CHECK:${commit}`,
  ADMIN_FLEET_MODE: "PREVIEW_REHEARSAL", ADMIN_FLEET_BATCH, ADMIN_TENANT_MEMBERSHIP_MODE: "PREVIEW_REHEARSAL", ADMIN_MEMBERSHIP_PREVIEW_BATCH,
  ADMIN_MEMBERSHIP_PREVIEW_DATABASE: "v17_consolidated_preview_10b", ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: "br-mute-credit-ahxnvfx0", ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: "V17-CONSOLIDATED-PREVIEW-10B",
  DATABASE_URL: "postgresql://synthetic-pooler.example.invalid/v17_consolidated_preview_10b?schema=osi",
  DIRECT_URL: "postgresql://synthetic.example.invalid/v17_consolidated_preview_10b?schema=osi",
  MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false",
};

test("migration build hook defaults to no connection and no operation", async () => {
  for (const env of [{}, { VERCEL_ENV: "production" }, { ...preview, [FLEET_PREVIEW_MIGRATION_OPERATION]: "DISABLED" }]) {
    assert.equal(previewMigrationOperation(env), null);
    assert.equal(await runFleetDriverPreviewMigration({ env, root: "/nonexistent-unread-path" }), null);
  }
});
test("only explicit CHECK/APPLY of the exact consolidated Preview commit can run", () => {
  assert.deepEqual(previewMigrationOperation(preview), { mode: "CHECK", commit });
  assert.deepEqual(previewMigrationOperation({ ...preview, [FLEET_PREVIEW_MIGRATION_OPERATION]: `APPLY:${commit}:${"b".repeat(64)}:10569` }), { mode: "APPLY", commit, previousCatalog: { sha256: "b".repeat(64), count: 10569 } });
  for (const override of [
    { VERCEL: "0" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "development" },
    { VERCEL_GIT_COMMIT_REF: "main" }, { VERCEL_GIT_COMMIT_REF: "feature/other" }, { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
    { [FLEET_PREVIEW_MIGRATION_OPERATION]: "APPLY" }, { [FLEET_PREVIEW_MIGRATION_OPERATION]: `APPLY:${commit}` },
    { [FLEET_PREVIEW_MIGRATION_OPERATION]: `CHECK:${commit}:${"b".repeat(64)}:10569` },
    { [FLEET_PREVIEW_MIGRATION_OPERATION]: `APPLY:${commit};echo invalid` },
    { ADMIN_FLEET_MODE: "DISABLED" }, { ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: "wrong" },
    { PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "true" },
    { ADMIN_FLEET_DRIVERS_MODE: "PREVIEW_REHEARSAL" }, { VITE_ADMIN_FLEET_DRIVERS_MODE: "PREVIEW_REHEARSAL" },
    { DIRECT_URL: "postgresql://example.invalid/v17_consolidated_preview_10b?schema=osi" },
    { DIRECT_URL: "postgresql://synthetic-pooler.example.invalid/v17_consolidated_preview_10b?schema=osi" },
    { DIRECT_URL: "postgresql://synthetic.example.invalid/production?schema=osi" },
    { DIRECT_URL: "postgresql://synthetic.example.invalid/v17_consolidated_preview_10b?schema=osi&schema=osi" },
    { DIRECT_URL: "postgresql://synthetic.example.invalid/v17_consolidated_preview_10b?schema=wrong_schema" },
    { DIRECT_URL: "postgresql://synthetic.example.invalid:55432/v17_consolidated_preview_10b?schema=osi" },
  ]) assert.throws(() => previewMigrationOperation({ ...preview, ...override }));
});
test("APPLY and applied replays require the catalog independently observed in CHECK", () => {
  const previousCatalog = { sha256: "b".repeat(64), count: 10569 };
  const operation = { mode: "APPLY", commit, previousCatalog };
  validatePreviewCatalogPin(operation, previousCatalog);
  assert.throws(() => validatePreviewCatalogPin(operation, { ...previousCatalog, count: 10570 }));
  assert.throws(() => validatePreviewCatalogPin(operation, { ...previousCatalog, sha256: "c".repeat(64) }));
  assert.throws(() => validatePreviewCatalogPin({ mode: "APPLY", commit }, previousCatalog));
});
test("database, Neon branch and PostgreSQL version retain separate strict identity errors", () => {
  const identity = { database: "v17_consolidated_preview_10b", branch: "br-mute-credit-ahxnvfx0", server_version_num: "180006" };
  validatePreviewDatabaseIdentity(identity);
  validatePreviewDatabaseIdentity({ ...identity, server_version_num: "170011" });
  for (const [override, code] of [
    [{ database: "unexpected_database" }, "DATABASE_NAME_INVALID"],
    [{ database: null }, "DATABASE_NAME_INVALID"],
    [{ branch: "br-unexpected" }, "NEON_BRANCH_INVALID"],
    [{ branch: null }, "NEON_BRANCH_INVALID"],
    [{ server_version_num: "160011" }, "SERVER_VERSION_INVALID"],
    [{ server_version_num: "190000" }, "SERVER_VERSION_INVALID"],
    [{ server_version_num: null }, "SERVER_VERSION_INVALID"],
    [{ server_version_num: "170011.5" }, "SERVER_VERSION_INVALID"],
    [{ server_version_num: "unknown" }, "SERVER_VERSION_INVALID"],
  ]) assert.throws(() => validatePreviewDatabaseIdentity({ ...identity, ...override }), { message: `FLEET_PREVIEW_MIGRATION_${code}` });
});
const catalogFixtures = () => ({
  17: JSON.parse(readFileSync(new URL("../tests/crm-01b1/fleet-drivers-19f-pg17-catalog.json", import.meta.url), "utf8")),
  18: JSON.parse(readFileSync(new URL("../tests/crm-01b1/fleet-drivers-19f-catalog.json", import.meta.url), "utf8")),
});
test("Preview selects independently measured PG17 and PG18 deltas without a fallback", () => {
  const fixtures = catalogFixtures();
  for (const [version, serverMajor] of [["170011", 17], ["180006", 18]]) {
    assert.deepEqual(selectPreviewDriverCatalogProfile(version, fixtures), { serverMajor, expectedDelta: fixtures[serverMajor].delta.catalog });
  }
  assert.notEqual(fixtures[17].delta.catalog.sha256, fixtures[18].delta.catalog.sha256);
  assert.throws(() => selectPreviewDriverCatalogProfile("170011", { 18: fixtures[18] }), { message: "FLEET_PREVIEW_MIGRATION_CATALOG_SOURCE_INVALID" });
  assert.throws(() => selectPreviewDriverCatalogProfile("170011", { 17: fixtures[18] }), { message: "FLEET_PREVIEW_MIGRATION_CATALOG_SOURCE_INVALID" });
  for (const version of ["160011", "190000", null]) {
    assert.throws(() => selectPreviewDriverCatalogProfile(version, fixtures), { message: "FLEET_PREVIEW_MIGRATION_SERVER_VERSION_INVALID" });
  }
});
test("catalog profiles reject altered provenance, SQL sources, measured rows and hashes", () => {
  for (const serverMajor of [17, 18]) {
    for (const alter of [
      (fixture) => { fixture.migration.sha256 = "0".repeat(64); },
      (fixture) => { fixture.provenance.kind = "UNREVIEWED"; },
      (fixture) => { fixture.provenance.server.version_number = "160011"; },
      (fixture) => { fixture.provenance.catalogQuerySha256 = "0".repeat(64); },
      (fixture) => { fixture.provenance.previousObjectsUnchangedAfterMigration = false; },
      (fixture) => { fixture.delta.rows.pop(); },
      (fixture) => { fixture.delta.rows[0].schema_name = "wrong_schema"; },
      (fixture) => { fixture.delta.rows[0].definition += " altered"; },
      (fixture) => { fixture.delta.catalog.count += 1; },
      (fixture) => { fixture.delta.catalog.sha256 = "0".repeat(64); },
    ]) {
      const fixtures = catalogFixtures();
      alter(fixtures[serverMajor]);
      assert.throws(() => selectPreviewDriverCatalogProfile(String(serverMajor * 10000 + 11), fixtures), { message: "FLEET_PREVIEW_MIGRATION_CATALOG_SOURCE_INVALID" });
    }
  }
});
function schemaTransaction(initial, selected) {
  const statements = [];
  let reads = 0;
  return { statements, tx: {
    async $queryRawUnsafe(sql) { statements.push(sql); return [reads++ === 0 ? initial : selected]; },
    async $executeRawUnsafe(sql) { statements.push(sql); return 0; },
  } };
}
test("snapshot normalizes only its local read-only path and reports a safe boolean", async () => {
  for (const path_matches of [false, true]) {
    const { tx, statements } = schemaTransaction({ read_only: true, schema_exists: true, path_matches }, { schema: "osi", schema_exists: true, ledger_matches: true });
    assert.deepEqual(await normalizePreviewSnapshotSchema(tx), { searchPathNormalized: !path_matches });
    assert.equal(statements.length, 3);
    assert.equal(statements[1], "SET LOCAL search_path = osi");
    assert.ok(statements[0].includes("transaction_read_only"));
    assert.ok(statements[2].includes("current_schema()"));
  }
});
test("snapshot rejects absent schema, non-read-only transactions and incorrect effective selection", async () => {
  for (const [initial, selected, code, executed] of [
    [{ read_only: false, schema_exists: true }, {}, "SNAPSHOT_NOT_READ_ONLY", false],
    [{ read_only: true, schema_exists: false }, {}, "SCHEMA_UNAVAILABLE", false],
    [{ read_only: true, schema_exists: true }, { schema: "public", schema_exists: true, ledger_matches: true }, "SCHEMA_SELECTION_INVALID", true],
    [{ read_only: true, schema_exists: true }, { schema: "osi", schema_exists: false, ledger_matches: true }, "SCHEMA_SELECTION_INVALID", true],
    [{ read_only: true, schema_exists: true }, { schema: "osi", schema_exists: true, ledger_matches: false }, "LEDGER_SCOPE_INVALID", true],
  ]) {
    const { tx, statements } = schemaTransaction(initial, selected);
    await assert.rejects(() => normalizePreviewSnapshotSchema(tx), { message: `FLEET_PREVIEW_MIGRATION_${code}` });
    assert.equal(statements.includes("SET LOCAL search_path = osi"), executed);
  }
});
test("historical19F hook rejects a source containing later migrations", () => {
  assert.throws(() => previewMigrationManifest(), /SOURCE_INVENTORY_INVALID/);
  const manifest = historicalManifest();
  assert.equal(Object.keys(manifest).length, 37);
  assert.equal(manifest[FLEET_DRIVERS_MIGRATION], FLEET_DRIVERS_MIGRATION_CHECKSUM);
  assert.ok(!Object.hasOwn(manifest, RETAINED_PREVIEW_EXTENSION.name));
});
test("Preview plan preserves the documented extension and permits only pending19F", () => {
  const manifest = historicalManifest();
  const row = (migration_name, checksum) => ({ migration_name, checksum, finished_at: new Date("2026-10-31T00:00:00Z"), rolled_back_at: null, applied_steps_count: 1 });
  const previous = Object.entries(manifest).filter(([name]) => name !== FLEET_DRIVERS_MIGRATION).map(([name, checksum]) => row(name, checksum));
  previous.push(row(RETAINED_PREVIEW_EXTENSION.name, RETAINED_PREVIEW_EXTENSION.checksum));
  assert.deepEqual(validatePreviewDriverHistory(previous, manifest), { applied: 37, pending: [FLEET_DRIVERS_MIGRATION], alreadyApplied: false });
  const complete = [...previous, row(FLEET_DRIVERS_MIGRATION, manifest[FLEET_DRIVERS_MIGRATION])];
  assert.deepEqual(validatePreviewDriverHistory(complete, manifest), { applied: 38, pending: [], alreadyApplied: true });
  for (const rows of [previous.slice(1), previous.slice(0, -1), [...previous, previous[0]],
    [...previous, row("unreviewed_extension", "f".repeat(64))],
    previous.map((entry, index) => index ? entry : { ...entry, checksum: "f".repeat(64) }),
    previous.map((entry, index) => index ? entry : { ...entry, finished_at: null }),
    previous.map((entry, index) => index ? entry : { ...entry, rolled_back_at: new Date() }),
    previous.map((entry, index) => index ? entry : { ...entry, applied_steps_count: 0 }),
  ]) assert.throws(() => validatePreviewDriverHistory(rows, manifest));
});
