import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateV17CasePublicRefGuard, V17_CASE_PUBLIC_REF_MIGRATION } from "./validate-v17-case-public-ref-guard.mjs";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(resolve(root, "prisma/migrations", V17_CASE_PUBLIC_REF_MIGRATION, "migration.sql"), "utf8");
const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const canonicalRead = readFileSync(resolve(root, "api/_lib/crmPipelineRead.js"), "utf8");
const canonicalRuntime = { "api/_lib/crmPipelineRead.js": canonicalRead, "api/_lib/crmCaseMutationDomain.js": "const caseRef = row.public_ref;", "api/_lib/crmClientOptions.js": "const clientRef = row.publicRef;", "api/crm/pipeline-cases/[caseKey]/index.js": "findCrmPipelineCase(database, { tenantId: context.tenantId, role: context.role, membershipId: context.membershipId, userId: context.userId, caseRef: req.query?.caseKey });", "src/crm-relational/readApi.ts": "const caseRef = 'public DTO';" };
const results = [];
function mutatePipeline(mutator) {
  return schema.replace(/model PipelineCase\s*\{[\s\S]*?\n\}/, (block) => mutator(block));
}
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}
function rejected(name, overrides, expected) {
  let error;
  try { validateV17CasePublicRefGuard({ root, migrationNames: migrations, schemaSource: schema, migrationSource: sql, extraRuntimeSources: canonicalRuntime, ...overrides }); }
  catch (caught) { error = caught; }
  check(name, Boolean(error) && expected.test(error.message));
}
function withCanonicalRead(source) {
  return { extraRuntimeSources: { ...canonicalRuntime, "api/_lib/crmPipelineRead.js": source } };
}

check("baseline publicRef aprobada", validateV17CasePublicRefGuard().ok);
rejected("nullable rechazado", { schemaSource: mutatePipeline((block) => block.replace("publicRef                     String ", "publicRef                     String? ")) }, /NOT NULL|nullable/);
rejected("default PostgreSQL eliminado", { schemaSource: mutatePipeline((block) => block.replace('@default(dbgenerated("gen_random_uuid()")) ', "")) }, /default PostgreSQL/);
rejected("unicidad tenant-first eliminada", { schemaSource: mutatePipeline((block) => block.replace(/\s*@@unique\(\[tenantId, publicRef\][^\r\n]*\r?\n/, "\n")) }, /unicidad tenant-first/);
rejected("default SQL eliminado", { migrationSource: sql.replace("ALTER COLUMN \"public_ref\" SET DEFAULT pg_catalog.gen_random_uuid(),", "") }, /default o NOT NULL/);
rejected("transacción explícita eliminada", { migrationSource: sql.replace("BEGIN;", "") }, /transacción explícita/);
rejected("COMMIT prematuro rechazado", { migrationSource: sql.replace("COMMIT;", "COMMIT;\nSELECT 1;") }, /COMMIT debe cerrar/);
rejected("eventos diferidos sin drenar rechazados", { migrationSource: sql.replace("SET CONSTRAINTS ALL IMMEDIATE;", "") }, /eventos de triggers diferidos/);
rejected("inmutabilidad eliminada", { migrationSource: sql.replace('CREATE TRIGGER "osi_pipeline_cases_public_ref_immutable_trg"', 'CREATE TRIGGER "removed"') }, /trigger de inmutabilidad/);
rejected("comparación no estable rechazada", { migrationSource: sql.replace("IS DISTINCT FROM", "<>") }, /comparación inmutable/);
rejected("UPDATE de publicRef permitido rechazado", { migrationSource: sql.replace("RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_IMMUTABLE'", "RAISE NOTICE 'allowed'") }, /rechazo inmutable/);
const backfill = sql.match(/UPDATE "osi"\."osi_pipeline_cases"[\s\S]*?WHERE "public_ref" IS NULL;/)?.[0];
rejected("orden inseguro rechazado", { migrationSource: sql.replace(backfill, "").replace('ADD COLUMN "public_ref" UUID;', `${backfill}\n\nADD COLUMN "public_ref" UUID;`) }, /orden|eventos de triggers/);
rejected("CUID como fallback rechazado", { schemaSource: mutatePipeline((block) => block.replace('dbgenerated("gen_random_uuid()")', "cuid()")) }, /default PostgreSQL|Prisma no puede/);
rejected("JWT como fuente rechazado", { migrationSource: sql.replace("COMMIT;", "-- derive from JWT secret\nCOMMIT;") }, /fallback|debilitamiento/);
rejected("migración 23 rechazada", { migrationNames: [...migrations, "20260901010000_future"] }, /22 migraciones|migración 20/);
rejected("consumidor backend adicional rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/crm/public-ref.js": "const value = row.publicRef;" } }, /sólo puede consumirse/);
rejected("mutación consumidora rechazada", { extraRuntimeSources: { ...canonicalRuntime, "api/_lib/pipelineCaseMutationHttp.js": "const value = command.publicRef;" } }, /sólo puede consumirse/);
rejected("consumidor frontend rechazado", { extraRuntimeSources: { ...canonicalRuntime, "src/unsafe.ts": "const leaked = value.publicRef;" } }, /sólo puede consumirse|frontend/);
rejected("tenantId de alcance eliminado rechazado", withCanonicalRead(canonicalRead
  .replace('{ tenantId: String(tenantId) }', "{}")
  .replace("    tenantId: String(tenantId),\n    ownerMembershipId", "    ownerMembershipId")), /alcance tenant-first|tenant/);
rejected("publicRef de findFirst eliminado rechazado", withCanonicalRead(canonicalRead
  .replace("where: { ...scope, publicRef },", "where: { ...scope },")), /predicados tenant-first/);
rejected("ownerMembershipId de V eliminado rechazado", withCanonicalRead(canonicalRead
  .replace(/^\s*ownerMembershipId: String\(membershipId\),\r?\n/m, "")), /Membership y User completos/);
rejected("ownerUserId de V eliminado rechazado", withCanonicalRead(canonicalRead
  .replace(/^\s*ownerUserId: String\(userId\),\r?\n/m, "")), /Membership y User completos/);
rejected("validación UUID previa eliminada rechazada", withCanonicalRead(canonicalRead
  .replace("const publicRef = canonicalCaseRef(caseRef);", "const publicRef = String(caseRef);")), /UUID y alcance|UUID v4/);
rejected("alcance previo a Prisma eliminado rechazado", withCanonicalRead(canonicalRead
  .replace("const scope = resolveCrmPipelineReadScope({ tenantId, role, membershipId, userId });", "const scope = Object.freeze({});")), /alcance server-side|UUID y alcance/);
rejected("404 sanitizado eliminado rechazado", withCanonicalRead(canonicalRead
  .replace('if (!row) invalid("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);', 'if (!row) invalid("CRM_PIPELINE_FORBIDDEN", 403);')), /404 indistinguible/);
rejected("fallback a PK interna rechazado", withCanonicalRead(canonicalRead
  .replace("return safeCaseDetail(row, String(membershipId));", "if (!row) return prisma.pipelineCase.findUnique({ where: { id: caseRef } });\n    return safeCaseDetail(row, String(membershipId));")), /fallback|segunda consulta|PK interna/);
rejected("findFirst genérico sin alcance rechazado", withCanonicalRead(canonicalRead
  .replace("where: { ...scope, publicRef },", "where: { publicRef },")), /predicados tenant-first|únicamente por publicRef/);
rejected("alcance de ruta desde query rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/crm/pipeline-cases/[caseKey]/index.js": canonicalRuntime["api/crm/pipeline-cases/[caseKey]/index.js"].replace("tenantId: context.tenantId", "tenantId: req.query.tenantId") } }, /contexto revalidado|query/);
rejected("serializer CUID rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/_lib/crmPipelineRead.js": canonicalRead.replace("caseRef: row.publicRef", "caseRef: row.id") } }, /serializar|PK CUID/);
rejected("clientName legacy rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/_lib/crmPipelineRead.js": canonicalRead.replace("caseCode: true,", "caseCode: true,\n  clientName: true,") } }, /clientName legacy/);
rejected("búsqueda legacy de receptor rechazada", { extraRuntimeSources: { ...canonicalRuntime, "api/_lib/crmPipelineRead.js": canonicalRead.replace('{ client: { is: { name: { contains: filters.search, mode: "insensitive" } } } }', '{ clientName: { contains: filters.search, mode: "insensitive" } }') } }, /clientName legacy|Client relacional/);
rejected("alias caseNumber rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/_lib/crmPipelineRead.js": `${canonicalRead}\nconst caseNumber = "forbidden";` } }, /único caseCode/);
rejected("frontend clientName rechazado", { extraRuntimeSources: { ...canonicalRuntime, "src/crm-relational/readApi.ts": "const clientName = 'legacy'; const caseRef = 'public DTO';" } }, /frontend público/);
rejected("campo público interno rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/crm/leak.js": "res.json({ public_ref: row.value })" } }, /sólo puede consumirse/);
rejected("alias dinámico id rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/crm/pipeline-cases/[id].js": "export default function handler() {}" } }, /segmento dinámico físico único|alias ambiguo/);
rejected("segmento dinámico conflictivo rechazado", { extraRuntimeSources: { ...canonicalRuntime, "api/crm/pipeline-cases/[other]/future.js": "export default function handler() {}" } }, /segmento dinámico físico único/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
