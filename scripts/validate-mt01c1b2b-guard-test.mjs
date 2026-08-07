import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateMt01c1b2bGuard } from "./validate-mt01c1b2b-guard.mjs";

const root = mkdtempSync(join(tmpdir(), "mt01c1b2b-guard-"));
const results = [];
function check(name, condition) { if (!condition) throw new Error(`MT01C1B2B_GUARD_FAILED: ${name}`); results.push({ name, passed: true }); }
function write(path, contents) { const full = join(root, path); mkdirSync(full.slice(0, Math.max(full.lastIndexOf("/"), full.lastIndexOf("\\"))), { recursive: true }); writeFileSync(full, contents); }
function base() {
  write("api/_lib/employeeProvisioningDomain.js", "export const safe = true;\n");
  write("api/_lib/employeeProvisioningPolicy.js", "const NEVER_DELEGABLE = new Set([EMPLOYEE_PROVISIONING_PERMISSIONS.ROLE_A_ASSIGN]);\n");
  write("api/_lib/rbac.js", "export const base = true;\n");
}
function expectFailure(name, files, env, pattern) {
  try { validateMt01c1b2bGuard({ root, files, env }); throw new Error("accepted"); }
  catch (error) { if (error.message === "accepted") throw error; check(name, pattern.test(error.message)); }
}

try {
  base();
  const safeFiles = ["api/_lib/employeeProvisioningDomain.js", "api/_lib/employeeProvisioningPolicy.js", "api/_lib/rbac.js"];
  check("estado inactivo permitido", validateMt01c1b2bGuard({ root, files: safeFiles, env: {} }).ok);
  write("api/users/index.js", 'import "../_lib/employeeProvisioningDomain.js";\n');
  expectFailure("endpoint consumidor rechazado", [...safeFiles, "api/users/index.js"], {}, /consumidores runtime/);
  expectFailure("HYBRID rechazado", safeFiles, { MT01B_AUTH_MODE: "HYBRID" }, /HYBRID/);
  expectFailure("tenant switch rechazado", safeFiles, { MT01B_TENANT_SWITCH_ENABLED: "true" }, /tenant switch/);
  expectFailure("cliente V2 rechazado", safeFiles, { VITE_MT01B2_CLIENT_ENABLED: "true" }, /cliente V2/);
  write("api/_lib/rbac.js", 'export const leaked = "employee:role:a:assign";\n');
  expectFailure("assign automático rechazado", safeFiles, {}, /RBAC base/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally { rmSync(root, { recursive: true, force: true }); }

