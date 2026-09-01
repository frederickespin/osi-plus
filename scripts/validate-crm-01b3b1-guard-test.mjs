import { readFileSync } from "node:fs";
import { validateCrm01b3b1Guard } from "./validate-crm-01b3b1-guard.mjs";

const results = [];
function check(name, condition) { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
function rejected(name, options, pattern) {
  let error;
  try { validateCrm01b3b1Guard(options); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}
const access = readFileSync("api/_lib/crmPipelineAccess.js", "utf8");
const list = readFileSync("api/crm/pipeline-cases/index.js", "utf8");
const readAdapter = readFileSync("api/_lib/crmPipelineReadHttp.js", "utf8");
const adapter = readFileSync("api/_lib/pipelineCaseMutationHttp.js", "utf8");
const domain = readFileSync("api/_lib/pipelineCaseDomain.js", "utf8");

try {
  const baseline = validateCrm01b3b1Guard({ env: {} });
  check("baseline CRM-01B3B1", baseline.ok && baseline.routes === 12 && baseline.historicalRoutes === 9 && baseline.isolatedApiRoutes === 3);
  rejected("migración 23 rechazada", { migrationNames: [...Array.from({ length: 22 }, (_, index) => `m${index}`), "20260901010000_unexpected"] }, /22 migraciones/);
  rejected("producción CRM en CI rechazada", { env: { CRM_PIPELINE_RUNTIME_MODE: "PRODUCTION_READ" } }, /lectura CRM/);
  rejected("batch residual en CI rechazado", { env: { CRM_PIPELINE_ACTIVATION_BATCH: "CRM-01B3B1-PRODUCTION-V1" } }, /batch CRM/);
  rejected("HYBRID rechazado", { env: { MT01B_AUTH_MODE: "HYBRID" } }, /LEGACY/);
  rejected("tenant switch rechazado", { env: { MT01B_TENANT_SWITCH_ENABLED: "true" } }, /tenant switch/);
  rejected("cliente V2 rechazado", { env: { VITE_MT01B2_CLIENT_ENABLED: "true" } }, /cliente V2/);
  rejected("rama main obligatoria", { overrides: { "api/_lib/crmPipelineAccess.js": access.replace('env.VERCEL_GIT_COMMIT_REF !== "main"', 'env.VERCEL_GIT_COMMIT_REF !== "feature"') } }, /resolver central/);
  rejected("batch exacto obligatorio", { overrides: { "api/_lib/crmPipelineAccess.js": access.replace("CRM-01B3B1-PRODUCTION-V1", "ANY") } }, /resolver central/);
  rejected("tenancy comercial obligatoria", { overrides: { "api/_lib/crmPipelineAccess.js": access.replace("resolveCommercialTenancyModes(env)", "({ tenantMode: true })") } }, /resolver central/);
  rejected("clasificación por claims sin verificar rechazada", { overrides: { "api/_lib/crmPipelineAccess.js": access.replace("verifyMembershipAccessToken(token)", "isMembershipAccessTokenCandidate(token)") } }, /resolver central/);
  rejected("V2 con LEGACY rechazado", { overrides: { "api/_lib/crmPipelineAccess.js": access.replace('authMode !== "MEMBERSHIP_ONLY"', 'authMode !== "LEGACY"') } }, /V2/);
  rejected("rol K en dominio rechazado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace('if (!["A", "V"].includes(role))', 'if (!["A", "V", "K"].includes(role))') } }, /roles fuera/);
  rejected("clients:view rechazado", { overrides: { "api/_lib/crmPipelineAccess.js": `${access}\nconst unsafe = "clients:view";` } }, /clients:view/);
  rejected("pipeline:update reservado", { overrides: { "api/_lib/pipelineCaseDomain.js": domain.replace("PERMS.PIPELINE_TRANSITION", "PERMS.PIPELINE_UPDATE") } }, /pipeline:update/);
  rejected("CORS wildcard rechazado", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": `${adapter}\nres.setHeader("Access-Control-Allow-Origin", "*");` } }, /CORS wildcard/);
  rejected("hook automático rechazado", { overrides: { "package.json": readFileSync("package.json", "utf8").replace('"build":', '"prebuild":"node api/crm/pipeline-cases/index.js", "build":') } }, /automáticamente/);
  rejected("interpretación fuera del resolver rechazada", { overrides: { "api/crm/pipeline-cases/index.js": `${list}\nconst mode = process.env.CRM_PIPELINE_RUNTIME_MODE;` } }, /fuera del resolver/);
  rejected("auth antes del gate rechazada", { overrides: { "api/_lib/crmPipelineReadHttp.js": readAdapter.replace("requireCrmPipelineReadOnly(env);", "void requirePermission(req); requireCrmPipelineReadOnly(env);") } }, /orden/);
  rejected("mutación antes del gate rechazada", { overrides: { "api/_lib/pipelineCaseMutationHttp.js": adapter.replace("requireCrmPipelineMutationsLocal(env);", "resolveContext(req); requireCrmPipelineMutationsLocal(env);") } }, /orden/);
  rejected("frontend CRM rechazado", { extraSources: { "src/crm-runtime.ts": 'fetch("/api/crm/pipeline-cases")' } }, /frontend/);
  rejected("activación en workflow rechazada", { overrides: { ".github/workflows/ci.yml": `${readFileSync(".github/workflows/ci.yml", "utf8")}\nenv: CRM_PIPELINE_RUNTIME_MODE=PRODUCTION_READ` } }, /activa CRM/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
