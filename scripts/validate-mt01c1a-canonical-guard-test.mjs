import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CANONICAL_MIGRATIONS, validateMigrationFiles } from "./validate-canonical-ci.mjs";

const root = mkdtempSync(join(tmpdir(), "mt01c1a-canonical-guard-"));
const results = [];

function check(name, condition) {
  if (!condition) throw new Error(`MT-01C1A_GUARD_TEST_FAILED: ${name}`);
  results.push({ name, passed: true });
}

try {
  const migrationRoot = join(root, "prisma", "migrations");
  mkdirSync(migrationRoot, { recursive: true });
  cpSync(resolve("prisma", "migrations"), migrationRoot, { recursive: true });

  const current = validateMigrationFiles(root);
  check("MT-01C1A remains migration thirteen in the canonical chain", current.length === 22 && CANONICAL_MIGRATIONS[12] === "20260801012000_mt01c1a_employee_profiles");

  const unexpected = join(migrationRoot, "20260801021000_unexpected_migration");
  mkdirSync(unexpected);
  writeFileSync(join(unexpected, "migration.sql"), "SELECT 1;\n", "utf8");
  let rejected = null;
  try {
    validateMigrationFiles(root);
  } catch (error) {
    rejected = error;
  }
  check("unexpected migration twenty-three is rejected", rejected?.message.includes("22 migraciones canónicas"));
  check("guard identifies chain mismatch without executing SQL", rejected instanceof Error);

  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
