import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const MIGRATION = "20260801015000_crm01b_pipeline_mutation_authority";
const MIGRATION_HASH = "77db8b909def5731693d1c8b8e2fbe020ff31f0322b2c8a57a1e18d79fc685f8";
const ROUTES = Object.freeze({
  "api/crm/pipeline-cases/[caseKey]/transition.js": "transitionPipelineCase",
  "api/crm/pipeline-cases/[caseKey]/assign-owner.js": "assignPipelineCaseOwner",
  "api/crm/pipeline-cases/[caseKey]/unassign-owner.js": "unassignPipelineCaseOwner",
  "api/crm/pipeline-cases/[caseKey]/allowed-transitions.js": "getAllowedPipelineTransitions",
});
const POST_ROUTES = Object.freeze(Object.keys(ROUTES).filter((path) => !path.endsWith("allowed-transitions.js")));
const isIndependentFoundation = (path) =>
  path.startsWith("api/crm/services/") || path.startsWith("api/crm/survey/");
const AUTHORIZED_FRONTEND_ADAPTER = "src/crm-relational/api.ts";

function invariant(condition, message) { if (!condition) throw new Error(`CRM01B3A_GUARD: ${message}`); }
function inventory(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  invariant(result.status === 0, "inventario Git falló");
  return result.stdout.split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => existsSync(resolve(root, path)));
}

export function validateCrm01b3aGuard({ root = process.cwd(), overrides = {}, extraSources = {}, env = process.env } = {}) {
  const read = (path) => overrides[path] ?? extraSources[path] ?? readFileSync(resolve(root, path), "utf8");
  const files = inventory(root);
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  invariant((migrations.length === 22 || (migrations.length === 23 && migrations.includes("20260904010000_v17_services_tenant_first")) || (migrations.length === 24 && migrations.includes("20260904010000_v17_services_tenant_first") && migrations.includes("20260905010000_v17_survey_foundation"))) && migrations.includes("20260801020000_v17_pipeline_case_client_authority") && migrations.includes("20260821010000_v17_pipeline_case_public_ref") && migrations.includes("20260831010000_v17_crm_icp_foundation"), "se exige la base canónica y sólo las extensiones Servicios/Survey autorizadas");
  invariant(createHash("sha256").update(read(`prisma/migrations/${MIGRATION}/migration.sql`).replace(/\r\n/g, "\n")).digest("hex") === MIGRATION_HASH, "migración 16 modificada");

  const adapter = read("api/_lib/pipelineCaseMutationHttp.js");
  const access = read("api/_lib/crmPipelineAccess.js");
  const vercel = read("vercel.json");
  for (const signature of [
    'requireCrmPipelineMutationsLocal(env)', 'assertCrmAuthorizationHeader(req)',
    'readJsonObject(req, { maxBytes: BODY_MAX_BYTES', '"idempotency-key"', 'setCrmPrivateHeaders(res)',
    'withPrivateApiHeaders', '{ handleOptions: false }', '"Authorization", "Content-Type", "Idempotency-Key"',
    '["POST", "OPTIONS"]', '["GET", "HEAD", "OPTIONS"]', 'mt01bAllowedOrigins(env)',
  ]) invariant(adapter.includes(signature), `adaptador incompleto: ${signature}`);
  for (const signature of ['DISABLED: "DISABLED"', 'LOCAL_ONLY: "LOCAL_ONLY"', 'PRODUCTION_WRITE: "PRODUCTION_WRITE"', 'CRM_PIPELINE_MUTATIONS_DISABLED', 'CRM_PIPELINE_CONFIGURATION_INVALID']) {
    invariant(access.includes(signature), `resolver incompleto: ${signature}`);
  }
  invariant(/env\.CRM_PIPELINE_MUTATION_MODE[\s\S]{0,100}CRM_PIPELINE_MUTATION_MODES[\s\S]{0,100}CRM_PIPELINE_MUTATION_MODES\.DISABLED/.test(access), "DISABLED no es predeterminado");
  invariant(!/CRM_PIPELINE_MUTATION_MODE[^\n;]*(?:trim|toUpperCase|toLowerCase)\s*\(/.test(access), "modo no puede normalizarse");
  invariant(/key === "VERCEL" \|\| key\.startsWith\("VERCEL_"\)/.test(access), "LOCAL_ONLY no bloquea cualquier entorno Vercel");
  invariant(/resolveCrmPipelineModes\(env\)/.test(access) && /requireCrmPipelineMutation\(env\)/.test(adapter), "lectura coordinada obligatoria ausente");
  invariant(adapter.indexOf("requireCrmPipelineMutationsLocal(env)") < adapter.indexOf('req.method !== "POST"')
    && adapter.indexOf('req.method !== "POST"') < adapter.indexOf("resolveContext(req")
    && adapter.indexOf("resolveContext(req") < adapter.indexOf("readJsonObject(req"), "orden gate/método/auth/body incorrecto");
  invariant(!/(?:pipelineCase\.|pipelineCaseCommand\.|UPDATE\s+"osi"|INSERT\s+INTO)/i.test(adapter), "adaptador duplica persistencia del dominio");
  invariant(!/(?:TRANSITIONS|pg_try_advisory|appendCommercialAudit|resolveOwner\s*\(|validateEvidence)/.test(adapter), "adaptador duplica reglas del dominio");
  invariant(!/(?:AUTO_ASSIGN|autoassign|autoAssign|ownerMembershipId\s*=\s*context\.membershipId)/.test(adapter), "autoasignación no autorizada");
  invariant(!/Access-Control-Allow-Origin[^\n]+\*/.test(adapter), "CORS wildcard prohibido");
  invariant(!/Access-Control-Allow-Credentials/.test(adapter), "credenciales CORS no autorizadas");
  invariant(!/x-osi-(?:role|userid)/i.test(adapter), "headers x-osi no permitidos");
  invariant(/keys\.some\(\(key\) => !\["id", "caseKey"\]\.includes\(key\)\)/.test(adapter)
    && /keys\.includes\("id"\) && keys\.includes\("caseKey"\)/.test(adapter),
  "requestId/query adicional o identidad ambigua no se rechaza");
  invariant(/rawHeaderCount\(req, "idempotency-key"\)/.test(adapter), "duplicados Idempotency-Key no se detectan en rawHeaders");
  invariant(/rawHeaderCount\(request, "authorization"\)/.test(access) && /assertCrmAuthorizationHeader\(req\)/.test(adapter), "Authorization ambiguo no se detecta");
  invariant((JSON.parse(vercel).headers || []).filter((rule) => String(rule?.source || "").startsWith("/api/")).length === 0, "Vercel no puede aplicar CORS global o parcial a namespaces protegidos");
  invariant(adapter.includes("withPrivateApiHeaders"), "adaptador CRM no usa wrapper privado");
  for (const forbidden of ["tenantId", "userId", "actorUserId", "actorMembershipId", "ownerUserId", "ownerId", "role", "permissions", "requestId", "resultingVersion", "payloadHash", "statusChangedAt", "timestamps"]) {
    invariant(adapter.includes(`"${forbidden}"`), `falta protección de ${forbidden}`);
  }

  for (const [path, operation] of Object.entries(ROUTES)) {
    invariant(files.includes(path) || Object.hasOwn(extraSources, path), `falta endpoint ${path}`);
    const source = read(path);
    invariant(source.includes(operation) && source.includes("pipelineCaseMutationHttp.js"), `${path} no delega al dominio exacto`);
    invariant(!/(?:pipelineCase\.|pipelineCaseCommand\.|\$queryRaw|\$executeRaw|UPDATE|INSERT|DELETE)/i.test(source), `${path} contiene SQL o escritura directa`);
    invariant(!/(?:x-osi-role|x-osi-userid|localStorage|sessionStorage|ownerId)/.test(source), `${path} acepta autoridad heredada`);
  }
  const mutationFiles = [...files, ...Object.keys(extraSources)].filter((path, index, all) => all.indexOf(path) === index
    && /^api\/crm\/pipeline-cases\/\[caseKey\]\/(?!index\.js$).+\.js$/.test(path));
  invariant(JSON.stringify(mutationFiles.sort()) === JSON.stringify(Object.keys(ROUTES).sort()), `endpoints no autorizados: ${mutationFiles.join(", ")}`);
  invariant(POST_ROUTES.length === 3, "deben existir exactamente tres POST");
  const caseMutationRoutes = new Set([
    "api/crm/pipeline-cases/index.js",
    "api/crm/pipeline-cases/[caseKey]/index.js",
  ]);
  invariant(!files.some((path) => /^api\/crm\/.+\.(?:js|ts)$/.test(path)
    && !isIndependentFoundation(path)
    && !caseMutationRoutes.has(path)
    && /(?:PATCH|PUT|DELETE)/.test(extraSources[path] ?? read(path))), "método mutante alternativo detectado");

  const prohibitedConfigFiles = files.filter((path) => path === ".env.example" || path === "vercel.json" || path.startsWith(".github/workflows/"));
  for (const path of prohibitedConfigFiles) invariant(!read(path).includes("CRM_PIPELINE_MUTATION_MODE"), `${path} configura la compuerta`);
  for (const path of files.filter((path) => path.startsWith("src/") && /\.[cm]?[jt]sx?$/.test(path))) {
    const source = read(path);
    if (path === AUTHORIZED_FRONTEND_ADAPTER) {
      invariant(/assign-owner|unassign-owner|allowed-transitions/.test(source), `${path} no contiene el adaptador autorizado`);
    } else {
      invariant(!/pipelineCaseMutationHttp|pipelineCaseDomain|assign-owner|unassign-owner|allowed-transitions|CRM_PIPELINE_MUTATION_MODE/.test(source), `${path} conecta frontend fuera del adaptador autorizado`);
    }
  }
  for (const [path, source] of Object.entries(extraSources)) {
    if (path.startsWith("src/") && /\.[cm]?[jt]sx?$/.test(path)) {
      invariant(!/pipelineCaseMutationHttp|pipelineCaseDomain|assign-owner|unassign-owner|allowed-transitions|CRM_PIPELINE_MUTATION_MODE/.test(source), `${path} conecta frontend`);
    }
  }
  invariant(env.CRM_PIPELINE_MUTATION_MODE === undefined || env.CRM_PIPELINE_MUTATION_MODE === "DISABLED", "LOCAL_ONLY no puede configurarse en CI");
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY").toUpperCase() !== "HYBRID", "HYBRID no autorizado");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false").toLowerCase() !== "true", "tenant switch no autorizado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").toLowerCase() !== "true", "cliente V2 no autorizado");

  const canonical = read("scripts/run-canonical-db-tests.mjs");
  for (const suite of ["crm-01b3a-http-test.mjs", "crm-01b3a-integration-test.mjs", "crm-01b3a-http-stress-test.mjs", "validate-crm-01b3a-guard-test.mjs", "validate-crm-cors-guard.mjs", "validate-crm-cors-guard-test.mjs"]) {
    invariant(canonical.includes(suite), `runner canónico no exige ${suite}`);
  }
  const stress = read("scripts/crm-01b3a-http-stress-test.mjs");
  invariant(/const ROUNDS = 50;/.test(stress) && /const REQUESTS = 20;/.test(stress), "estrés HTTP debe exigir 50x20");
  invariant(/lostResponseCommits/.test(stress) && /transportLost/.test(stress), "falta escenario de respuesta perdida post-commit");
  const domain = read("api/_lib/pipelineCaseDomain.js");
  invariant(/APPROVED:\s*Object\.freeze\(\[\]\)/.test(domain) && !/APPROVED:\s*Object\.freeze\(\["WON"\]/.test(domain), "APPROVED no puede tratarse como WON");
  return Object.freeze({ ok: true, migrations: 22, mutationMode: "DISABLED", postEndpoints: 3, readEndpoints: 1, runtimeConsumers: 4, frontendConsumers: 1 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateCrm01b3aGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
