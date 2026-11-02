import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CANONICAL_MIGRATIONS, validateAppliedMigrationHistory, validateMigrationFiles, validateMigrationInventory, validateMigrationPaths } from "./canonical-migrations.mjs";

const results = [];
const first = CANONICAL_MIGRATIONS[0];
const names = [...CANONICAL_MIGRATIONS];
const paths = names.map((name) => `prisma/migrations/${name}/migration.sql`);
function scenario(name, verify) {
  const root = mkdtempSync(join(tmpdir(), "canonical-migration-inventory-"));
  try {
    mkdirSync(join(root, "prisma"));
    cpSync(resolve("prisma/migrations"), join(root, "prisma/migrations"), { recursive: true });
    verify(root);
    results.push({ name, passed: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function reject(name, mutate, pattern = /CANONICAL_MIGRATIONS/) {
  scenario(name, (root) => {
    mutate(root);
    assert.throws(() => validateMigrationFiles(root), pattern);
  });
}

scenario("closed inventory contains the40 named canonical migrations", (root) => {
  assert.equal(names.length, 40);
  assert.equal(names.at(-1), "20261102010000_v17_warehouse_routes");
  assert.deepEqual(validateMigrationFiles(root), names);
  assert.deepEqual(validateMigrationPaths(root, paths), paths);
});
scenario("out-of-order file inventory is normalized without widening it", (root) => {
  assert.deepEqual(validateMigrationInventory(root, [...names].reverse()), names);
});
scenario("missing path rejected even when SQL remains on disk", (root) => {
  assert.throws(() => validateMigrationPaths(root, paths.slice(1)), /40 migraciones canónicas/);
});
scenario("duplicate and missing name rejected at unchanged cardinality", (root) => {
  assert.throws(() => validateMigrationInventory(root, [names[1], ...names.slice(1)]), /40 migraciones canónicas/);
});
scenario("unknown replacement rejected at unchanged cardinality", (root) => {
  assert.throws(() => validateMigrationInventory(root, ["20261001010000_unknown", ...names.slice(1)]), /40 migraciones canónicas/);
});
scenario("additional path rejected without requiring it on disk", (root) => {
  assert.throws(() => validateMigrationPaths(root, [...paths, "prisma/migrations/20261001010000_unknown/migration.sql"]), /40 migraciones canónicas/);
});
scenario("noncanonical path rejected", (root) => {
  assert.throws(() => validateMigrationPaths(root, paths.map((path) => path.replace("prisma/migrations/", "prisma/migrations/../"))), /rutas de migración inválido/);
});
reject("missing directory rejected", (root) => rmSync(join(root, "prisma/migrations", first), { recursive: true }));
reject("renamed directory rejected at unchanged cardinality", (root) => {
  renameSync(join(root, "prisma/migrations", first), join(root, "prisma/migrations/20261001010000_unknown"));
});
reject("additional migration directory rejected", (root) => mkdirSync(join(root, "prisma/migrations/20261001010000_unknown")));
reject("missing SQL rejected", (root) => rmSync(join(root, "prisma/migrations", first, "migration.sql")));
reject("empty SQL rejected", (root) => writeFileSync(join(root, "prisma/migrations", first, "migration.sql"), ""));
reject("whitespace-only SQL rejected", (root) => writeFileSync(join(root, "prisma/migrations", first, "migration.sql"), " \n\t"));
reject("SQL with NUL rejected", (root) => writeFileSync(join(root, "prisma/migrations", first, "migration.sql"), Buffer.from([83, 0, 81, 76])));
reject("malformed UTF-8 rejected", (root) => writeFileSync(join(root, "prisma/migrations", first, "migration.sql"), Buffer.from([0xff, 0xfe])), /encoded data was not valid/);
reject("extra migration payload rejected", (root) => writeFileSync(join(root, "prisma/migrations", first, "extra.sql"), "SELECT 1;"));
reject("directory cannot masquerade as migration.sql", (root) => {
  const path = join(root, "prisma/migrations", first, "migration.sql");
  rmSync(path);
  mkdirSync(path);
});
reject("symlink cannot masquerade as migration.sql", (root) => {
  const path = join(root, "prisma/migrations", first, "migration.sql");
  const outside = join(root, "outside.sql");
  writeFileSync(outside, "SELECT 1;");
  rmSync(path);
  symlinkSync(outside, path);
});
reject("symlink cannot masquerade as canonical migration directory", (root) => {
  const path = join(root, "prisma/migrations", first);
  const outside = join(root, "outside-migration");
  renameSync(path, outside);
  symlinkSync(outside, path, "dir");
});
reject("unknown root-level file rejected", (root) => writeFileSync(join(root, "prisma/migrations/unknown.sql"), "SELECT 1;"));

const history = names.map((migration_name) => ({
  migration_name, finished_at: new Date("2026-10-29T00:00:00Z"), rolled_back_at: null, applied_steps_count: 1,
}));
function historyScenario(name, verify) {
  verify();
  results.push({ name, passed: true });
}
historyScenario("applied canonical history matches every approved name", () => {
  assert.deepEqual(validateAppliedMigrationHistory(history), names);
});
for (const throughMigration of ["20260831010000_v17_crm_icp_foundation", "20260909010000_v17_costing", "20260911010000_v17_scheduling_desktop_convergence", "20260916010000_v17_client_temporary_portal", "20261030010000_v17_user_identity_enrollment", "20261031010000_v17_fleet_driver_authority", "20261101010000_v17_warehouse_configuration", "20261101020000_v17_warehouse_sheet"]) {
  const count = names.indexOf(throughMigration) + 1;
  historyScenario(`isolated named checkpoint remains exact: ${throughMigration}`, () => {
    assert.deepEqual(validateAppliedMigrationHistory(history.slice(0, count), { throughMigration }), names.slice(0, count));
    assert.throws(() => validateAppliedMigrationHistory(history.slice(0, count)), /historial aplicado no coincide/);
    assert.throws(() => validateAppliedMigrationHistory(history, { throughMigration }), /historial aplicado no coincide/);
  });
}
for (const [name, rows] of [
  ["missing applied migration rejected", history.slice(1)],
  ["unknown additional applied migration rejected", [...history, { ...history[0], migration_name: "20261001010000_unknown" }]],
  ["same-count applied migration replacement rejected", [{ ...history[0], migration_name: "20261001010000_unknown" }, ...history.slice(1)]],
  ["duplicate applied migration rejected", [history[1], ...history.slice(1)]],
  ["unfinished applied migration rejected", [{ ...history[0], finished_at: null }, ...history.slice(1)]],
  ["rolled-back applied migration rejected", [{ ...history[0], rolled_back_at: new Date() }, ...history.slice(1)]],
  ["invalid applied step count rejected", [{ ...history[0], applied_steps_count: 0 }, ...history.slice(1)]],
]) historyScenario(name, () => assert.throws(() => validateAppliedMigrationHistory(rows), /CANONICAL_MIGRATIONS/));
historyScenario("unknown historical checkpoint rejected", () => {
  assert.throws(() => validateAppliedMigrationHistory(history, { throughMigration: "20261001010000_unknown" }), /checkpoint de migraciones desconocido/);
});

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
