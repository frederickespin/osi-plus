import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCrm01b1Guard } from "./validate-crm-01b1-guard.mjs";

const results = [];
const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, options, pattern) {
  let error;
  try { validateCrm01b1Guard({ root, ...options }); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}

try {
  const baseline = validateCrm01b1Guard({ root });
  check("fundación inactiva aprobada", baseline.ok && baseline.migrations === 16 && baseline.approved === "FROZEN_LEGACY_AMBIGUOUS");
  rejected("migración 17 rechazada", {
    migrations: [...Array.from({ length: 16 }, (_, index) => `m${index}`), "20260801016000_unexpected"],
  }, /16 migraciones/);
  rejected("consumidor runtime rechazado", { extraSources: { "api/crm/mutate.js": "await prisma.pipelineCaseCommand.create({ data });" } }, /consumidores runtime/);
  rejected("mutación runtime rechazada", { extraSources: { "api/crm/mutate.js": "await prisma.pipelineCase.update({ where, data });" } }, /mutaciones PipelineCase/);
  const sqlPath = "prisma/migrations/20260801015000_crm01b_pipeline_mutation_authority/migration.sql";
  const sql = read(sqlPath);
  rejected("backfill de estados rechazado", { overrides: { [sqlPath]: `${sql}\nUPDATE osi.osi_pipeline_cases SET status = 'WON';\n` } }, /DML de datos/);
  rejected("APPROVED a WON rechazado", { overrides: { [sqlPath]: sql.replace("-- Cambio aditivo", "-- APPROVED se convierte en WON\n-- Cambio aditivo") } }, /APPROVED/);
  rejected("relación automática rechazada", { overrides: { [sqlPath]: `${sql}\nUPDATE osi.osi_projects SET pipeline_case_id = 'auto';\n` } }, /DML de datos/);
  rejected("CRM activado rechazado", { env: { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" } }, /CRM debe permanecer DISABLED/);
  rejected("frontend CRM rechazado", { extraSources: { "src/crm/pipelineMutation.ts": "export const lossReasonCode = 'PRICE';" } }, /frontend/);
  const target = read("scripts/crm-01b1-local-target.mjs");
  rejected("fallback DATABASE_URL rechazado", { overrides: { "scripts/crm-01b1-local-target.mjs": target.replace("process.env.CRM01B1_TEST_DATABASE_URL", "process.env.DATABASE_URL") } }, /fallback/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
