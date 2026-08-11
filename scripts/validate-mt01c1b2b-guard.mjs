import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function invariant(condition, message) { if (!condition) throw new Error(message); }

function trackedFiles() {
  return spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).stdout.split(/\r?\n/).filter(Boolean);
}

export function validateMt01c1b2bGuard({ root = process.cwd(), files = trackedFiles(), env = process.env } = {}) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  const runtime = normalized.filter((file) => /^(?:api|src)\/.+\.(?:[cm]?[jt]sx?)$/.test(file));
  const violations = [];
  for (const file of runtime) {
    if (file.startsWith("api/_lib/")) continue;
    const source = readFileSync(resolve(root, file), "utf8");
    if (/employeeProvisioning(?:Domain|Executor|Policy)/.test(source)) violations.push(file);
  }
  invariant(violations.length === 0, `MT-01C1B2B no permite consumidores runtime: ${violations.join(", ")}`);

  const policy = readFileSync(resolve(root, "api/_lib/employeeProvisioningPolicy.js"), "utf8");
  const domain = readFileSync(resolve(root, "api/_lib/employeeProvisioningDomain.js"), "utf8");
  const rbac = readFileSync(resolve(root, "api/_lib/rbac.js"), "utf8");
  const databaseGuard = readFileSync(resolve(root, "scripts/mt-01c1b2b-database-guard.mjs"), "utf8");
  const domainSuite = readFileSync(resolve(root, "scripts/mt-01c1b2b-test.mjs"), "utf8");
  const canonicalRunner = readFileSync(resolve(root, "scripts/run-canonical-db-tests.mjs"), "utf8");
  invariant(!rbac.includes("employee:role:a:assign"), "ROLE_A_ASSIGN no puede agregarse al RBAC base");
  invariant(/NEVER_DELEGABLE[\s\S]*EMPLOYEE_PROVISIONING_PERMISSIONS\.ROLE_A_ASSIGN/.test(policy), "ROLE_A_ASSIGN debe permanecer fuera de la delegación automática");
  invariant(!/Object\.values\s*\(\s*PERMS\s*\)|permsForRole\s*\(/.test(policy), "el catálogo delegable debe ser explícito y cerrado");
  invariant(!/(?:normalizedEmail|normalized_email)\s*[:=].*(?:update|upsert)|osi_users[\s\S]{0,80}normalized_email/i.test(domain), "C1B2B no puede escribir User.normalizedEmail");
  invariant(!/(?:employeeProvisioningInvitation\.(?:create|update|upsert)|INSERT INTO\s+[^\n]*employee_provisioning_invitations)/i.test(domain), "C1B2B no puede emitir invitaciones");
  invariant(!/(?:\b(?:user|tenantMembership|employeeProfile)\.(?:create|createMany|upsert)|INSERT INTO\s+"osi"\."(?:osi_users|tenant_memberships|employee_profiles)")/i.test(domain), "C1B2B no puede crear User, TenantMembership o EmployeeProfile");
  invariant(!/(?:tokenHmac|token_hmac|refreshToken|passwordHash)/i.test(domain), "C1B2B no puede manejar tokens, invitaciones o contraseñas");
  invariant(/MT01C1B2B_PAYLOAD_HASH_PEPPER/.test(domain) && /createHmac\s*\(\s*"sha256"/.test(domain), "payloadHash sensible debe usar HMAC con pepper externo");
  invariant(/MT01C1B2B_TEST_DATABASE_URL/.test(databaseGuard) && !/process\.env\.(?:DATABASE_URL|DIRECT_URL)/.test(databaseGuard), "la guardia de base no puede usar DATABASE_URL o DIRECT_URL");
  const validationIndex = domainSuite.indexOf("validateMt01c1b2bTestDatabaseEnv()");
  const prismaImportIndex = domainSuite.indexOf('await import("@prisma/client")');
  invariant(validationIndex >= 0 && prismaImportIndex > validationIndex && !/process\.env\.(?:DATABASE_URL|DIRECT_URL)/.test(domainSuite), "la suite debe validar la URL exclusiva antes de importar Prisma");
  invariant(/assertCanonicalCiTarget\(\)[\s\S]*process\.env\.MT01C1B2B_TEST_DATABASE_URL\s*=\s*process\.env\.DATABASE_URL/.test(canonicalRunner), "el runner canónico debe transferir explícitamente su URL ya validada");
  const migrations = normalized.filter((file) => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(file));
  invariant(migrations.length === 16, `la cadena canónica debe conservar exactamente 16 migraciones; encontradas=${migrations.length}`);
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY").toUpperCase() !== "HYBRID", "HYBRID permanece bloqueado");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false").toLowerCase() !== "true", "tenant switch permanece bloqueado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").toLowerCase() !== "true", "cliente V2 permanece bloqueado");
  return { ok: true, runtimeFiles: runtime.length, protectedServices: 3 };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.stdout.write(`${JSON.stringify(validateMt01c1b2bGuard())}\n`);
}
