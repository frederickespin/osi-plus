import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL_MIGRATIONS } from "./canonical-migrations.mjs";
import { validateV17CaseClientGuard, V17_CASE_CLIENT_MIGRATION } from "./validate-v17-case-client-guard.mjs";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, overrides, pattern) {
  let error;
  try { validateV17CaseClientGuard(overrides); } catch (caught) { error = caught; }
  check(name, Boolean(error) && pattern.test(error.message));
}

const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
const sql = readFileSync(resolve("prisma/migrations", V17_CASE_CLIENT_MIGRATION, "migration.sql"), "utf8");
const migrations = [...CANONICAL_MIGRATIONS];
const inventoryFailure = new RegExp(`${CANONICAL_MIGRATIONS.length} migraciones canónicas`);

try {
  check("baseline V17 aprobada", validateV17CaseClientGuard().ok);
  rejected("migración adicional desconocida rechazada", { migrationNames: [...migrations, "20260901010000_v17_forbidden"] }, inventoryFailure);
  rejected("cadena incompleta rechazada", { migrationNames: migrations.slice(0, -1) }, inventoryFailure);
  rejected("reemplazo desconocido con cardinalidad intacta rechazado", { migrationNames: [...migrations.slice(0, -1), "20260901010000_v17_forbidden"] }, inventoryFailure);
  rejected("clientId obligatorio rechazado", { schemaSource: schema.replace("clientId                      String?", "clientId                      String ") }, /nullable/);
  rejected("Project.clientId nullable rechazado", { schemaSource: schema.replace(/(model Project\s*\{[\s\S]*?\n\s*clientId\s+)String(\s*)/, "$1String?$2") }, /Project\.clientId/);
  rejected("CHECK previo contra tenantId NULL es obligatorio", { projectAuthorityMigrationSource: "SELECT 1;" }, /migración 16/);
  rejected("default clientId rechazado", { schemaSource: schema.replace(/model PipelineCase\s*\{[\s\S]*?\n\}/, (block) => block.replace('@map("client_id")', '@default("forced") @map("client_id")')) }, /nullable/);
  rejected("backfill rechazado", { migrationSource: `${sql}\nUPDATE "osi"."osi_pipeline_cases" SET "client_id" = 'forced';\n` }, /DML/);
  rejected("inferencia textual rechazada", { migrationSource: `${sql}\n-- infer by email similarity\n` }, /inferencia/);
  rejected("consumer runtime rechazado", { extraRuntimeSources: { "api/v17-case-client.js": "await prisma.pipelineCase.update({ data: { clientId } });" } }, /consumidores runtime/);
  rejected("endpoint nuevo rechazado", { extraRuntimeSources: { "api/v17-case-client.js": "const authority = 'PipelineCaseServiceClient';" } }, /consumidores runtime/);
  rejected("cambio de status rechazado", { migrationSource: `${sql}\nUPDATE "osi"."osi_pipeline_cases" SET "status" = 'NEW_INBOX';\n` }, /DML/);
  rejected("ServiceCase rechazado", { migrationSource: `${sql}\n-- ServiceCase\n` }, /alcance/);
  rejected("pagador automático rechazado", { migrationSource: `${sql}\n-- payer authority\n` }, /alcance/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, passed: results.filter((item) => item.passed).length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.length, passed: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
