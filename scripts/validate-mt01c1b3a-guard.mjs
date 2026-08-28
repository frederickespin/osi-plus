import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function trackedFiles() {
  return spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .stdout.split(/\r?\n/).filter(Boolean);
}

export function validateMt01c1b3aGuard({ root = process.cwd(), files = trackedFiles(), env = process.env } = {}) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  const runtime = normalized.filter((file) => /^(?:api|src)\/.+\.(?:[cm]?[jt]sx?)$/.test(file));
  const consumers = [];
  for (const file of runtime) {
    if (file === "api/_lib/employeeProvisioningExecutor.js") continue;
    const source = readFileSync(resolve(root, file), "utf8");
    if (/employeeProvisioningExecutor/.test(source)) consumers.push(file);
  }
  invariant(consumers.length === 0, `MT-01C1B3A no permite consumidores runtime: ${consumers.join(", ")}`);

  const legacyBypassFile = "api/users/index.js";
  invariant(normalized.includes(legacyBypassFile), "el bypass heredado POST /api/users debe permanecer inventariado hasta C1B3B");
  const legacyBypass = readFileSync(resolve(root, legacyBypassFile), "utf8");
  const bypassMarkers = [
    /req\.method\s*===\s*["']POST["']/,
    /prisma\.user\.create\s*\(/,
    /hashPassword\s*\(/,
    /body\.role/,
  ];
  invariant(bypassMarkers.every((pattern) => pattern.test(legacyBypass)), "el inventario del bypass heredado POST /api/users cambió; requiere revisión C1B3B");

  const executor = readFileSync(resolve(root, "api/_lib/employeeProvisioningExecutor.js"), "utf8");
  const policy = readFileSync(resolve(root, "api/_lib/employeeProvisioningPolicy.js"), "utf8");
  invariant(/runtimeEnabled:\s*false/.test(executor), "el ejecutor debe permanecer inactivo");
  invariant(/initialUserStatus:\s*"inactive"/.test(executor) && /initialMembershipStatus:\s*"INACTIVE"/.test(executor), "los estados iniciales deben bloquear acceso");
  invariant(/lockOrder:[\s\S]*"requestId"[\s\S]*"normalizedEmail"[\s\S]*"employeeCode"/.test(executor), "el orden de locks no está documentado");
  const requestLock = executor.indexOf("`requestId:");
  const emailLock = executor.indexOf("`normalizedEmail:");
  const codeLock = executor.indexOf("`employeeCode:");
  invariant(requestLock >= 0 && requestLock < emailLock && emailLock < codeLock, "los locks deben adquirirse requestId → normalizedEmail → employeeCode");
  invariant(/LOWER\(BTRIM\("email"\)\)/.test(executor) && /"normalized_email"=/.test(executor), "la colisión debe revisar normalizedEmail y el correo heredado");
  invariant(/'inactive'/.test(executor) && /'INACTIVE'/.test(executor) && /'PROVISIONED_INACTIVE'/.test(executor), "la materialización debe quedar inactiva");
  invariant(/critical:\s*true/.test(executor) && /EMPLOYEE_PROVISIONING_MATERIALIZED/.test(executor), "la auditoría crítica es obligatoria");
  invariant(!/commandHash/.test(executor), "la auditoría no puede persistir el hash interno de idempotencia");
  invariant(!/(?:bcrypt|argon2|tokenHmac|employeeProvisioningInvitation\.(?:create|update|upsert)|INSERT INTO[^\n]*employee_provisioning_invitations)/i.test(executor), "el ejecutor no puede manejar credenciales o invitaciones");
  invariant(/EMPLOYEE_PROVISIONING_PERMISSIONS\.MATERIALIZE/.test(policy), "materialize debe permanecer no delegable");

  const migrations = normalized.filter((file) => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(file));
  invariant(migrations.length === 19, `MT-01C1B3A conserva exactamente 19 migraciones; encontradas=${migrations.length}`);
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY").toUpperCase() !== "HYBRID", "HYBRID permanece bloqueado");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false").toLowerCase() !== "true", "tenant switch permanece bloqueado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").toLowerCase() !== "true", "cliente V2 permanece bloqueado");
  return { ok: true, runtimeConsumers: 0, migrations: migrations.length, protectedService: "employeeProvisioningExecutor", legacyBypasses: ["POST /api/users"] };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.stdout.write(`${JSON.stringify(validateMt01c1b3aGuard())}\n`);
}
