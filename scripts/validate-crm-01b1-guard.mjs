import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = "20260801015000_crm01b_pipeline_mutation_authority";
const EXPECTED_MIGRATIONS = 16;
const RUNTIME_SERVICE_ALLOWLIST = Object.freeze([]);
const JOURNAL_FIXTURE_ALLOWLIST = Object.freeze([
  "scripts/crm-01b1-test.mjs",
  "scripts/crm-01b1-concurrency-test.mjs",
  "scripts/crm-01a-test.mjs",
  "scripts/validate-crm-01b1-guard-test.mjs",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`CRM01B1_GUARD: ${message}`);
}

function repositoryFiles(root) {
  const run = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  invariant(run.status === 0, run.stderr || "no se pudo inventariar el repositorio");
  return run.stdout.split("\0").filter(Boolean).map((file) => file.replaceAll("\\", "/"));
}

export function validateCrm01b1Guard({
  root = process.cwd(),
  migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
  overrides = {},
  extraSources = {},
  env = process.env,
} = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  invariant(migrations.length === EXPECTED_MIGRATIONS, `se requieren exactamente ${EXPECTED_MIGRATIONS} migraciones`);
  invariant(migrations.filter((name) => name === MIGRATION).length === 1, "la migración 16 exacta debe existir una sola vez");
  invariant(!migrations.some((name) => /^20260801016000_/.test(name)), "migración 17 no autorizada");

  const sqlPath = `prisma/migrations/${MIGRATION}/migration.sql`;
  const sql = read(sqlPath);
  const schema = read("prisma/schema.prisma");
  invariant(!sql.includes("\0"), "migration.sql contiene NUL");
  invariant(!/^\s*(?:DELETE|TRUNCATE|INSERT|UPDATE)\s/im.test(sql), "la migración contiene DML de datos");
  invariant(!/\b(?:RENAME\s+(?:COLUMN|TABLE|TYPE)|DROP\s+(?:TABLE|COLUMN|TYPE))\b/i.test(sql), "la migración contiene DDL destructivo o renombre");
  invariant(!/APPROVED[\s\S]{0,120}(?:WON|UPDATE)|(?:WON|UPDATE)[\s\S]{0,120}APPROVED/i.test(sql), "APPROVED no puede reinterpretarse como WON");
  for (const value of ["QUOTE_DRAFT", "WON", "LOST"]) invariant(sql.includes(`'${value}'`), `falta estado ${value}`);
  for (const value of ["TRANSITION", "REOPEN", "ASSIGN_OWNER", "UNASSIGN_OWNER"]) invariant(sql.includes(`'${value}'`), `falta comando ${value}`);
  for (const value of ["SURVEY", "QUOTE", "PROJECT", "APPROVAL", "ADDENDUM"]) invariant(sql.includes(`'${value}'`), `falta evidencia ${value}`);
  for (const value of ["PRICE", "COMPETITOR", "NO_RESPONSE", "CLIENT_CANCELLED", "TIMING", "SERVICE_UNAVAILABLE", "DUPLICATE", "OTHER"]) {
    invariant(sql.includes(`'${value}'`), `falta motivo de pérdida ${value}`);
  }
  invariant(/"version"\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/i.test(sql), "version no inicia explícitamente en uno");
  invariant(/"resulting_version"\s*=\s*"expected_version"\s*\+\s*1/i.test(sql), "cada comando debe incrementar version exactamente una vez");
  invariant((sql.match(/(?:previous_status|resulting_status)"::text\s*<>\s*'APPROVED'/g) || []).length >= 2, "APPROVED no está congelado para TRANSITION");
  invariant(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+"osi"\."pipeline_case_commands"/i.test(sql), "journal no es append-only");
  invariant(/CREATE TRIGGER "pipeline_case_commands_validate_case_state_trigger"[\s\S]*AFTER INSERT ON "osi"\."pipeline_case_commands"[\s\S]*pipeline_case_commands_validate_case_state/i.test(sql), "falta validación inmediata journal/caso");
  invariant(/CREATE CONSTRAINT TRIGGER "pipeline_cases_coherent_command_constraint"[\s\S]*AFTER UPDATE ON "osi"\."osi_pipeline_cases"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*pipeline_cases_require_coherent_command/i.test(sql), "falta protección diferida de campos gobernados");
  invariant(/COUNT\(\*\)[\s\S]*"expected_version" = OLD\."version"[\s\S]*"resulting_version" = NEW\."version"[\s\S]*matching_count <> 1/i.test(sql), "la mutación no exige exactamente un comando coherente");
  invariant((sql.match(/SET search_path = pg_catalog, osi/g) || []).length >= 3, "funciones de trigger sin search_path seguro");
  invariant(/previous_status"::text = 'APPROVED'[\s\S]*resulting_status"::text = 'APPROVED'[\s\S]*APPROVED is frozen/i.test(sql), "APPROVED no está congelado para todos los comandos");
  invariant(/command_type" = 'REOPEN'[\s\S]*resulting_status"::text <> 'NEW_INBOX'/i.test(sql), "REOPEN no exige NEW_INBOX");
  invariant(/command_type" IN \([\s\S]*'TRANSITION'[\s\S]*'REOPEN'[\s\S]*status_changed_at" IS NULL[\s\S]*EXTRACT\(EPOCH/i.test(sql), "TRANSITION/REOPEN no validan tiempo transaccional");
  invariant(/UNIQUE\s*\("tenant_id",\s*"request_id"\)/i.test(sql), "falta idempotencia tenant/requestId");
  invariant(/UNIQUE\s*\("tenant_id",\s*"pipeline_case_id",\s*"resulting_version"\)/i.test(sql), "falta unicidad por versión resultante");
  invariant(/FOREIGN KEY\s*\("tenant_id",\s*"pipeline_case_id"\)[\s\S]*ON DELETE RESTRICT ON UPDATE CASCADE/i.test(sql), "Project/PipelineCase no tiene FK compuesta restrict/cascade");
  invariant(/CREATE INDEX "osi_projects_tenant_id_pipeline_case_id_idx"[\s\S]*\("tenant_id",\s*"pipeline_case_id"\)/i.test(sql), "falta índice tenant-first Project/PipelineCase");
  invariant(/model PipelineCaseCommand\s*\{/.test(schema), "falta PipelineCaseCommand en Prisma");
  invariant(/version\s+Int\s+@default\(1\)/.test(schema), "falta version en PipelineCase");
  invariant(/pipelineCaseId\s+String\?\s+@map\("pipeline_case_id"\)/.test(schema), "falta Project.pipelineCaseId nullable");
  invariant(!/updatedAt[\s\S]{0,80}(?:version|expectedVersion|resultingVersion)|(?:version|expectedVersion|resultingVersion)[\s\S]{0,80}updatedAt/i.test(sql), "updatedAt no puede usarse como versión");

  const files = repositoryFiles(root);
  const runtime = files.filter((file) => /^(?:api|src)\/.+\.(?:[cm]?[jt]sx?)$/.test(file));
  const runtimeConsumers = [];
  const runtimeMutations = [];
  const frontendChanges = [];
  const unauthorizedJournalFixtures = [];
  for (const path of runtime) {
    const source = extraSources[path] ?? read(path);
    if (/(?:PipelineCaseCommand|pipelineCaseCommand|pipeline_case_commands)/.test(source) && !RUNTIME_SERVICE_ALLOWLIST.includes(path)) runtimeConsumers.push(path);
    if (/pipelineCase\s*\.\s*(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(source)) runtimeMutations.push(path);
    if (path.startsWith("src/") && /(?:PipelineCaseCommand|QUOTE_DRAFT|lossReasonCode|statusChangedAt)/.test(source)) frontendChanges.push(path);
  }
  const scripts = files.filter((file) => /^scripts\/.+\.mjs$/.test(file));
  for (const path of scripts) {
    if (JOURNAL_FIXTURE_ALLOWLIST.includes(path)) continue;
    const source = extraSources[path] ?? read(path);
    if (/pipelineCaseCommand\s*\.\s*(?:create|createMany)\s*\(/.test(source)) unauthorizedJournalFixtures.push(path);
  }
  for (const [path, source] of Object.entries(extraSources)) {
    if (!runtime.includes(path) && /^(?:api|src)\//.test(path)) {
      if (/(?:PipelineCaseCommand|pipelineCaseCommand|pipeline_case_commands)/.test(source)) runtimeConsumers.push(path);
      if (/pipelineCase\s*\.\s*(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(source)) runtimeMutations.push(path);
      if (path.startsWith("src/") && /(?:PipelineCaseCommand|QUOTE_DRAFT|lossReasonCode|statusChangedAt)/.test(source)) frontendChanges.push(path);
    }
    if (/^scripts\/.+\.mjs$/.test(path) && !JOURNAL_FIXTURE_ALLOWLIST.includes(path)
      && /pipelineCaseCommand\s*\.\s*(?:create|createMany)\s*\(/.test(source)) unauthorizedJournalFixtures.push(path);
  }
  invariant(runtimeConsumers.length === 0, `consumidores runtime no autorizados: ${runtimeConsumers.join(", ")}`);
  invariant(runtimeMutations.length === 0, `mutaciones PipelineCase fuera del futuro servicio: ${runtimeMutations.join(", ")}`);
  invariant(frontendChanges.length === 0, `cambios frontend CRM-01B1 no autorizados: ${frontendChanges.join(", ")}`);
  invariant(unauthorizedJournalFixtures.length === 0, `inserciones journal fuera de fixtures autorizados: ${unauthorizedJournalFixtures.join(", ")}`);
  invariant(env.CRM_PIPELINE_RUNTIME_MODE === undefined || env.CRM_PIPELINE_RUNTIME_MODE === "DISABLED", "CRM debe permanecer DISABLED");
  invariant(String(env.MT01B_AUTH_MODE || "LEGACY").toUpperCase() !== "HYBRID", "HYBRID permanece bloqueado");
  invariant(String(env.MT01B_TENANT_SWITCH_ENABLED || "false").toLowerCase() !== "true", "tenant switch permanece bloqueado");
  invariant(String(env.VITE_MT01B2_CLIENT_ENABLED || "false").toLowerCase() !== "true", "cliente V2 permanece bloqueado");

  const target = read("scripts/crm-01b1-local-target.mjs");
  invariant(/CRM01B1_TEST_DATABASE_URL/.test(target), "runner no usa variable exclusiva");
  invariant(!/process\.env\.(?:DATABASE_URL|DIRECT_URL)/.test(target), "runner contiene fallback general");
  invariant(/127\.0\.0\.1/.test(target) && /55432/.test(target) && /neon\.branch_id/.test(target), "runner no verifica identidad local completa");
  const dryRun = read("scripts/crm-01b1-dry-run.mjs");
  invariant(/\$transaction/.test(dryRun) && /SET TRANSACTION READ ONLY/.test(dryRun), "dry-run no demuestra transacción READ ONLY");
  invariant(!/\.(?:create|update|upsert|delete|executeRaw)\s*\(/.test(dryRun), "dry-run contiene escrituras");
  const canonical = read("scripts/run-canonical-db-tests.mjs");
  for (const suite of ["crm-01b1-concurrency-test.mjs", "crm-01b1-dry-run-fixture-test.mjs"]) {
    invariant(canonical.includes(suite), `runner canónico no exige ${suite}`);
  }
  const historicalBackfillTest = read("scripts/mt-01c2b2-test.mjs");
  invariant(/DISABLE TRIGGER "pipeline_cases_coherent_command_constraint"/.test(historicalBackfillTest)
    && /ENABLE TRIGGER "pipeline_cases_coherent_command_constraint"/.test(historicalBackfillTest)
    && /createMt01c2b2LocalPrisma/.test(historicalBackfillTest), "fixture histórico C2B2 no contiene excepción local reversible");

  return Object.freeze({
    ok: true,
    migrations: EXPECTED_MIGRATIONS,
    migration: MIGRATION,
    runtimeConsumers: 0,
    runtimeMutations: 0,
    unauthorizedJournalFixtures: 0,
    crmMode: "DISABLED",
    approved: "FROZEN_LEGACY_AMBIGUOUS",
  });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateCrm01b1Guard(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
