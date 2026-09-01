import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCrm01aGuard } from "./validate-crm-01a-guard.mjs";

const root = process.cwd();
const results = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, options, pattern) {
  let error;
  try { validateCrm01aGuard({ root, ...options }); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}

try {
  const baseline = validateCrm01aGuard({ root, env: {} });
  check("estado actual DISABLED aprobado", baseline.ok && baseline.mode === "DISABLED" && baseline.routes.length === 3);
  check("OPTIONS desactivado congelado antes del wrapper", baseline.disabledOptionsGate === true);
  check("adaptadores frontend relacionales gobernados", baseline.frontendConsumers === 3 && baseline.writeEndpoints === 2 && baseline.isolatedApiRoutes === 3);
  check("pipeline:view limitado a A y V", baseline.permission === "pipeline:view" && JSON.stringify(baseline.baseRoles) === JSON.stringify(["A", "V"]));
  rejected("READ_ONLY en CI rechazado", { env: { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" } }, /READ_ONLY/);
  rejected("migración 23 rechazada", { migrations: [...Array.from({ length: 22 }, (_, index) => `m${index}`), "20260901010000_unexpected"] }, /22 migraciones/);
  const service = read("api/_lib/crmPipelineRead.js");
  rejected("clients:view como autoridad rechazado", { overrides: { "api/_lib/crmPipelineRead.js": service.replace("PERMS.PIPELINE_VIEW", '"clients:view"') } }, /pipeline:view/);
  const rbac = read("api/_lib/rbac.js");
  rejected("pipeline:view en rol K rechazado", { overrides: { "api/_lib/rbac.js": rbac.replace("  K: [", "  K: [\n    PERMS.PIPELINE_VIEW,") } }, /A y V/);
  rejected("filtro tenant eliminado rechazado", { overrides: { "api/_lib/crmPipelineRead.js": service.replace("return Object.freeze({ tenantId: String(tenantId) });", "return Object.freeze({});") } }, /owner completo/);
  rejected("owner User de V eliminado rechazado", { overrides: { "api/_lib/crmPipelineRead.js": service.replace("ownerUserId: String(userId),", "") } }, /owner completo/);
  rejected("intersección unassigned de V eliminada rechazada", { overrides: { "api/_lib/crmPipelineRead.js": service.replace("where.AND = [{ ownerMembershipId: null, ownerUserId: null }];", "where.ownerMembershipId = null; where.ownerUserId = null;") } }, /sobrescribir/);
  rejected("ownerId heredado rechazado", { overrides: { "api/_lib/crmPipelineRead.js": `${service}\nconst authority = row.ownerId;` } }, /ownerId/);
  rejected("campo interno expuesto rechazado", { overrides: { "api/_lib/crmPipelineRead.js": service.replace("publicRef: true,", "tenantId: true,\n  publicRef: true,") } }, /campos internos/);
  const list = read("api/crm/pipeline-cases/index.js");
  rejected("adaptador de lectura omitido rechazado", { overrides: { "api/crm/pipeline-cases/index.js": list.replace("createCrmPipelineReadHandler({", "({") } }, /adaptador HTTP canónico/);
  const readHttp = read("api/_lib/crmPipelineReadHttp.js");
  rejected("fixture exacta OPTIONS 204 antes del gate rechazada", { overrides: { "api/_lib/crmPipelineReadHttp.js": readHttp.replace("{ handleOptions: false }", "{ handleOptions: true }") } }, /intercepta OPTIONS/);
  rejected("compuerta posterior a OPTIONS rechazada", { overrides: { "api/_lib/crmPipelineReadHttp.js": readHttp.replace('if (req.method === "OPTIONS") return res.status(204).end();', 'if (req.method === "OPTIONS") return res.status(204).end();\n    requireCrmPipelineReadOnly(env);').replace("requireCrmPipelineReadOnly(env);", "void 0;") } }, /orden canónico/);
  rejected("headers CRM privados omitidos rechazados", { overrides: { "api/_lib/crmPipelineReadHttp.js": readHttp.replace("setCrmPrivateHeaders(res);", "") } }, /cache compartida/);
  rejected("import frontend rechazado", { extraSources: { "src/new-crm.ts": 'import "../api/_lib/crmPipelineRead.js";' } }, /frontend/);
  rejected("endpoint adicional rechazado", { extraSources: { "api/crm/write.js": 'import "../_lib/crmPipelineRead.js"; export default function() {}' } }, /fuera de las rutas/);
  const target = read("scripts/crm-01a-local-target.mjs");
  rejected("fallback DATABASE_URL rechazado", { overrides: { "scripts/crm-01a-local-target.mjs": target.replace("process.env.CRM01A_TEST_DATABASE_URL", "process.env.DATABASE_URL") } }, /fallback/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
