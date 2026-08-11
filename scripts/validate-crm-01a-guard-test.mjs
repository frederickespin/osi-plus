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
  rejected("READ_ONLY en CI rechazado", { env: { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" } }, /READ_ONLY/);
  rejected("migración 16 rechazada", { migrations: [...Array.from({ length: 15 }, (_, index) => `m${index}`), "20260801015000_crm01b"] }, /15 migraciones/);
  const service = read("api/_lib/crmPipelineRead.js");
  rejected("filtro tenant eliminado rechazado", { overrides: { "api/_lib/crmPipelineRead.js": service.replaceAll("tenantId: String(tenantId)", "id: { not: '' }") } }, /tenantId/);
  rejected("ownerId heredado rechazado", { overrides: { "api/_lib/crmPipelineRead.js": `${service}\nconst authority = row.ownerId;` } }, /ownerId/);
  rejected("campo interno expuesto rechazado", { overrides: { "api/_lib/crmPipelineRead.js": service.replace("id: true,\n  caseCode", "tenantId: true,\n  id: true,\n  caseCode") } }, /campos internos/);
  const list = read("api/crm/pipeline-cases/index.js");
  rejected("POST CRM rechazado", { overrides: { "api/crm/pipeline-cases/index.js": list.replace('req.method !== "GET"', 'req.method !== "POST"') } }, /métodos de escritura/);
  rejected("compuerta posterior a auth rechazada", { overrides: { "api/crm/pipeline-cases/index.js": list.replace("requireCrmPipelineReadOnly();", "void 0;").replace("if (!context) return;", "if (!context) return; requireCrmPipelineReadOnly();") } }, /compuerta/);
  rejected("import frontend rechazado", { extraSources: { "src/new-crm.ts": 'import "../api/_lib/crmPipelineRead.js";' } }, /frontend/);
  rejected("endpoint adicional rechazado", { extraSources: { "api/crm/write.js": 'import "../_lib/crmPipelineRead.js"; export default function() {}' } }, /fuera de las rutas/);
  const target = read("scripts/crm-01a-local-target.mjs");
  rejected("fallback DATABASE_URL rechazado", { overrides: { "scripts/crm-01a-local-target.mjs": target.replace("process.env.CRM01A_TEST_DATABASE_URL", "process.env.DATABASE_URL") } }, /fallback/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
