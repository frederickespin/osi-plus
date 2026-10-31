import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateV17CasePublicRefGuard, V17_CASE_PUBLIC_REF_MIGRATION } from "./validate-v17-case-public-ref-guard.mjs";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(resolve(root, "prisma/migrations", V17_CASE_PUBLIC_REF_MIGRATION, "migration.sql"), "utf8");
const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const canonicalRead = readFileSync(resolve(root, "api/_lib/crmPipelineRead.js"), "utf8");
const baseline = validateV17CasePublicRefGuard({ root });
const canonicalRuntime = Object.fromEntries([
  ...Object.keys(baseline.consumerContracts),
  "api/crm/pipeline-cases/[caseKey]/index.js",
  "src/crm-relational/readApi.ts",
].map((path) => [path, readFileSync(resolve(root, path), "utf8")]));
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
function changeConsumer(path, before, after) {
  const source = canonicalRuntime[path];
  if (!source?.includes(before) || before === after) throw new Error("Mutación sin efecto: " + path + " / " + before);
  return { extraRuntimeSources: { ...canonicalRuntime, [path]: source.replace(before, after) } };
}

check("baseline publicRef aprobada", baseline.ok);
check("inventario distingue casos y clientes de membresías e invitaciones",
  baseline.runtimeConsumers === 25
  && baseline.consumerContracts["api/_lib/crmIcpV2ApiDomain.js"].kinds.join(",") === "CASE,CLIENT"
  && baseline.consumerContracts["api/_lib/authContext.js"].kinds.join(",") === "MEMBERSHIP"
  && baseline.consumerContracts["api/_lib/adminUserIdentityDomain.js"].kinds.join(",") === "MEMBERSHIP"
  && baseline.consumerContracts["api/_lib/adminUserEnrollmentDomain.js"].kinds.join(",") === "MEMBERSHIP"
  && baseline.consumerContracts["api/_lib/adminIdentityInvitationDomain.js"].kinds.join(",") === "INVITATION,MEMBERSHIP");
check("todos los consumidores persistentes tienen consultas verificadas",
  Object.entries(baseline.consumerContracts).every(([path, contract]) =>
    ["api/_lib/authorizationContext.js", "api/_lib/crmIcpV2Domain.js"].includes(path)
      || contract.prismaQueries + contract.sqlQueries > 0));
check("el reporte conserva el tamaño real de la cadena de migraciones", baseline.migrations === migrations.length);
check("propiedades entre comillas equivalentes conservan alcance tenant-first",
  validateV17CasePublicRefGuard({ root, ...changeConsumer("api/_lib/toolsEquipmentDomain.js",
    "where: { tenantId, publicRef: caseRef }", 'where: { "tenantId": tenantId, "publicRef": caseRef }') }).ok);
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
rejected("extensión de migraciones fuera de orden rechazada", { migrationNames: [...migrations, "20260901010000_future"] }, /22 migraciones|orden/);
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

rejected("archivo nuevo dentro de _lib no hereda la clasificación de otro dominio", {
  extraRuntimeSources: { ...canonicalRuntime, "api/_lib/costingDomainExtra.js": "tx.pipelineCase.findFirst({ where: { tenantId: context.tenantId, publicRef: caseRef } });" },
}, /sólo puede consumirse/);
rejected("un nombre aprobado sin contrato no autoriza consumir referencias", {
  extraRuntimeSources: { ...canonicalRuntime, "api/_lib/materialsInventoryDomain.js": "const caseRef = row.publicRef;" },
}, /sin contrato tenant-first verificable/);
rejected("un nuevo modelo en un consumidor conocido necesita clasificación", {
  extraRuntimeSources: { ...canonicalRuntime, "api/_lib/costingDomain.js": canonicalRuntime["api/_lib/costingDomain.js"] + "\ntx.unclassifiedEntity.findFirst({ where: { tenantId: context.tenantId, publicRef: ref } });\n" },
}, /modelo de referencia sin clasificar/);
rejected("la clasificación CASE no autoriza consultar membresías", {
  extraRuntimeSources: { ...canonicalRuntime, "api/_lib/materialsInventoryDomain.js": canonicalRuntime["api/_lib/materialsInventoryDomain.js"] + "\ntx.tenantMembership.findFirst({ where: { tenantId: context.tenantId, publicRef: ref } });\n" },
}, /modelo de referencia sin clasificar/);
rejected("una consulta adicional sin tenant falla aunque la anterior sea válida", {
  extraRuntimeSources: { ...canonicalRuntime, "api/_lib/costingDomain.js": canonicalRuntime["api/_lib/costingDomain.js"] + "\ntx.pipelineCase.findFirst({ where: { publicRef: ref } });\n" },
}, /contrato tenant-first/);

const scopedConsumers = [
  ["Portal", "api/_lib/clientTemporaryAccessDomain.js", "tenantId: who.tenantId, publicRef: assertAccessRef(caseRef)", "publicRef: assertAccessRef(caseRef)"],
  ["Relaciones cliente", "api/_lib/commercialRelationshipsDomain.js", "tenantId: context.tenantId, publicRef: input.clientRef", "publicRef: input.clientRef"],
  ["Comunicaciones", "api/_lib/communicationsDomain.js", "tenantId: context.tenantId, publicRef: normalizeCaseRef(caseRef)", "publicRef: normalizeCaseRef(caseRef)"],
  ["Costos", "api/_lib/costingDomain.js", "tenantId: context.tenantId, publicRef: caseRef", "publicRef: caseRef"],
  ["Servicios", "api/_lib/crmServicesApiDomain.js", "tenantId: who.tenantId, publicRef: serviceRef(ref)", "publicRef: serviceRef(ref)"],
  ["Survey caso", "api/_lib/crmSurveyDomain.js", "tenantId: who.tenantId, publicRef: command.caseRef", "publicRef: command.caseRef"],
  ["Survey evaluador", "api/_lib/crmSurveyDomain.js", "tenantId: who.tenantId,\n          publicRef: command.evaluatorMembershipRef", "publicRef: command.evaluatorMembershipRef"],
  ["Logística", "api/_lib/logisticsEngineDomain.js", "tenantId: context.tenantId, publicRef: caseRef", "publicRef: caseRef"],
  ["Materiales", "api/_lib/materialsInventoryDomain.js", "tenantId: context.tenantId, publicRef: input.caseRef", "publicRef: input.caseRef"],
  ["Personal", "api/_lib/personnelPoliciesDomain.js", "tenantId: who.tenantId, publicRef: command.caseRef", "publicRef: command.caseRef"],
  ["Cotización", "api/_lib/quoteDomain.js", "tenantId: context.tenantId, publicRef: caseRef", "publicRef: caseRef"],
  ["Paquetes", "api/_lib/servicePackagesDomain.js", "tenantId: who.tenantId, publicRef: caseRef", "publicRef: caseRef"],
  ["Agenda caso", "api/_lib/surveySchedulingDomain.js", "tenantId: who.tenantId, publicRef: caseRef", "publicRef: caseRef"],
  ["Agenda evaluador", "api/_lib/surveySchedulingDomain.js", "tenantId: who.tenantId,\n      publicRef: membershipRef", "publicRef: membershipRef"],
  ["Equipo caso", "api/_lib/toolsEquipmentDomain.js", "tenantId, publicRef: caseRef", "publicRef: caseRef"],
  ["Equipo membresía", "api/_lib/toolsEquipmentDomain.js", "tenantId, publicRef: membershipRef", "publicRef: membershipRef"],
  ["Opciones de cliente", "api/_lib/crmClientOptions.js", "tenantId: String(tenantId),", ""],
  ["ICP fábrica de filtro", "api/_lib/crmIcpV2ApiDomain.js", "return { tenantId, OR: matches };", "return { OR: matches };"],
];
for (const [name, path, before, after] of scopedConsumers) {
  rejected(name + " rechaza perder su predicado tenant", changeConsumer(path, before, after), /contrato tenant-first/);
}
rejected("tenant desde input no satisface el contrato", changeConsumer("api/_lib/costingDomain.js",
  "tenantId: context.tenantId, publicRef: caseRef", "tenantId: input.tenantId, publicRef: caseRef"), /contrato tenant-first/);
rejected("spread posterior desconocido no puede sobrescribir tenant", changeConsumer("api/_lib/costingDomain.js",
  "publicRef: caseRef, ...caseScope(context)", "publicRef: caseRef, ...rawScope"), /contrato tenant-first/);
rejected("comentario no rescata la pérdida de tenant", changeConsumer("api/_lib/costingDomain.js",
  "tenantId: context.tenantId, publicRef: caseRef", "/* tenantId: context.tenantId */ publicRef: caseRef"), /contrato tenant-first/);
rejected("reasignación posterior no puede eliminar aislamiento", changeConsumer("api/_lib/crmClientOptions.js",
  "  try {", "  where.tenantId = filters.tenantId;\n  try {"), /no admite reasignar tenantId/);
rejected("SQL CASE pierde tenant", changeConsumer("api/_lib/crmCaseMutationDomain.js",
  'WHERE "tenant_id"=${who.tenantId} AND "public_ref"', 'WHERE "public_ref"'), /contrato tenant-first/);
rejected("SQL CLIENT pierde tenant", changeConsumer("api/_lib/crmCaseMutationDomain.js",
  'WHERE "tenant_id"=${tenantId} AND "public_ref"', 'WHERE "public_ref"'), /contrato tenant-first/);
rejected("SQL MEMBERSHIP pierde tenant", changeConsumer("api/_lib/adminMembershipDomain.js",
  'WHERE tm."tenant_id"=${actor.tenantId} AND tm."public_ref"', 'WHERE tm."public_ref"'), /contrato tenant-first/);
rejected("SQL lista de membresías cambia AND por OR", changeConsumer("api/_lib/adminMembershipDomain.js",
  'Prisma.join(conditions, " AND ")', 'Prisma.join(conditions, " OR ")'), /contrato tenant-first/);
rejected("SQL ficha de identidad pierde empresa", changeConsumer("api/_lib/adminUserIdentityDomain.js",
  'WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"', 'WHERE tm."public_ref"'), /contrato tenant-first/);
rejected("SQL resúmenes de identidad pierde empresa", changeConsumer("api/_lib/adminUserIdentityDomain.js",
  'WHERE tm."tenant_id"=${actor.tenantId} AND tm."public_ref"', 'WHERE tm."public_ref"'), /contrato tenant-first/);
rejected("directorio de identidad no acepta tenant de filtros", changeConsumer("api/_lib/adminUserIdentityDomain.js",
  'const conditions = [Prisma.sql`tm."tenant_id"=${actor.tenantId}`]', 'const conditions = [Prisma.sql`tm."tenant_id"=${filters.tenantId}`]'), /contrato tenant-first/);
rejected("directorio de identidad no une el tenant con OR", changeConsumer("api/_lib/adminUserIdentityDomain.js",
  'Prisma.join(conditions, " AND ")', 'Prisma.join(conditions, " OR ")'), /contrato tenant-first/);
rejected("alta no recibe empresa desde el destinatario", changeConsumer("api/_lib/adminUserEnrollmentDomain.js",
  'VALUES (${membershipId},${row.tenant_id},${userId}', 'VALUES (${membershipId},${input.tenantId},${userId}'), /contrato tenant-first/);
rejected("alta conserva vínculo de hash de token", changeConsumer("api/_lib/adminUserEnrollmentDomain.js",
  'WHERE e."token_hash"=${tokenHash}', 'WHERE true'), /contrato tenant-first/);
rejected("alta no usa token sin hash como identidad", changeConsumer("api/_lib/adminUserEnrollmentDomain.js",
  'const tokenHash = hashUserEnrollmentToken(input.token);', 'const tokenHash = input.token;'), /contrato tenant-first/);
rejected("alta no acepta fila de empresa de input", changeConsumer("api/_lib/adminUserEnrollmentDomain.js",
  'const row = await activationRow(tx, tokenHash, { now, expectedTenantCode, lock: true });', 'const row = input;'), /contrato tenant-first/);
rejected("alta no omite expiración de la identidad del token", changeConsumer("api/_lib/adminUserEnrollmentDomain.js",
  ' || new Date(row.expires_at) <= now', ''), /contrato tenant-first/);
rejected("alta no desacopla empresa del token", changeConsumer("api/_lib/adminUserEnrollmentDomain.js",
  't."id"=e."tenant_id"', 'true'), /contrato tenant-first/);
rejected("SQL invitación pierde tenant", changeConsumer("api/_lib/adminIdentityInvitationDomain.js",
  'WHERE "tenant_id"=${actor.tenantId} AND "public_ref"', 'WHERE "public_ref"'), /contrato tenant-first/);
rejected("SQL invitación no acepta tenant de una entrada", changeConsumer("api/_lib/adminIdentityInvitationDomain.js",
  '${actor.tenantId}, ${email}', '${input.tenantId}, ${email}'), /contrato tenant-first/);
rejected("sesión legacy conserva vínculo Membership/Tenant", changeConsumer("api/_lib/authContext.js",
  'LEFT JOIN "osi"."tenants" t ON t."id" = tm."tenant_id"', 'LEFT JOIN "osi"."tenants" t ON true'), /contrato tenant-first/);
rejected("sesión V2 conserva vínculo de tenant", changeConsumer("api/_lib/authContext.js",
  'tm."tenant_id" = s."tenant_id" AND tm."id"', 'tm."id"'), /contrato tenant-first/);
rejected("proyección de contexto conserva empresa canónica", changeConsumer("api/_lib/authorizationContext.js",
  "tenantId: frozenTenant.id", "tenantId: membership.publicRef"), /proyección de membresía/);
rejected("SQL literal no parametrizado no obtiene permiso por nombre de archivo", {
  extraRuntimeSources: { ...canonicalRuntime, "api/_lib/costingDomain.js": canonicalRuntime["api/_lib/costingDomain.js"] + '\ntx.$queryRawUnsafe(\'SELECT "public_ref" FROM "osi"."osi_pipeline_cases"\');\n' },
}, /SQL público sin parámetros/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
