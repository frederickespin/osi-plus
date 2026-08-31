import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateMt01c1b2bGuard } from "./validate-mt01c1b2b-guard.mjs";

const root = mkdtempSync(join(tmpdir(), "mt01c1b2b-guard-"));
const results = [];
function check(name, condition) { if (!condition) throw new Error(`MT01C1B2B_GUARD_FAILED: ${name}`); results.push({ name, passed: true }); }
function write(path, contents) { const full = join(root, path); mkdirSync(full.slice(0, Math.max(full.lastIndexOf("/"), full.lastIndexOf("\\"))), { recursive: true }); writeFileSync(full, contents); }
function base() {
  write("api/_lib/employeeProvisioningDomain.js", 'const MT01C1B2B_PAYLOAD_HASH_PEPPER = true; createHmac("sha256", "synthetic"); export const safe = true;\n');
  write("api/_lib/employeeProvisioningPolicy.js", "const NEVER_DELEGABLE = new Set([EMPLOYEE_PROVISIONING_PERMISSIONS.ROLE_A_ASSIGN]);\n");
  write("api/_lib/rbac.js", "export const base = true;\n");
  write("scripts/mt-01c1b2b-database-guard.mjs", "const raw = process.env.MT01C1B2B_TEST_DATABASE_URL;\n");
  write("scripts/mt-01c1b2b-test.mjs", 'const target = validateMt01c1b2bTestDatabaseEnv(); const { PrismaClient } = await import("@prisma/client"); new PrismaClient({ datasourceUrl: target.url });\n');
  write("scripts/run-canonical-db-tests.mjs", "const target = assertCanonicalCiTarget(); process.env.MT01C1B2B_TEST_DATABASE_URL = process.env.DATABASE_URL;\n");
}
function expectFailure(name, files, env, pattern) {
  try { validateMt01c1b2bGuard({ root, files, env }); throw new Error("accepted"); }
  catch (error) { if (error.message === "accepted") throw error; check(name, pattern.test(error.message)); }
}

try {
  base();
  const migrations = [
    ...Array.from({ length: 21 }, (_, index) => `prisma/migrations/${String(index).padStart(2, "0")}/migration.sql`),
    "prisma/migrations/20260831010000_v17_crm_icp_foundation/migration.sql",
  ];
  for (const migration of migrations) write(migration, "-- synthetic\n");
  const safeFiles = ["api/_lib/employeeProvisioningDomain.js", "api/_lib/employeeProvisioningPolicy.js", "api/_lib/rbac.js", "scripts/mt-01c1b2b-database-guard.mjs", "scripts/mt-01c1b2b-test.mjs", "scripts/run-canonical-db-tests.mjs", ...migrations];
  check("estado inactivo permitido", validateMt01c1b2bGuard({ root, files: safeFiles, env: {} }).ok);
  write("api/users/index.js", 'import "../_lib/employeeProvisioningDomain.js";\n');
  expectFailure("endpoint consumidor rechazado", [...safeFiles, "api/users/index.js"], {}, /consumidores runtime/);
  expectFailure("HYBRID rechazado", safeFiles, { MT01B_AUTH_MODE: "HYBRID" }, /HYBRID/);
  expectFailure("tenant switch rechazado", safeFiles, { MT01B_TENANT_SWITCH_ENABLED: "true" }, /tenant switch/);
  expectFailure("cliente V2 rechazado", safeFiles, { VITE_MT01B2_CLIENT_ENABLED: "true" }, /cliente V2/);
  write("api/_lib/rbac.js", 'export const leaked = "employee:role:a:assign";\n');
  expectFailure("assign automático rechazado", safeFiles, {}, /RBAC base/);
  base();
  write("api/_lib/employeeProvisioningPolicy.js", "const NEVER_DELEGABLE = new Set([EMPLOYEE_PROVISIONING_PERMISSIONS.ROLE_A_ASSIGN]); const expanded = Object.values(PERMS);\n");
  expectFailure("catálogo delegable dinámico rechazado", safeFiles, {}, /catálogo delegable/);
  base();
  write("api/_lib/employeeProvisioningDomain.js", 'const MT01C1B2B_PAYLOAD_HASH_PEPPER = true; createHmac("sha256", "synthetic"); async function unsafe(tx){ return tx.user.create({data:{}}); }\n');
  expectFailure("creación de identidad rechazada", safeFiles, {}, /no puede crear User/);
  base();
  expectFailure("migración número 23 rechazada", [...safeFiles, "prisma/migrations/20260901010000_future/migration.sql"], {}, /exactamente 22 migraciones/);
  base();
  write("scripts/mt-01c1b2b-database-guard.mjs", "const raw = process.env.MT01C1B2B_TEST_DATABASE_URL || process.env.DATABASE_URL;\n");
  expectFailure("fallback DATABASE_URL rechazado", safeFiles, {}, /no puede usar DATABASE_URL/);
  base();
  write("scripts/mt-01c1b2b-test.mjs", 'const { PrismaClient } = await import("@prisma/client"); const target = validateMt01c1b2bTestDatabaseEnv();\n');
  expectFailure("import Prisma antes de validar rechazado", safeFiles, {}, /antes de importar Prisma/);
  base();
  write("scripts/run-canonical-db-tests.mjs", "const target = assertCanonicalCiTarget();\n");
  expectFailure("runner sin transferencia explícita rechazado", safeFiles, {}, /transferir explícitamente/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally { rmSync(root, { recursive: true, force: true }); }
