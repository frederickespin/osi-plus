import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateMt01c1b3aGuard } from "./validate-mt01c1b3a-guard.mjs";

const root = mkdtempSync(join(tmpdir(), "mt01c1b3a-guard-"));
const results = [];
function check(name, condition) { if (!condition) throw new Error(`MT01C1B3A_GUARD_FAILED: ${name}`); results.push({ name, passed: true }); }
function write(path, contents) { const full = join(root, path); mkdirSync(full.slice(0, Math.max(full.lastIndexOf("/"), full.lastIndexOf("\\"))), { recursive: true }); writeFileSync(full, contents); }
function safeExecutor() {
  write("api/_lib/employeeProvisioningExecutor.js", `
    const config = { runtimeEnabled: false, initialUserStatus: "inactive", initialMembershipStatus: "INACTIVE",
      lockOrder: ["requestId", "normalizedEmail", "employeeCode"] };
    await advisoryLock(tx, \`requestId:test\`); await advisoryLock(tx, \`normalizedEmail:test\`); await advisoryLock(tx, \`employeeCode:test\`);
    SELECT "normalized_email"=x OR LOWER(BTRIM("email"))=x;
    INSERT 'inactive' 'INACTIVE' 'PROVISIONED_INACTIVE';
    const event = { critical: true, action: "EMPLOYEE_PROVISIONING_MATERIALIZED" };
  `);
  write("api/_lib/employeeProvisioningPolicy.js", "const NEVER_DELEGABLE = new Set([EMPLOYEE_PROVISIONING_PERMISSIONS.MATERIALIZE]);\n");
}
function expectFailure(name, files, env, pattern) {
  try { validateMt01c1b3aGuard({ root, files, env }); throw new Error("accepted"); }
  catch (error) { if (error.message === "accepted") throw error; check(name, pattern.test(error.message)); }
}

try {
  safeExecutor();
  const migrations = Array.from({ length: 14 }, (_, index) => `prisma/migrations/${String(index).padStart(2, "0")}/migration.sql`);
  for (const migration of migrations) write(migration, "-- synthetic\n");
  const safeFiles = ["api/_lib/employeeProvisioningExecutor.js", "api/_lib/employeeProvisioningPolicy.js", ...migrations];
  check("estado actual permitido", validateMt01c1b3aGuard({ root, files: safeFiles, env: {} }).ok);
  write("api/users/materialize.js", 'import "../_lib/employeeProvisioningExecutor.js";\n');
  expectFailure("endpoint consumidor rechazado", [...safeFiles, "api/users/materialize.js"], {}, /consumidores runtime/);
  expectFailure("HYBRID rechazado", safeFiles, { MT01B_AUTH_MODE: "HYBRID" }, /HYBRID/);
  expectFailure("tenant switch rechazado", safeFiles, { MT01B_TENANT_SWITCH_ENABLED: "true" }, /tenant switch/);
  expectFailure("cliente V2 rechazado", safeFiles, { VITE_MT01B2_CLIENT_ENABLED: "true" }, /cliente V2/);
  expectFailure("migración 15 rechazada", [...safeFiles, "prisma/migrations/15/migration.sql"], {}, /14 migraciones/);
  safeExecutor();
  write("api/_lib/employeeProvisioningExecutor.js", readFileSync(join(root, "api/_lib/employeeProvisioningExecutor.js"), "utf8").replace("critical: true", "critical: false"));
  expectFailure("auditoría no crítica rechazada", safeFiles, {}, /auditoría crítica/);
  safeExecutor();
  write("api/_lib/employeeProvisioningExecutor.js", readFileSync(join(root, "api/_lib/employeeProvisioningExecutor.js"), "utf8").replace("runtimeEnabled: false", "runtimeEnabled: true"));
  expectFailure("activación runtime rechazada", safeFiles, {}, /inactivo/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally { rmSync(root, { recursive: true, force: true }); }
