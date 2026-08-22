import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateV17CasePublicRefGuard, V17_CASE_PUBLIC_REF_MIGRATION } from "./validate-v17-case-public-ref-guard.mjs";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(resolve(root, "prisma/migrations", V17_CASE_PUBLIC_REF_MIGRATION, "migration.sql"), "utf8");
const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, overrides, expected) {
  let error;
  try { validateV17CasePublicRefGuard({ root, migrationNames: migrations, schemaSource: schema, migrationSource: sql, extraRuntimeSources: {}, ...overrides }); }
  catch (caught) { error = caught; }
  check(name, Boolean(error) && expected.test(error.message));
}

check("baseline publicRef aprobada", validateV17CasePublicRefGuard().ok);
rejected("nullable rechazado", { schemaSource: schema.replace("publicRef                     String ", "publicRef                     String? ") }, /NOT NULL|nullable/);
rejected("default PostgreSQL eliminado", { schemaSource: schema.replace('@default(dbgenerated("gen_random_uuid()")) ', "") }, /default PostgreSQL/);
rejected("unicidad tenant-first eliminada", { schemaSource: schema.replace(/\s*@@unique\(\[tenantId, publicRef\].*\n/, "\n") }, /unicidad tenant-first/);
rejected("default SQL eliminado", { migrationSource: sql.replace("ALTER COLUMN \"public_ref\" SET DEFAULT pg_catalog.gen_random_uuid(),", "") }, /default o NOT NULL/);
rejected("transacción explícita eliminada", { migrationSource: sql.replace("BEGIN;", "") }, /transacción explícita/);
rejected("COMMIT prematuro rechazado", { migrationSource: sql.replace("COMMIT;", "COMMIT;\nSELECT 1;") }, /COMMIT debe cerrar/);
rejected("eventos diferidos sin drenar rechazados", { migrationSource: sql.replace("SET CONSTRAINTS ALL IMMEDIATE;", "") }, /eventos de triggers diferidos/);
rejected("inmutabilidad eliminada", { migrationSource: sql.replace('CREATE TRIGGER "osi_pipeline_cases_public_ref_immutable_trg"', 'CREATE TRIGGER "removed"') }, /trigger de inmutabilidad/);
rejected("comparación no estable rechazada", { migrationSource: sql.replace("IS DISTINCT FROM", "<>") }, /comparación inmutable/);
rejected("UPDATE de publicRef permitido rechazado", { migrationSource: sql.replace("RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_IMMUTABLE'", "RAISE NOTICE 'allowed'") }, /rechazo inmutable/);
const backfill = sql.match(/UPDATE "osi"\."osi_pipeline_cases"[\s\S]*?WHERE "public_ref" IS NULL;/)?.[0];
rejected("orden inseguro rechazado", { migrationSource: sql.replace(backfill, "").replace('ADD COLUMN "public_ref" UUID;', `${backfill}\n\nADD COLUMN "public_ref" UUID;`) }, /orden|eventos de triggers/);
rejected("CUID como fallback rechazado", { schemaSource: schema.replace('dbgenerated("gen_random_uuid()")', "cuid()") }, /default PostgreSQL|Prisma no puede/);
rejected("JWT como fuente rechazado", { migrationSource: sql.replace("COMMIT;", "-- derive from JWT secret\nCOMMIT;") }, /fallback|debilitamiento/);
rejected("migración 19 rechazada", { migrationNames: [...migrations, "20260821020000_future"] }, /18 migraciones|migración 19/);
rejected("consumidor runtime rechazado", { extraRuntimeSources: { "api/crm/public-ref.js": "const value = row.publicRef;" } }, /runtime prematura/);
rejected("búsqueda sólo por publicRef rechazada", { extraRuntimeSources: { "src/unsafe.ts": "pipelineCase.findUnique({ where: { publicRef } })" } }, /runtime prematura/);
rejected("exposición HTTP prematura rechazada", { extraRuntimeSources: { "api/crm/detail.js": "res.json({ public_ref: row.value })" } }, /runtime prematura/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
