import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCrm01b1Guard } from "./validate-crm-01b1-guard.mjs";
import { validateCrm01b1CatalogSummary } from "./crm-01b1-sql-drift-baseline.mjs";

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

function rejectedCatalog(name, catalog, pattern) {
  let error;
  try { validateCrm01b1CatalogSummary(catalog); } catch (caught) { error = caught; }
  check(name, pattern.test(String(error?.message || "")));
}

try {
  const baseline = validateCrm01b1Guard({ root });
  check("fundación inactiva aprobada", baseline.ok && baseline.migrations === 20 && baseline.approved === "FROZEN_LEGACY_AMBIGUOUS");
  rejected("migración 21 rechazada", {
    migrations: [...Array.from({ length: 20 }, (_, index) => `m${index}`), "20260828010000_unexpected"],
  }, /20 migraciones/);
  rejected("consumidor runtime rechazado", { extraSources: { "api/crm/mutate.js": "await prisma.pipelineCaseCommand.create({ data });" } }, /consumidores runtime/);
  rejected("mutación runtime rechazada", { extraSources: { "api/crm/mutate.js": "await prisma.pipelineCase.update({ where, data });" } }, /mutaciones PipelineCase/);
  const sqlPath = "prisma/migrations/20260801015000_crm01b_pipeline_mutation_authority/migration.sql";
  const sql = read(sqlPath);
  rejected("backfill de estados rechazado", { overrides: { [sqlPath]: `${sql}\nUPDATE osi.osi_pipeline_cases SET status = 'WON';\n` } }, /DML de datos/);
  rejected("APPROVED a WON rechazado", { overrides: { [sqlPath]: sql.replace("-- Cambio aditivo", "-- APPROVED se convierte en WON\n-- Cambio aditivo") } }, /APPROVED/);
  rejected("checksum de migración congelado", { overrides: { [sqlPath]: sql.replace("-- CRM-01B1", "-- CRM-01B1 auditada") } }, /checksum/);
  rejected("relación automática rechazada", { overrides: { [sqlPath]: `${sql}\nUPDATE osi.osi_projects SET pipeline_case_id = 'auto';\n` } }, /DML de datos/);
  rejected("trigger de coherencia journal/caso congelado", {
    overrides: { [sqlPath]: sql.replace("pipeline_case_commands_validate_case_state_trigger", "pipeline_case_commands_validation_removed") },
  }, /validación inmediata/);
  rejected("constraint trigger de caso congelado", {
    overrides: { [sqlPath]: sql.replace("pipeline_cases_coherent_command_constraint", "pipeline_cases_constraint_removed") },
  }, /protección diferida/);
  rejected("search_path seguro congelado", {
    overrides: { [sqlPath]: sql.replaceAll("SET search_path = pg_catalog, osi", "SET search_path = osi") },
  }, /search_path seguro/);
  rejected("journal fuera de fixture autorizado rechazado", {
    extraSources: { "scripts/crm-01b1-unauthorized.mjs": "await prisma.pipelineCaseCommand.create({ data });" },
  }, /fuera de fixtures/);
  rejected("CRM activado rechazado", { env: { CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY" } }, /CRM debe permanecer DISABLED/);
  rejected("frontend CRM rechazado", { extraSources: { "src/crm/pipelineMutation.ts": "export const lossReasonCode = 'PRICE';" } }, /frontend/);
  const target = read("scripts/crm-01b1-local-target.mjs");
  rejected("fallback DATABASE_URL rechazado", { overrides: { "scripts/crm-01b1-local-target.mjs": target.replace("process.env.CRM01B1_TEST_DATABASE_URL", "process.env.DATABASE_URL") } }, /fallback/);
  const workflow = read(".github/workflows/ci.yml");
  rejected("baseline SQL-only obligatoria en CI", {
    overrides: { ".github/workflows/ci.yml": workflow.replace("node scripts/crm-01b1-sql-drift-baseline.mjs", "echo baseline-removed") },
  }, /CI no exige baseline/);
  rejectedCatalog("objeto agregado a baseline rechazado", {
    count: 4287,
    sha256: "4ecc54d31708c31c32930273eca91800185b62761ce5b310ed0aa3d195c5ba57",
    categories: {},
  }, /conteo total/);
  rejectedCatalog("definición cambiada en baseline rechazada", {
    count: 4286,
    sha256: "0".repeat(64),
    categories: {},
  }, /firma total/);
  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
