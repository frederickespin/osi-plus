import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMt01b3aRepository } from "./validate-mt01b3a-auth-guard.mjs";

const EXPECTED_MIGRATIONS = 15;
const CRM_ROUTES = Object.freeze([
  "api/crm/pipeline-cases/index.js",
  "api/crm/pipeline-cases/[id].js",
  "api/crm/pipeline-summary.js",
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
  invariant(!migrations.some((name) => /^20260801015000_|crm01/i.test(name)), "migración 16 no autorizada");
  invariant(env.CRM_PIPELINE_RUNTIME_MODE === undefined || env.CRM_PIPELINE_RUNTIME_MODE === "DISABLED", "READ_ONLY no puede activarse en CI/runtime");

  for (const path of [".env.example", "vercel.json", "package.json", ".github/workflows/ci.yml"]) {
    const source = read(path);
    invariant(!/CRM_PIPELINE_RUNTIME_MODE\s*[:=]\s*["']?READ_ONLY\b/.test(source), `${path} activa READ_ONLY`);
  }

  const servicePath = "api/_lib/crmPipelineRead.js";
  const service = read(servicePath);
  invariant(/DISABLED:\s*"DISABLED"/.test(service) && /READ_ONLY:\s*"READ_ONLY"/.test(service), "modos exactos ausentes");
  invariant(/configured === undefined \? CRM_PIPELINE_RUNTIME_MODES\.DISABLED : configured/.test(service), "DISABLED no es predeterminado");
  invariant(!/(?:trim|toUpperCase|toLowerCase)\s*\(?.{0,60}CRM_PIPELINE_RUNTIME_MODE/.test(service), "el modo no puede normalizarse");
  invariant(/VERCEL_ENV === "preview"/.test(service) && /VERCEL_ENV === "production"/.test(service), "READ_ONLY no está bloqueado en Vercel");
  invariant(/CRM_PIPELINE_PERMISSION = "clients:view"/.test(service), "se cambió o inventó el permiso");
  invariant(!/\bownerId\b/.test(service), "ownerId heredado no puede ser autoridad");
  invariant((service.match(/tenantId:\s*String\(tenantId\)/g) || []).length >= 3, "hay consultas sin filtro tenantId");
  invariant(/select:\s*CASE_SELECT/.test(service) && /enterpriseOwner:\s*\{\s*select:\s*OWNER_SELECT/.test(service), "falta selección explícita y owner relacional");
  invariant(!/milestonesJson:\s*true|flags:\s*true|ownerUserId:\s*true|tenantId:\s*true/.test(service), "el select expone campos internos");
  invariant(/MAX_PAGE_SIZE = 100/.test(service) && /updatedAt:\s*"desc"[\s\S]*id:\s*"asc"/.test(service), "paginación u orden estable ausente");
  invariant(/ownerMembershipId:\s*null[\s\S]*ownerUserId:\s*null/.test(service), "filtro unassigned incompleto");
  invariant(/sla:\s*Object\.freeze\(\{ overdue: null, basis: "UNAVAILABLE" \}\)/.test(service), "SLA ambiguo no está explicitado");

  const actualRoutes = filesBelow(resolve(root, "api/crm"))
    .filter((path) => path.endsWith(".js"))
    .map((path) => relative(root, path).replaceAll("\\", "/")).sort();
  invariant(JSON.stringify(actualRoutes) === JSON.stringify([...CRM_ROUTES].sort()), "endpoints CRM diferentes a los tres GET autorizados");
  for (const path of CRM_ROUTES) {
    const source = read(path);
    const handler = source.slice(source.indexOf("export default"));
    invariant(/req\.method !== "GET"/.test(handler) && /methodNotAllowed\(res, \["GET"\]\)/.test(handler), `${path} admite métodos de escritura`);
    invariant(!/req\.method\s*===\s*"(?:POST|PATCH|PUT|DELETE)"|readJson|\.create\(|\.update|\.delete|\.upsert/.test(handler), `${path} contiene escritura`);
    const gate = handler.indexOf("requireCrmPipelineReadOnly()");
    const auth = handler.indexOf("requireCommercialPermission(");
    invariant(gate >= 0 && auth > gate, `${path} autentica o consulta antes de la compuerta`);
    invariant(/setPrivateNoStore\(res\)/.test(handler), `${path} permite cache compartida`);
    invariant(!/x-osi-(?:role|userid)|req\.(?:query|body).*(?:tenantId|membershipId|role|permissions)/i.test(handler), `${path} acepta autoridad del navegador`);
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
      invariant(!/api\/crm|crmPipelineRead|CRM_PIPELINE_RUNTIME_MODE/.test(source), `${path} conecta CRM-01A al frontend`);
    }
    if (path.startsWith("api/") && !path.startsWith("api/_lib/") && !CRM_ROUTES.includes(path)) {
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
    permission: "clients:view",
    legacyHeaderExceptions: authInventory.legacyHeaderExceptions,
    frontendConsumers: 0,
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
