import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = "20260801015000_crm01b_pipeline_mutation_authority";
const MIGRATION_HASH = "77db8b909def5731693d1c8b8e2fbe020ff31f0322b2c8a57a1e18d79fc685f8";
const CRM_ROUTES = Object.freeze([
  "api/crm/pipeline-cases/index.js",
  "api/crm/pipeline-cases/[id].js",
  "api/crm/pipeline-summary.js",
  "api/crm/pipeline-cases/[id]/allowed-transitions.js",
  "api/crm/pipeline-cases/[id]/assign-owner.js",
  "api/crm/pipeline-cases/[id]/transition.js",
  "api/crm/pipeline-cases/[id]/unassign-owner.js",
]);
const CONFIG_NAMES = Object.freeze([
  "CRM_PIPELINE_RUNTIME_MODE",
  "CRM_PIPELINE_MUTATION_MODE",
  "CRM_PIPELINE_ACTIVATION_BATCH",
]);

function invariant(condition, message) { if (!condition) throw new Error(`CRM01B3B1_GUARD: ${message}`); }
function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

export function validateCrm01b3b1Guard({ root = process.cwd(), overrides = {}, extraSources = {}, env = process.env, migrationNames } = {}) {
  const read = (path) => overrides[path] ?? extraSources[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = migrationNames ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  invariant(migrations.length === 16 && !migrations.some((name) => /^20260801016000_/.test(name)), "se exigen 16 migraciones y ninguna 17");
  invariant(createHash("sha256").update(read(`prisma/migrations/${MIGRATION}/migration.sql`).replace(/\r\n/g, "\n")).digest("hex") === MIGRATION_HASH, "migración 16 modificada");
  invariant(/model PipelineCaseCommand\s*\{/.test(read("prisma/schema.prisma")), "datamodel no contiene autoridad PipelineCaseCommand");

  const access = read("api/_lib/crmPipelineAccess.js");
  for (const signature of [
    'PRODUCTION_READ: "PRODUCTION_READ"', 'PRODUCTION_WRITE: "PRODUCTION_WRITE"',
    'CRM-01B3B1-PRODUCTION-V1', 'CRM_PIPELINE_CONFIGURATION_INVALID',
    'env.VERCEL_ENV !== "production"', 'env.VERCEL_GIT_COMMIT_REF !== "main"',
    '(env.MT01B_AUTH_MODE ?? "LEGACY") !== "LEGACY"',
    '(env.MT01B_TENANT_SWITCH_ENABLED ?? "false") !== "false"',
    '(env.VITE_MT01B2_CLIENT_ENABLED ?? "false") !== "false"',
    'resolveCommercialTenancyModes(env)', 'activationBatch !== undefined',
    'assertCrmAuthorizationHeader(request)', 'resolveCommercialContext(request, options)',
  ]) invariant(access.includes(signature), `resolver central incompleto: ${signature}`);
  invariant(!/(?:trim|toUpperCase|toLowerCase)\s*\([^)]*(?:CRM_PIPELINE|activationBatch|readMode|mutationMode)/.test(access), "configuración CRM no puede normalizarse");
  invariant(/localRead[\s\S]*localWrite[\s\S]*productionRead[\s\S]*productionWrite/.test(access), "matriz coordinada incompleta");
  invariant(/effectivePermissions\.includes\(String\(permission\)\)/.test(access), "permiso efectivo no se aplica");

  const apiFiles = filesBelow(resolve(root, "api")).filter((path) => path.endsWith(".js"));
  for (const absolute of apiFiles) {
    const path = relative(root, absolute).replaceAll("\\", "/");
    const source = read(path);
    if (path !== "api/_lib/crmPipelineAccess.js") {
      for (const name of CONFIG_NAMES) invariant(!source.includes(`env.${name}`) && !source.includes(`process.env.${name}`), `${path} interpreta ${name} fuera del resolver único`);
    }
  }

  const actualRoutes = apiFiles.map((path) => relative(root, path).replaceAll("\\", "/")).filter((path) => path.startsWith("api/crm/")).sort();
  invariant(JSON.stringify(actualRoutes) === JSON.stringify([...CRM_ROUTES].sort()), "inventario de siete rutas CRM cambió");
  for (const path of CRM_ROUTES) {
    const source = read(path);
    invariant(/crmPipeline(?:Access|Read)|pipelineCaseMutationHttp/.test(source), `${path} omite compuerta central`);
    invariant(!/(?:process\.)?env\.VERCEL_(?:ENV|GIT_COMMIT_REF)/.test(source), `${path} interpreta autoridad Vercel fuera del resolver`);
    invariant(!/x-osi-(?:role|userid)|req\.(?:query|body)[^\n]*(?:tenantId|membershipId|role|permissions)/i.test(source), `${path} acepta autoridad del navegador`);
  }
  for (const path of CRM_ROUTES.slice(0, 3)) {
    const source = read(path);
    const gate = source.indexOf("requireCrmPipelineReadOnly(env)");
    const method = source.indexOf('req.method !== "GET"');
    const auth = source.indexOf("requirePermission(req");
    invariant(gate >= 0 && method > gate && auth > method, `${path} viola orden gate/método/auth`);
  }
  const adapter = read("api/_lib/pipelineCaseMutationHttp.js");
  invariant(adapter.indexOf("requireCrmPipelineMutationsLocal(env)") < adapter.indexOf('req.method !== "POST"')
    && adapter.indexOf('req.method !== "POST"') < adapter.indexOf("resolveContext(req"), "mutaciones violan orden gate/método/auth");

  const srcFiles = filesBelow(resolve(root, "src")).filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const absolute of srcFiles) {
    const path = relative(root, absolute).replaceAll("\\", "/");
    const source = read(path);
    invariant(!/api\/crm|crmPipelineAccess|CRM_PIPELINE_(?:RUNTIME|MUTATION|ACTIVATION)/.test(source), `${path} conecta frontend CRM`);
  }
  for (const [path, source] of Object.entries(extraSources)) {
    if (path.startsWith("src/")) invariant(!/api\/crm|crmPipelineAccess|CRM_PIPELINE_/.test(source), `${path} conecta frontend CRM`);
  }

  for (const path of [".env.example", "vercel.json", "package.json", ".github/workflows/ci.yml"]) {
    const source = read(path);
    invariant(!/CRM_PIPELINE_(?:RUNTIME_MODE|MUTATION_MODE|ACTIVATION_BATCH)\s*[:=]\s*["']?(?:READ_ONLY|LOCAL_ONLY|PRODUCTION_READ|PRODUCTION_WRITE|CRM-01B3B1)/.test(source), `${path} activa CRM`);
  }
  invariant(!/VITE_CRM_PIPELINE_ACTIVATION_BATCH/.test(access), "batch CRM no puede entrar al frontend");
  invariant(env.CRM_PIPELINE_RUNTIME_MODE === undefined || env.CRM_PIPELINE_RUNTIME_MODE === "DISABLED", "lectura CRM activa en validación");
  invariant(env.CRM_PIPELINE_MUTATION_MODE === undefined || env.CRM_PIPELINE_MUTATION_MODE === "DISABLED", "mutación CRM activa en validación");
  invariant(env.CRM_PIPELINE_ACTIVATION_BATCH === undefined, "batch CRM residual en validación");
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY") === "LEGACY", "LEGACY debe permanecer activo");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false") === "false", "tenant switch debe permanecer desactivado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false") === "false", "cliente V2 debe permanecer desactivado");

  const canonical = read("scripts/run-canonical-db-tests.mjs");
  for (const suite of ["crm-01b3b1-gate-test.mjs", "validate-crm-01b3b1-guard.mjs", "validate-crm-01b3b1-guard-test.mjs", "crm-01a-test.mjs", "crm-01b3a-integration-test.mjs"]) {
    invariant(canonical.includes(suite), `runner canónico no exige ${suite}`);
  }
  return Object.freeze({ ok: true, migrations: 16, routes: 7, readMode: "DISABLED", mutationMode: "DISABLED", frontendConsumers: 0 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateCrm01b3b1Guard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
