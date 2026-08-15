import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CANONICAL_MIGRATIONS, validateMigrationFiles } from "./validate-canonical-ci.mjs";
import { validateMt01c1b1Guard } from "./validate-mt01c1b1-guard.mjs";

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
  check("canonical chain contains exactly seventeen migrations", current.length === 17 && CANONICAL_MIGRATIONS.length === 17);
  check("MT-01C1B1 remains migration fourteen", current[13] === "20260801013000_mt01c1b1_provisioning_persistence");

  const unexpected = join(migrationRoot, "20260801021000_unexpected_migration");
  mkdirSync(unexpected);
  writeFileSync(join(unexpected, "migration.sql"), "SELECT 1;\n", "utf8");
  let rejected = null;
  try { validateMigrationFiles(root); } catch (error) { rejected = error; }
  check("unexpected migration eighteen is rejected", rejected?.message.includes("17 migraciones canónicas"));
  check("guard rejects before executing unexpected SQL", rejected instanceof Error);

  mkdirSync(join(root, "api"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, ".env.example"), "MT01B_AUTH_MODE=LEGACY\nMT01B_TENANT_SWITCH_ENABLED=false\nVITE_MT01B2_CLIENT_ENABLED=false\n", "utf8");
  writeFileSync(join(root, "api", "normalized-email-consumer.js"), "export const query = { select: { normalizedEmail: true } };\n", "utf8");
  let runtimeRejected = null;
  try { validateMt01c1b1Guard(root); } catch (error) { runtimeRejected = error; }
  check("runtime guard rejects normalizedEmail consumers", runtimeRejected?.message.includes("persistencia de provisión no puede tener consumidores runtime"));
  process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
