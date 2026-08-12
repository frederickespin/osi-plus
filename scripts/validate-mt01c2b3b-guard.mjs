import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_MIGRATIONS = 16;
const PREPARED_ROUTES = Object.freeze([
  "api/clients/index.js",
  "api/projects/index.js",
  "api/k/dashboard.js",
  "api/k/project.js",
  "api/k/project-validate.js",
  "api/k/project-release.js",
]);
const BLOCKED_ROOT_CONSUMERS = Object.freeze([
  "api/osis/index.js",
  "api/k/pgd/apply.js",
  "api/k/pgd/item.js",
  "api/k/signal.js",
]);
const ACTIVATION_BLOCKERS = Object.freeze([
  "PipelineCase runtime mutations absent",
  "Lead runtime endpoint absent",
  "OSI root lacks tenant authority",
  "ProjectSignal/ProjectPgd children lack tenant authority",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`MT-01C2B3B: ${message}`);
}

function text(root, path, overrides = {}) {
  return overrides[path] ?? readFileSync(resolve(root, path), "utf8");
}

function migrations(root) {
  return readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export function validateMt01c2b3b({
  root = process.cwd(),
  env = process.env,
  overrides = {},
  migrationNames = migrations(root),
  extraRuntimeSources = {},
} = {}) {
  invariant(migrationNames.length === EXPECTED_MIGRATIONS, `se requieren exactamente ${EXPECTED_MIGRATIONS} migraciones`);
  invariant(migrationNames.includes("20260801015000_crm01b_pipeline_mutation_authority"), "falta migración 16 CRM-01B1");
  invariant(!migrationNames.some((name) => /^20260801016000_/.test(name)), "migración 17 no autorizada");

  const envExample = text(root, ".env.example", overrides);
  invariant(/^COMMERCIAL_TENANCY_WRITE_MODE="LEGACY_ONLY"$/m.test(envExample), "WRITE debe iniciar en LEGACY_ONLY exacto");
  invariant(/^COMMERCIAL_TENANCY_READ_MODE="LEGACY_ONLY"$/m.test(envExample), "READ debe iniciar en LEGACY_ONLY exacto");
  invariant(env.COMMERCIAL_TENANCY_WRITE_MODE === undefined || env.COMMERCIAL_TENANCY_WRITE_MODE === "LEGACY_ONLY", "TENANT_WRITE permanece bloqueado");
  invariant(env.COMMERCIAL_TENANCY_READ_MODE === undefined || env.COMMERCIAL_TENANCY_READ_MODE === "LEGACY_ONLY", "TENANT_READ permanece bloqueado");
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY").trim().toUpperCase() === "LEGACY", "HYBRID permanece bloqueado");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false").trim().toLowerCase() !== "true", "tenant switch permanece bloqueado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").trim().toLowerCase() !== "true", "cliente V2 permanece bloqueado");

  for (const path of [".env.example", "vercel.json", "package.json", ".github/workflows/ci.yml"]) {
    const source = text(root, path, overrides);
    invariant(!/COMMERCIAL_TENANCY_(?:WRITE|READ)_MODE\s*[:=]\s*["']?TENANT_(?:WRITE|READ)\b/i.test(source), `${path} activa el puente empresarial`);
  }

  const bridge = text(root, "api/_lib/commercialTenancyWrite.js", overrides);
  invariant(/coordinatedLegacy/.test(bridge) && /coordinatedTenant/.test(bridge), "los modos no se coordinan como par atómico");
  invariant(/COMMERCIAL_TENANCY_CONFIGURATION_INVALID/.test(bridge), "falta error controlado de configuración");
  invariant(/coordinatedTenant\s*&&\s*isVercelRuntime/.test(bridge), "el modo tenant no está bloqueado en Vercel");
  invariant(/COMMERCIAL_CONTEXT_CACHE\s*=\s*Symbol/.test(bridge), "el contexto no está limitado a la request");

  const readService = text(root, "api/_lib/commercialTenancyRead.js", overrides);
  for (const model of ["client", "project", "pipelineCase", "lead"]) {
    invariant(new RegExp(`prisma\\.${model}\\.(?:findMany|findFirst|count)`).test(readService), `falta lector preparado de ${model}`);
  }
  invariant((readService.match(/tenantId:\s*String\(tenantId\)/g) || []).length >= 5, "los lectores no filtran todas las raíces por tenant");
  invariant(/tenantClient:\s*\{\s*is:\s*\{\s*tenantId:/s.test(readService), "Project no valida el tenant del Client padre");
  invariant(/omit:\s*\{\s*tenantId:\s*true/s.test(readService), "las respuestas no ocultan tenantId");
  invariant(/ownerMembershipId:\s*true,\s*ownerUserId:\s*true/.test(readService), "PipelineCase expone autoridad interna de owner");
  invariant(/MAX_PAGE_SIZE\s*=\s*100/.test(readService) && /orderBy: \[/.test(readService), "paginación u orden estable ausente");

  for (const path of PREPARED_ROUTES) {
    const source = text(root, path, overrides);
    invariant(/commercialTenancyWrite\.js/.test(source), `${path} no resuelve contexto empresarial`);
    invariant(/commercialTenancyRead\.js/.test(source), `${path} no usa el lector tenantizado`);
    invariant(/resolveCommercialTenancyModes\(\)/.test(source), `${path} no valida el par de modos`);
    invariant(/requireCommercialPermission/.test(source), `${path} no exige permiso efectivo`);
    invariant(/setPrivateNoStore\(res\)/.test(source), `${path} no impide caché compartida`);
    invariant(!/req\.(?:query|body)\??\.(?:tenantId|membershipId|ownerMembershipId|ownerUserId)|x-osi-(?:role|userid)/i.test(source), `${path} confía en autoridad empresarial del navegador`);
  }

  const clients = text(root, "api/clients/index.js", overrides);
  const projects = text(root, "api/projects/index.js", overrides);
  invariant(/PERMS\.CLIENTS_VIEW/.test(clients) && /listTenantClients/.test(clients), "Client no conserva permiso/filtro tenant");
  invariant(/PERMS\.PROJECTS_VIEW/.test(projects) && /listTenantProjects/.test(projects), "Project no conserva permiso/filtro tenant");

  for (const [path, permission, state, timestamp] of [
    ["api/k/project-validate.js", "PROJECTS_VALIDATE", "VALIDATED", "kValidatedAt"],
    ["api/k/project-release.js", "PROJECTS_RELEASE", "RELEASED", "kReleasedAt"],
  ]) {
    const source = text(root, path, overrides);
    invariant(new RegExp(`PERMS\\.${permission}`).test(source), `${path} cambió el permiso existente`);
    invariant(/assertNoBrowserCommercialAuthority\(body\)/.test(source), `${path} acepta autoridad del body`);
    invariant(new RegExp(`data:\\s*\\{\\s*kState:\\s*"${state}"\\s*,\\s*${timestamp}:\\s*new Date\\(\\)\\s*\\}`).test(source), `${path} actualiza campos no autorizados`);
    invariant(!/data:\s*\{[^}]*\.\.\.body/s.test(source), `${path} actualiza campos no autorizados`);
    invariant(/transitionTenantProject\(prisma/.test(source), `${path} no usa transición tenant optimista`);
  }
  invariant(/updateMany\(\{\s*where:\s*\{[\s\S]*tenantId:\s*String\(tenantId\)[\s\S]*updatedAt:\s*expectedUpdatedAt[\s\S]*kState:\s*expectedKState/.test(readService), "la transición K no limita tenant, versión y estado");
  invariant(/COMMERCIAL_PROJECT_CONCURRENT_MODIFICATION/.test(readService), "la carrera K no produce conflicto controlado");

  const detail = text(root, "api/k/project.js", overrides);
  invariant(/if \(!tenantRead\)\s*\{\s*await ensureDefaultSignals/s.test(detail), "GET K tenantizado todavía podría escribir");
  for (const path of BLOCKED_ROOT_CONSUMERS) {
    const source = text(root, path, overrides);
    invariant(!/commercialTenancyRead\.js/.test(source), `${path} se activó sin aislamiento completo`);
  }

  const runtime = {
    ...Object.fromEntries(PREPARED_ROUTES.map((path) => [path, text(root, path, overrides)])),
    ...Object.fromEntries(BLOCKED_ROOT_CONSUMERS.map((path) => [path, text(root, path, overrides)])),
    ...extraRuntimeSources,
  };
  for (const [path, source] of Object.entries(runtime)) {
    if (/\bprisma\.(?:lead|pipelineCase)\.(?:findMany|findFirst|findUnique|count|aggregate|groupBy)\s*\(/.test(source)) {
      invariant(["api/_lib/commercialTenancyRead.js", "api/_lib/crmPipelineRead.js"].includes(path), `${path} activa Lead/PipelineCase fuera del servicio preparado`);
    }
  }

  const readiness = text(root, "scripts/mt-01c2b3b-readiness.mjs", overrides);
  invariant(/MT01C2B3B_READINESS_DATABASE_URL/.test(readiness), "readiness no usa variable exclusiva");
  invariant(!/process\.env\.(?:DATABASE_URL|DIRECT_URL)/.test(readiness), "readiness admite fallback general");
  invariant(/SET TRANSACTION READ ONLY/.test(readiness), "readiness no fuerza transacción de sólo lectura");
  const packageJson = JSON.parse(text(root, "package.json", overrides));
  invariant(!Object.values(packageJson.scripts || {}).some((command) => /mt-01c2b3b-readiness/i.test(String(command))), "readiness no puede ejecutarse automáticamente");
  for (const path of ["api", "src"]) {
    const injected = Object.entries(extraRuntimeSources).filter(([name]) => name.startsWith(`${path}/`));
    invariant(!injected.some(([, source]) => /mt-01c2b3b-readiness|MT01C2B3B_READINESS/.test(source)), "runtime no puede invocar readiness");
  }

  return Object.freeze({
    ok: true,
    migrations: migrationNames.length,
    modes: Object.freeze({ write: "LEGACY_ONLY", read: "LEGACY_ONLY" }),
    preparedRoutes: Object.freeze([...PREPARED_ROUTES]),
    serviceOnlyRoots: Object.freeze(["Lead"]),
    blockedConsumers: Object.freeze([...BLOCKED_ROOT_CONSUMERS]),
    activationBlockers: Object.freeze([...ACTIVATION_BLOCKERS]),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateMt01c2b3b(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
