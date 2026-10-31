import { CANONICAL_MIGRATIONS } from "./canonical-migrations.mjs";
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
  write("api/users/index.js", `
    if (req.method === "GET" || req.method === "POST") {
      return res.status(410).json({ error: "USERS_ADMINISTRATION_MOVED_TO_MEMBERSHIPS", identityCreation: "ADMIN_IDENTITY_INVITATION" });
    }
  `);
}
function expectFailure(name, files, env, pattern) {
  try { validateMt01c1b3aGuard({ root, files, env }); throw new Error("accepted"); }
  catch (error) { if (error.message === "accepted") throw error; check(name, pattern.test(error.message)); }
}

try {
  safeExecutor();
  const migrations = CANONICAL_MIGRATIONS.map((name) => `prisma/migrations/${name}/migration.sql`);
  for (const migration of migrations) write(migration, "-- synthetic\n");
  const safeFiles = ["api/_lib/employeeProvisioningExecutor.js", "api/_lib/employeeProvisioningPolicy.js", "api/users/index.js", ...migrations];
  check("estado actual permitido", validateMt01c1b3aGuard({ root, files: safeFiles, env: {} }).ok);
  expectFailure("ruta retirada users ausente rechazada", safeFiles.filter((file) => file !== "api/users/index.js"), {}, /ruta retirada/);
  write("api/users/index.js", "if (req.method === 'POST') return prisma.user.create({ data: {} });\n");
  expectFailure("reactivación del bypass rechazada", safeFiles, {}, /debe permanecer retirada/);
  safeExecutor();
  write("api/users/index.js", `${readFileSync(join(root, "api/users/index.js"), "utf8")}\nconst passwordHash = await hashPassword(body.password); await prisma.user.create({ data: { passwordHash } });`);
  expectFailure("alta directa aun con marcador 410 rechazada", safeFiles, {}, /no puede restaurar/);
  safeExecutor();
  write("api/users/materialize.js", 'import "../_lib/employeeProvisioningExecutor.js";\n');
  expectFailure("endpoint consumidor rechazado", [...safeFiles, "api/users/materialize.js"], {}, /consumidores runtime/);
  expectFailure("HYBRID rechazado", safeFiles, { MT01B_AUTH_MODE: "HYBRID" }, /HYBRID/);
  expectFailure("tenant switch rechazado", safeFiles, { MT01B_TENANT_SWITCH_ENABLED: "true" }, /tenant switch/);
  expectFailure("cliente V2 rechazado", safeFiles, { VITE_MT01B2_CLIENT_ENABLED: "true" }, /cliente V2/);
  expectFailure("migración adicional rechazada", [...safeFiles, "prisma/migrations/20260901010000_future/migration.sql"], {}, /36 migraciones canónicas/);
  safeExecutor();
  write("api/_lib/employeeProvisioningExecutor.js", readFileSync(join(root, "api/_lib/employeeProvisioningExecutor.js"), "utf8").replace("critical: true", "critical: false"));
  expectFailure("auditoría no crítica rechazada", safeFiles, {}, /auditoría crítica/);
  safeExecutor();
  write("api/_lib/employeeProvisioningExecutor.js", `${readFileSync(join(root, "api/_lib/employeeProvisioningExecutor.js"), "utf8")}\nconst metadataJson = { commandHash: 'forbidden' };\n`);
  expectFailure("hash idempotente en auditoría rechazado", safeFiles, {}, /hash interno/);
  safeExecutor();
  write("api/_lib/employeeProvisioningExecutor.js", readFileSync(join(root, "api/_lib/employeeProvisioningExecutor.js"), "utf8").replace("runtimeEnabled: false", "runtimeEnabled: true"));
  expectFailure("activación runtime rechazada", safeFiles, {}, /inactivo/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally { rmSync(root, { recursive: true, force: true }); }
