import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CANONICAL_MIGRATIONS, validateMigrationFiles } from "./validate-canonical-ci.mjs";

const root = mkdtempSync(join(tmpdir(), "mt01c1b1-canonical-guard-"));
const results = [];

function check(name, condition) {
  if (!condition) throw new Error(`MT-01C1B1_GUARD_TEST_FAILED: ${name}`);
  results.push({ name, passed: true });
}

try {
  const migrationRoot = join(root, "prisma", "migrations");
  mkdirSync(migrationRoot, { recursive: true });
  cpSync(resolve("prisma", "migrations"), migrationRoot, { recursive: true });
  const current = validateMigrationFiles(root);
  check("canonical chain contains exactly fourteen migrations", current.length === 14 && CANONICAL_MIGRATIONS.length === 14);
  check("MT-01C1B1 is migration fourteen", current.at(-1) === "20260801013000_mt01c1b1_provisioning_persistence");

  const unexpected = join(migrationRoot, "20260801014000_unexpected_migration");
  mkdirSync(unexpected);
  writeFileSync(join(unexpected, "migration.sql"), "SELECT 1;\n", "utf8");
  let rejected = null;
  try { validateMigrationFiles(root); } catch (error) { rejected = error; }
  check("unexpected migration fifteen is rejected", rejected?.message.includes("14 migraciones canónicas"));
  check("guard rejects before executing unexpected SQL", rejected instanceof Error);
  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
