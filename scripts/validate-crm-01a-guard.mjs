import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMt01b3aRepository } from "./validate-mt01b3a-auth-guard.mjs";

const EXPECTED_MIGRATIONS = 16;
const CRM_ROUTES = Object.freeze([
  "api/crm/pipeline-cases/index.js",
  "api/crm/pipeline-cases/[id].js",
  "api/crm/pipeline-summary.js",
]);
const CRM_MUTATION_ROUTES = Object.freeze([
  "api/crm/pipeline-owner-options.js",
  "api/crm/pipeline-cases/[id]/allowed-transitions.js",
  "api/crm/pipeline-cases/[id]/assign-owner.js",
  "api/crm/pipeline-cases/[id]/transition.js",
  "api/crm/pipeline-cases/[id]/unassign-owner.js",
]);
const AUTHORIZED_CRM_ROUTES = Object.freeze([...CRM_ROUTES, ...CRM_MUTATION_ROUTES]);
const AUTHORIZED_FRONTEND_CONSUMERS = Object.freeze([
  "src/crm-relational/api.ts",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`CRM-01A: ${message}`);
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

function migrationNames(root) {
  return readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export function validateCrm01aGuard({
  root = process.cwd(),
  env = process.env,
  overrides = {},
  migrations = migrationNames(root),
  extraSources = {},
} = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  invariant(migrations.length === EXPECTED_MIGRATIONS, `se requieren exactamente ${EXPECTED_MIGRATIONS} migraciones`);
  invariant(migrations.includes("20260801015000_crm01b_pipeline_mutation_authority"), "falta migración 16 CRM-01B1 autorizada");
  invariant(!migrations.some((name) => /^20260801016000_/.test(name)), "migración 17 no autorizada");
  invariant(env.CRM_PIPELINE_RUNTIME_MODE === undefined || env.CRM_PIPELINE_RUNTIME_MODE === "DISABLED", "READ_ONLY no puede activarse en CI/runtime");

  for (const path of [".env.example", "vercel.json", "package.json", ".github/workflows/ci.yml"]) {
    const source = read(path);
    invariant(!/CRM_PIPELINE_RUNTIME_MODE\s*[:=]\s*["']?READ_ONLY\b/.test(source), `${path} activa READ_ONLY`);
  }

  const servicePath = "api/_lib/crmPipelineRead.js";
  const service = read(servicePath);
  const access = read("api/_lib/crmPipelineAccess.js");
  const backendRbac = read("api/_lib/rbac.js");
  invariant(/DISABLED:\s*"DISABLED"/.test(access) && /READ_ONLY:\s*"READ_ONLY"/.test(access), "modos exactos ausentes");
  invariant(/env\.CRM_PIPELINE_RUNTIME_MODE[\s\S]{0,100}CRM_PIPELINE_READ_MODES[\s\S]{0,100}CRM_PIPELINE_READ_MODES\.DISABLED/.test(access), "DISABLED no es predeterminado");
  invariant(!/(?:trim|toUpperCase|toLowerCase)\s*\(?.{0,60}CRM_PIPELINE_RUNTIME_MODE/.test(access), "el modo no puede normalizarse");
  invariant(/hasVercelEnvironment\(env\)/.test(access), "READ_ONLY no está bloqueado en Vercel");
  invariant(/PIPELINE_VIEW:\s*"pipeline:view"/.test(backendRbac), "falta el permiso dedicado pipeline:view");
  invariant(/CRM_PIPELINE_PERMISSION = PERMS\.PIPELINE_VIEW/.test(service), "CRM no usa pipeline:view como autoridad única");
  invariant(!/CRM_PIPELINE_PERMISSION\s*=\s*["']clients:view["']/.test(service), "clients:view no puede autorizar Pipeline");
  const roleCatalog = backendRbac.match(/const ROLE_PERMS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || "";
  invariant(/A:\s*Object\.values\(PERMS\)/.test(roleCatalog), "rol A no conserva el catálogo empresarial completo");
  const roleArrays = [...roleCatalog.matchAll(/\n\s{2}([A-Z][A-Z0-9]*):\s*\[([\s\S]*?)\n\s{2}\],?/g)]
    .map((match) => ({ role: match[1], permissions: match[2] }));
  const pipelineRoles = roleArrays.filter(({ permissions }) => /PERMS\.PIPELINE_VIEW/.test(permissions)).map(({ role }) => role);
  const pipelineAssignments = roleCatalog.match(/PERMS\.PIPELINE_VIEW/g) || [];
  invariant(pipelineAssignments.length === 1 && JSON.stringify(pipelineRoles) === JSON.stringify(["V"]), "pipeline:view sólo puede asignarse por base a A y V");
  invariant(!/\bownerId\b/.test(service), "ownerId heredado no puede ser autoridad");
  invariant((service.match(/tenantId:\s*String\(tenantId\)/g) || []).length >= 3, "hay consultas sin filtro tenantId");
  invariant(/select:\s*CASE_SELECT/.test(service) && /enterpriseOwner:\s*\{\s*select:\s*OWNER_SELECT/.test(service), "falta selección explícita y owner relacional");
  invariant(!/milestonesJson:\s*true|flags:\s*true|ownerUserId:\s*true|tenantId:\s*true/.test(service), "el select expone campos internos");
  const safeOwner = service.slice(service.indexOf("function safeOwner"), service.indexOf("function safeCase"));
  invariant(!/membershipId|userStatus|email|phone|userId|tenantId|grantedPermissions|deniedPermissions/.test(safeOwner), "owner expone identidad o estado global innecesario");
  invariant(/MAX_PAGE_SIZE = 100/.test(service) && /updatedAt:\s*"desc"[\s\S]*id:\s*"asc"/.test(service), "paginación u orden estable ausente");
  invariant(/ownerMembershipId:\s*null[\s\S]*ownerUserId:\s*null/.test(service), "filtro unassigned incompleto");
  invariant(/sla:\s*Object\.freeze\(\{ overdue: null, basis: "UNAVAILABLE" \}\)/.test(service), "SLA ambiguo no está explicitado");

  const actualRoutes = filesBelow(resolve(root, "api/crm"))
    .filter((path) => path.endsWith(".js"))
    .map((path) => relative(root, path).replaceAll("\\", "/")).sort();
  invariant(JSON.stringify(actualRoutes) === JSON.stringify([...AUTHORIZED_CRM_ROUTES].sort()), "endpoints CRM fuera del inventario CRM-01A/CRM-01B3A");
  for (const path of CRM_ROUTES) {
    const source = read(path);
    const factoryStart = source.indexOf("export function createPipeline");
    invariant(factoryStart >= 0, `${path} no expone una fábrica auditable`);
    const handler = source.slice(factoryStart);
    invariant(/req\.method !== "GET"/.test(handler) && /methodNotAllowed\(res, \["GET"\]\)/.test(handler), `${path} admite métodos de escritura`);
    invariant(!/req\.method\s*===\s*"(?:POST|PATCH|PUT|DELETE)"|readJson|\.create\(|\.update|\.delete|\.upsert/.test(handler), `${path} contiene escritura`);
    const gate = handler.indexOf("requireCrmPipelineReadOnly(env)");
    const auth = handler.indexOf("requirePermission(req");
    invariant(gate >= 0 && auth > gate, `${path} autentica o consulta antes de la compuerta`);
    invariant(/setPrivateNoStore\(res\)/.test(handler), `${path} permite cache compartida`);
    invariant(!/x-osi-(?:role|userid)|req\.(?:query|body).*(?:tenantId|membershipId|role|permissions)/i.test(handler), `${path} acepta autoridad del navegador`);
    invariant(!/tenantMembership\s*\.\s*(?:create|update|delete|upsert)/.test(handler), `${path} modifica TenantMembership`);
  }

  const runtimeSources = { ...extraSources };
  for (const directory of ["api", "src"]) {
    for (const absolute of filesBelow(resolve(root, directory))) {
      if (!/\.[cm]?[jt]sx?$/.test(absolute)) continue;
      const path = relative(root, absolute).replaceAll("\\", "/");
      runtimeSources[path] ??= read(path);
    }
  }
  for (const [path, source] of Object.entries(runtimeSources)) {
    if (path.startsWith("src/")) {
      if (AUTHORIZED_FRONTEND_CONSUMERS.includes(path)) {
        invariant(/API_PREFIX\s*=\s*["']\/api\/crm["']/.test(source), `${path} no usa el adaptador CRM autorizado`);
      } else {
        invariant(!/api\/crm|crmPipelineRead|CRM_PIPELINE_RUNTIME_MODE/.test(source), `${path} conecta CRM-01A al frontend fuera del adaptador autorizado`);
      }
    }
    if (path.startsWith("api/") && !path.startsWith("api/_lib/") && !AUTHORIZED_CRM_ROUTES.includes(path)) {
      invariant(!/crmPipelineRead|api\/crm|CRM_PIPELINE_RUNTIME_MODE/.test(source), `${path} activa CRM-01A fuera de las rutas autorizadas`);
    }
  }

  const localTarget = read("scripts/crm-01a-local-target.mjs");
  invariant(/CRM01A_TEST_DATABASE_URL/.test(localTarget), "runner no usa variable exclusiva");
  invariant(!/process\.env\.(?:DATABASE_URL|DIRECT_URL)/.test(localTarget), "runner admite fallback de DATABASE_URL/DIRECT_URL");
  invariant(/hostname === "127\.0\.0\.1"/.test(localTarget) && /port === "55432"/.test(localTarget), "runner no limita host/puerto local");
  invariant(/neon\.branch_id/.test(localTarget) && /Neon y poolers/.test(localTarget), "runner no bloquea Neon/pooler");

  const authInventory = validateMt01b3aRepository(root);
  invariant(authInventory.legacyHeaderExceptions === 24, "aumentaron las 24 excepciones heredadas");
  return Object.freeze({
    ok: true,
    migrations: migrations.length,
    mode: "DISABLED",
    routes: Object.freeze([...CRM_ROUTES]),
    permission: "pipeline:view",
    baseRoles: Object.freeze(["A", "V"]),
    legacyHeaderExceptions: authInventory.legacyHeaderExceptions,
    frontendConsumers: AUTHORIZED_FRONTEND_CONSUMERS.length,
    writeEndpoints: 0,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateCrm01aGuard(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
