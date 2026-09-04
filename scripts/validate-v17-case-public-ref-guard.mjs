import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const V17_CASE_PUBLIC_REF_MIGRATION = "20260821010000_v17_pipeline_case_public_ref";
const V17_CLIENT_PUBLIC_REF_MIGRATION = "20260824010000_v17_client_public_ref_case_mutations";
const V17_MEMBERSHIP_PUBLIC_REF_MIGRATION = "20260827010000_v17_tenant_membership_public_ref";
const V17_ADMIN_IDENTITY_INVITATION_MIGRATION = "20260827020000_v17_admin_identity_invitation";
const V17_CRM_ICP_FOUNDATION_MIGRATION = "20260831010000_v17_crm_icp_foundation";
const PREVIOUS_MIGRATION_HASHES = Object.freeze({
  "20260801000000_production_baseline": "59a6060c78107a73cf9793da65cc5fc1a35d9d3c5e60ae37e04e5f395812bb2c",
  "20260801001000_mt01a_tenant_memberships": "015c8bd39f050f71fbe1bea0f94198091149296269fed77905bcefd23094cd44",
  "20260801002000_commercial_audit_log": "b7f2a68d769b1d3564a042d282e98e84bed9b8ceb2c5c2369c96e8d66d346206",
  "20260801003000_approval_requests": "5802a029f4e83aa4a76e8a1f753bb4ebd71449d2538d2ba20edaa37c225a782a",
  "20260801004000_risk_engine_rules_evaluations": "2575855557b64ee46166e85c61768339f08770aa6af3f18d77b5d3b62da00b08",
  "20260801005000_logistic_override_approvals": "15a864aa487a66457e39e459b4767871863c5798d76f1a607f96a628986385df",
  "20260801006000_quote_change_orders": "91cccaf3f19cebb9880fcdec880ffa8ed0e6ece1975e4b38924b5794b86b1f6c",
  "20260801007000_logistics_geography_zone_rules": "77c32308f74d6ceb9e6ef9f45856d2cfe7169f9b3162f32808208bc30adae04b",
  "20260801008000_vehicle_engine_settings": "4f61d20698ec8e61f5324f436e8012e63dc29c1e883b6e3922cc3cc9696499b3",
  "20260801009000_logistics_rate_metadata": "8852e835e027fc76d828d9a3ab2e1c40f251f817ab4f573296bb39224b425899",
  "20260801010000_crate_settings": "d834b99fe7083e5d9907a7b0c49ac6d0d3ff1f577de638e098c04ea9513f5310",
  "20260801011000_mt01b_auth_sessions": "8d707e9b93d1bd6c1d15a7feee54189bef2a55718a85fb50c57048383c37f57c",
  "20260801012000_mt01c1a_employee_profiles": "8da805f6923e7b3ef30c8cf4cd46dfddfafefe39d758023102c9eaa1b5f53131",
  "20260801013000_mt01c1b1_provisioning_persistence": "38585d10feca36a488bdee93c7056880545bf2c7fcea333736e6e36d90c46bae",
  "20260801014000_mt01c2b1_commercial_tenant_foundation": "776e0c167cb0d7561537745cced0438299dea90af1e7bc010325822519d1811b",
  "20260801015000_crm01b_pipeline_mutation_authority": "77db8b909def5731693d1c8b8e2fbe020ff31f0322b2c8a57a1e18d79fc685f8",
  "20260801020000_v17_pipeline_case_client_authority": "7ca9bb66584016879e00b9753da04521238ad164581ab6f755c73783a9feed1d",
});

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_CASE_PUBLIC_REF_GUARD: ${message}`);
}
function normalizedSha(source) {
  return createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex");
}
function modelBlock(source, name) {
  const match = source.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  invariant(match, `modelo ${name} ausente`);
  return match[1];
}
function runtimeSources(root) {
  const result = {};
  for (const namespace of ["api", "src"]) {
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) result[path.slice(root.length + 1).replaceAll("\\", "/")] = readFileSync(path, "utf8");
      }
    };
    walk(resolve(root, namespace));
  }
  return result;
}
function containsLegacyFrontendIdentifier(source) {
  return /\b(?:const|let|var)\s+(?:clientName|caseNumber)\b/.test(source)
    || /(?:\.|\{|,)\s*(?:clientName|caseNumber)\s*(?::|=|,|\})/.test(source)
    || /["'](?:clientName|caseNumber)["']\s*:/.test(source);
}

export function validateV17CasePublicRefGuard({
  root = process.cwd(), migrationNames, schemaSource, migrationSource,
  previousMigrationSources, extraRuntimeSources,
} = {}) {
  const migrations = migrationNames ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  invariant(migrations.length >= 22, "se exigen al menos 22 migraciones");
  invariant(migrations.includes(V17_CASE_PUBLIC_REF_MIGRATION), "migración 18 exacta ausente");
  invariant(migrations.includes(V17_CLIENT_PUBLIC_REF_MIGRATION), "migración 19 exacta ausente");
  invariant(migrations.includes(V17_MEMBERSHIP_PUBLIC_REF_MIGRATION), "migración 20 exacta ausente");
  invariant(migrations.includes(V17_ADMIN_IDENTITY_INVITATION_MIGRATION), "migración 21 exacta ausente");
  invariant(migrations.indexOf(V17_CRM_ICP_FOUNDATION_MIGRATION) === 21, "migración 22 ICP exacta ausente o fuera de orden");

  const schema = schemaSource ?? readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
  const sql = (migrationSource ?? readFileSync(resolve(root, "prisma/migrations", V17_CASE_PUBLIC_REF_MIGRATION, "migration.sql"), "utf8")).replaceAll("\r\n", "\n");
  const pipeline = modelBlock(schema, "PipelineCase");
  invariant(/^\s*publicRef\s+String\s+@default\(dbgenerated\("gen_random_uuid\(\)"\)\)\s+@map\("public_ref"\)\s+@db\.Uuid\s*$/m.test(pipeline), "publicRef debe ser UUID NOT NULL con default PostgreSQL");
  invariant(/@@unique\(\[tenantId, publicRef\], map: "osi_pipeline_cases_tenant_id_public_ref_key"\)/.test(pipeline), "unicidad tenant-first ausente");
  invariant(!/publicRef\s+String\?/.test(pipeline), "publicRef no puede ser nullable");
  invariant(!/(?:@default\(cuid|@default\(uuid)/.test(pipeline.match(/^\s*publicRef.*$/m)?.[0] || ""), "Prisma no puede generar publicRef");

  invariant((sql.match(/^BEGIN;$/gm) || []).length === 1 && (sql.match(/^COMMIT;$/gm) || []).length === 1,
    "la migración debe declarar una única transacción explícita");
  invariant(/^COMMIT;\s*$/.test(sql.slice(sql.lastIndexOf("COMMIT;"))), "COMMIT debe cerrar el archivo");
  invariant(/to_regprocedure\('pg_catalog\.gen_random_uuid\(\)'\)/.test(sql), "preflight de gen_random_uuid ausente");
  invariant(/ADD COLUMN "public_ref" UUID;/.test(sql), "expansión nullable UUID ausente");
  invariant(/UPDATE "osi"\."osi_pipeline_cases"\s+SET "public_ref" = pg_catalog\.gen_random_uuid\(\)\s+WHERE "public_ref" IS NULL;/m.test(sql), "backfill UUID aleatorio exacto ausente");
  invariant(/WHERE "public_ref" IS NULL;\s+\n\s*(?:--[^\n]*\n)*SET CONSTRAINTS ALL IMMEDIATE;/m.test(sql), "eventos de triggers diferidos no se drenan antes del ALTER TABLE");
  invariant(/ALTER COLUMN "public_ref" SET DEFAULT pg_catalog\.gen_random_uuid\(\),\s+ALTER COLUMN "public_ref" SET NOT NULL;/m.test(sql), "default o NOT NULL ausente");
  invariant(/ADD CONSTRAINT "osi_pipeline_cases_tenant_id_public_ref_key"\s+UNIQUE \("tenant_id", "public_ref"\)/m.test(sql), "constraint tenant-first ausente");
  invariant(/CREATE FUNCTION "osi"\."osi_prevent_pipeline_case_public_ref_change"\(\)/.test(sql), "función de inmutabilidad ausente");
  invariant(/NEW\."public_ref" IS DISTINCT FROM OLD\."public_ref"/.test(sql), "comparación inmutable incorrecta");
  invariant(/RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_IMMUTABLE'\s+USING ERRCODE = '23514'/.test(sql), "rechazo inmutable sanitizado ausente");
  invariant(/CREATE TRIGGER "osi_pipeline_cases_public_ref_immutable_trg"\s+BEFORE UPDATE OF "public_ref"/m.test(sql), "trigger de inmutabilidad ausente");
  invariant(!/(?:CREATE EXTENSION|session_replication_role|DISABLE TRIGGER|SECURITY DEFINER|id::uuid|digest\(|jwt|secret)/i.test(sql), "fallback, extensión o debilitamiento prohibido");
  invariant(!/\bEXECUTE\s+(?!FUNCTION\b)/i.test(sql), "SQL dinámico prohibido");
  invariant((sql.match(/^UPDATE\b/gm) || []).length === 1, "sólo se permite el UPDATE técnico de backfill");
  const orderedSteps = [
    "BEGIN;", "to_regprocedure('pg_catalog.gen_random_uuid()')", 'ADD COLUMN "public_ref" UUID;',
    'UPDATE "osi"."osi_pipeline_cases"', "V17_PIPELINE_CASE_PUBLIC_REF_BACKFILL_INCOMPLETE",
    'ALTER COLUMN "public_ref" SET DEFAULT', 'ADD CONSTRAINT "osi_pipeline_cases_tenant_id_public_ref_key"',
    'CREATE FUNCTION "osi"."osi_prevent_pipeline_case_public_ref_change"()',
    'CREATE TRIGGER "osi_pipeline_cases_public_ref_immutable_trg"', "COMMIT;",
  ].map((step) => sql.indexOf(step));
  invariant(orderedSteps.every((position) => position >= 0)
    && orderedSteps.every((position, index) => index === 0 || position > orderedSteps[index - 1]),
  "orden expansión/backfill/validación/default/unique/trigger/transacción incorrecto");
  const mutatedTables = [...sql.matchAll(/(?:ALTER TABLE|UPDATE)\s+"osi"\."([^"]+)"/g)].map((match) => match[1]);
  invariant(mutatedTables.length > 0 && mutatedTables.every((table) => table === "osi_pipeline_cases"), "la migración sólo puede modificar PipelineCase");

  const oldSources = previousMigrationSources ?? Object.fromEntries(Object.keys(PREVIOUS_MIGRATION_HASHES).map((name) => [name, readFileSync(resolve(root, "prisma/migrations", name, "migration.sql"), "utf8")]));
  for (const [name, expected] of Object.entries(PREVIOUS_MIGRATION_HASHES)) invariant(normalizedSha(oldSources[name] || "") === expected, `migración previa modificada: ${name}`);

  const runtime = extraRuntimeSources ?? runtimeSources(root);
  const canonicalReadPath = "api/_lib/crmPipelineRead.js";
  const authorizedPublicRefConsumers = new Set([
    canonicalReadPath,
    "api/_lib/adminIdentityInvitationDomain.js",
    "api/_lib/adminMembershipDomain.js",
    "api/_lib/crmCaseMutationDomain.js",
    "api/_lib/crmClientOptions.js",
    "api/_lib/crmIcpV2ApiDomain.js",
    "api/_lib/crmIcpV2Domain.js",
  ]);
  const publicRefConsumers = Object.entries(runtime)
    .filter(([, source]) => /\bpublicRef\b|\bpublic_ref\b/.test(source))
    .map(([path]) => path);
  invariant(publicRefConsumers.includes(canonicalReadPath)
    && publicRefConsumers.every((path) => authorizedPublicRefConsumers.has(path)),
  `publicRef sólo puede consumirse en backends canónicos tenant-first: ${publicRefConsumers.join(", ")}`);

  const canonicalRead = runtime[canonicalReadPath];
  const canonicalRefStart = canonicalRead.indexOf("function canonicalCaseRef(value)");
  const canonicalRefEnd = canonicalRead.indexOf("\nfunction ", canonicalRefStart + 1);
  const scopeStart = canonicalRead.indexOf("export function resolveCrmPipelineReadScope");
  const scopeEnd = canonicalRead.indexOf("\nfunction pipelineWhere", scopeStart + 1);
  const detailStart = canonicalRead.indexOf("export async function findCrmPipelineCase");
  const detailEnd = canonicalRead.indexOf("\nexport async function summarizeCrmPipelineCases", detailStart + 1);
  invariant(canonicalRefStart >= 0 && canonicalRefEnd > canonicalRefStart,
    "validador UUID canónico de caseRef ausente");
  invariant(scopeStart >= 0 && scopeEnd > scopeStart,
    "alcance READ server-side ausente");
  invariant(detailStart >= 0 && detailEnd > detailStart,
    "lector tenant-first de detalle ausente");
  const canonicalRef = canonicalRead.slice(canonicalRefStart, canonicalRefEnd);
  const readScope = canonicalRead.slice(scopeStart, scopeEnd);
  const detailRead = canonicalRead.slice(detailStart, detailEnd);
  invariant((canonicalRead.match(/publicRef:\s*true/g) || []).length === 3,
    "lista, detalle y Client deben seleccionar publicRef de forma explícita");
  invariant((canonicalRead.match(/caseRef:\s*row\.publicRef/g) || []).length === 2,
    "lista y detalle deben serializar publicRef exclusivamente como caseRef");
  invariant((canonicalRead.match(/caseCode:\s*row\.caseCode/g) || []).length === 2 && !/\bcaseNumber\b/.test(canonicalRead),
    "lista y detalle deben publicar un único caseCode");
  invariant(!/\bclientName\b/.test(canonicalRead),
    "clientName legacy no puede seleccionarse, buscarse ni publicarse");
  invariant((canonicalRead.match(/client:\s*\{\s*select:\s*CLIENT_SELECT\s*\}/g) || []).length === 2
    && (canonicalRead.match(/client:\s*safeClient\(row\.client\)/g) || []).length === 2,
  "lista y detalle deben proyectar exclusivamente Client relacional");
  invariant(/client:\s*\{\s*is:\s*\{\s*name:\s*\{\s*contains:\s*filters\.search/.test(canonicalRead),
    "búsqueda de receptor debe usar Client relacional");
  invariant(/typeof value !== "string"[\s\S]*PUBLIC_CASE_REF_PATTERN\.test\(value\)[\s\S]*invalid\("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404\)[\s\S]*return value/.test(canonicalRef),
    "UUID v4 canónico debe validarse como 404 antes de Prisma");
  invariant(/normalizedRole === "A"\) return Object\.freeze\(\{ tenantId: String\(tenantId\) \}\)/.test(readScope),
    "A debe conservar alcance tenant-first exacto");
  invariant(/if \(!membershipId \|\| !userId\) invalid\("COMMERCIAL_PERMISSION_FORBIDDEN", 403\)/.test(readScope)
    && /tenantId: String\(tenantId\),[\s\S]*ownerMembershipId: String\(membershipId\),[\s\S]*ownerUserId: String\(userId\)/.test(readScope),
  "V debe exigir tenant, Membership y User completos");
  const validatePosition = detailRead.indexOf("const publicRef = canonicalCaseRef(caseRef);");
  const scopePosition = detailRead.indexOf("const scope = resolveCrmPipelineReadScope({ tenantId, role, membershipId, userId });");
  const queryPosition = detailRead.indexOf("prisma.pipelineCase.findFirst({");
  invariant(validatePosition >= 0 && scopePosition > validatePosition && queryPosition > scopePosition,
    "UUID y alcance server-side deben resolverse antes de Prisma");
  invariant(/findFirst\(\{\s*where:\s*\{ \.\.\.scope, publicRef \},\s*select: CASE_DETAIL_SELECT/.test(detailRead),
    "detalle findFirst debe usar todos los predicados tenant-first autorizados");
  invariant((detailRead.match(/prisma\.pipelineCase\.(?:findFirst|findUnique)\s*\(/g) || []).length === 1,
    "detalle no puede usar fallback ni una segunda consulta de identidad");
  invariant(!/where:\s*\{\s*publicRef\b/.test(detailRead), "findFirst genérico únicamente por publicRef prohibido");
  invariant(!/where:\s*\{\s*(?:id|caseRef)\b|findUnique\s*\(|\bcaseRef:\s*(?:row\.)?id\b/.test(detailRead),
    "fallback a PK interna o CUID prohibido");
  invariant(/if \(!row\) invalid\("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404\)/.test(detailRead),
    "caso ajeno, inexistente o cross-tenant debe ser 404 indistinguible");
  invariant(!/caseRef:\s*row\.id\b|\bid:\s*row\.id\b|\bid:\s*true\b|\bcaseId\b/.test(canonicalRead),
    "PK CUID o alias interno prohibido en lectura pública");
  invariant(!/\bpublic_ref\b/.test(canonicalRead), "nombre SQL public_ref prohibido en contratos runtime");
  invariant(/PUBLIC_CASE_REF_PATTERN[\s\S]*CRM_PIPELINE_RESOURCE_NOT_FOUND/.test(canonicalRead),
    "UUID v4 canónico debe rechazarse como 404 antes de Prisma");

  const routePaths = Object.keys(runtime).filter((path) => path.startsWith("api/crm/pipeline-cases/") && /\.js$/.test(path));
  invariant(routePaths.includes("api/crm/pipeline-cases/[caseKey]/index.js"), "ruta pública [caseRef] ausente");
  const dynamicSegments = new Set(routePaths.flatMap((path) => path.match(/\[[^\]]+\]/g) || []));
  invariant(dynamicSegments.size === 1 && dynamicSegments.has("[caseKey]"),
    "Vercel exige un segmento dinámico físico único y neutral para lectura y mutaciones");
  const detailRoute = runtime["api/crm/pipeline-cases/[caseKey]/index.js"] || "";
  invariant(/req\.query\?\.caseKey/.test(detailRoute),
    "la ruta de detalle debe interpretar caseKey exclusivamente como caseRef");
  invariant(/tenantId:\s*context\.tenantId/.test(detailRoute)
    && /role:\s*context\.role/.test(detailRoute)
    && /membershipId:\s*context\.membershipId/.test(detailRoute)
    && /userId:\s*context\.userId/.test(detailRoute),
  "tenant, rol, Membership y User deben proceder del contexto revalidado server-side");
  invariant(!/(?:req\.query|req\.headers|x-osi-|localStorage|sessionStorage)[\s\S]{0,120}(?:tenantId|membershipId|userId|owner)/i.test(detailRoute),
    "query, headers o storage no pueden definir el alcance de detalle");
  invariant(!routePaths.includes("api/crm/pipeline-cases/[id].js"), "alias ambiguo [id] de lectura todavía presente");
  invariant(!Object.entries(runtime).some(([path, source]) => path.startsWith("src/") && /\bpublicRef\b|\bpublic_ref\b/.test(source)),
    "frontend debe usar únicamente caseRef");
  const protectedPublicFrontend = Object.entries(runtime)
    .filter(([path]) => path.startsWith("src/crm-relational/") || path.startsWith("src/commercial-crm/"));
  invariant(!protectedPublicFrontend.some(([, source]) => containsLegacyFrontendIdentifier(source)),
    "frontend público no puede reintroducir clientName legacy ni caseNumber");

  return Object.freeze({
    ok: true,
    migrations: 22,
    runtimeConsumers: publicRefConsumers.length,
    runtimeConsumer: canonicalReadPath,
    publicContract: "caseRef",
    atomic: true,
    immutable: true,
    tenantFirst: true,
    detailLookup: "findFirst(tenantId,publicRef,authorized-owner-scope)",
    migration: V17_CASE_PUBLIC_REF_MIGRATION,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.stdout.write(`${JSON.stringify(validateV17CasePublicRefGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
