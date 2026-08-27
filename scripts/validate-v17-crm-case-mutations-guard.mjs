import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION = "20260824010000_v17_client_public_ref_case_mutations";
const fail = (message) => { throw new Error(`V17_CRM_CASE_MUTATIONS_GUARD:${message}`); };
const requireMatch = (text, pattern, message) => { if (!pattern.test(text)) fail(message); };

function hasIdentifierOutsideLiterals(source, expected) {
  let index = 0;
  const identifierStart = /[A-Za-z_$]/;
  const identifierPart = /[A-Za-z0-9_$]/;

  function skipQuoted(quote) {
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
      } else if (source[index] === quote) {
        index += 1;
        return;
      } else {
        index += 1;
      }
    }
  }

  function skipLineComment() {
    index += 2;
    while (index < source.length && source[index] !== "\n") index += 1;
  }

  function skipBlockComment() {
    index += 2;
    while (index < source.length) {
      if (source[index] === "*" && source[index + 1] === "/") {
        index += 2;
        return;
      }
      index += 1;
    }
  }

  function scanTemplate() {
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
      } else if (source[index] === "`") {
        index += 1;
        return false;
      } else if (source[index] === "$" && source[index + 1] === "{") {
        index += 2;
        if (scanCode(true)) return true;
      } else {
        index += 1;
      }
    }
    return false;
  }

  function scanCode(stopAtTemplateExpression) {
    let braces = 0;
    while (index < source.length) {
      const character = source[index];
      const next = source[index + 1];
      if (character === "/" && next === "/") {
        skipLineComment();
        continue;
      }
      if (character === "/" && next === "*") {
        skipBlockComment();
        continue;
      }
      if (character === "\"" || character === "'") {
        skipQuoted(character);
        continue;
      }
      if (character === "`") {
        if (scanTemplate()) return true;
        continue;
      }
      if (stopAtTemplateExpression && character === "{") {
        braces += 1;
        index += 1;
        continue;
      }
      if (stopAtTemplateExpression && character === "}") {
        if (braces === 0) {
          index += 1;
          return false;
        }
        braces -= 1;
        index += 1;
        continue;
      }
      if (identifierStart.test(character)) {
        const start = index;
        index += 1;
        while (index < source.length && identifierPart.test(source[index])) index += 1;
        if (source.slice(start, index) === expected) return true;
        continue;
      }
      index += 1;
    }
    return false;
  }

  return scanCode(false);
}

function assertNoLegacyClientNameAuthority(source, message) {
  if (hasIdentifierOutsideLiterals(source, "clientName")) fail(message);
}

export function validateV17CrmCaseMutationsGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (migrations.length !== 21 || !migrations.includes(MIGRATION) || !migrations.includes("20260827010000_v17_tenant_membership_public_ref")
    || migrations.at(-1) !== "20260827020000_v17_admin_identity_invitation") fail("cadena canónica distinta de 21 o migración 21 no es la última");

  const schema = read("prisma/schema.prisma");
  const migration = read(`prisma/migrations/${MIGRATION}/migration.sql`);
  requireMatch(schema, /model Client\s*\{[\s\S]*publicRef\s+String\s+@default\(dbgenerated\("gen_random_uuid\(\)"\)\)\s+@map\("public_ref"\)\s+@db\.Uuid[\s\S]*@@unique\(\[tenantId, publicRef\],\s*map:\s*"osi_clients_tenant_id_public_ref_key"\)/, "Client.publicRef tenant-first ausente");
  const pipelineCase = schema.match(/model PipelineCase\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  requireMatch(pipelineCase, /caseCode\s+String\s*\n[\s\S]*@@unique\(\[tenantId, caseCode\],\s*map:\s*"osi_pipeline_cases_tenant_id_case_code_key"\)/, "caseCode tenant-first ausente");
  if (/caseCode\s+String[^\n]*@unique/.test(pipelineCase)) fail("caseCode conserva unicidad global incompatible");
  for (const value of ["CREATE", "UPDATE"]) requireMatch(schema, new RegExp(`enum PipelineCaseCommandType[\\s\\S]*\\b${value}\\b`), `comando ${value} ausente`);
  requireMatch(migration, /UPDATE\s+"osi"\."osi_clients"\s+SET\s+"public_ref"\s*=\s*gen_random_uuid\(\)\s+WHERE\s+"public_ref"\s+IS NULL/i, "backfill técnico exacto ausente");
  if (/UPDATE\s+"osi"\."osi_pipeline_cases"|DELETE\s+FROM|TRUNCATE/i.test(migration)) fail("migración modifica datos empresariales");
  if (!migration.includes('BEFORE UPDATE OF "public_ref"') || !migration.includes("Client.publicRef is immutable")) fail("inmutabilidad Client.publicRef ausente");

  const rbac = read("api/_lib/rbac.js");
  for (const code of ["pipeline:create", "pipeline:update:own", "pipeline:update:any"]) {
    if (!rbac.includes(`"${code}"`)) fail(`permiso explícito ausente: ${code}`);
  }
  requireMatch(rbac, /EXPLICIT_PIPELINE_MUTATION_PERMISSIONS[\s\S]*Object\.values\(PERMS\)\.filter/, "A recibe mutaciones por rol baseline");
  const roleBlock = rbac.match(/const ROLE_PERMS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || "";
  if (/V:\s*\[[\s\S]*?PIPELINE_(?:CREATE|UPDATE_OWN|UPDATE_ANY)/.test(roleBlock)) fail("V recibe mutaciones por rol baseline");

  const http = read("api/_lib/crmCaseMutationHttp.js");
  const handler = http.slice(http.indexOf("return withCommonHeaders"));
  const gate = handler.indexOf("gate(env, req)");
  const auth = handler.indexOf("resolveCrmPipelineContext(req");
  const body = handler.indexOf("readJsonObject(req");
  if (gate < 0 || auth < gate || body < auth) fail("orden gate -> auth -> body inválido");
  requireMatch(http, /mode === CRM_PIPELINE_MUTATION_MODES\.LOCAL_ONLY[\s\S]*!isRealLoopbackRequest\(req\)/, "LOCAL_ONLY no exige socket loopback real");
  requireMatch(http, /mode !== CRM_PIPELINE_MUTATION_MODES\.LOCAL_ONLY[\s\S]*mode !== CRM_PIPELINE_MUTATION_MODES\.PREVIEW_REHEARSAL/, "handler admite un modo distinto de local o Preview exacto");
  requireMatch(http, /setCrmPrivateHeaders\(res\)/, "headers privados ausentes");

  const domain = read("api/_lib/crmCaseMutationDomain.js");
  for (const signature of [
    "pg_try_advisory_xact_lock", "PipelineCaseCommandType", "appendCommercialAudit", "expectedVersion",
    "CRM_PIPELINE_IDEMPOTENCY_CONFLICT", "CRM_PIPELINE_VERSION_CONFLICT", "NEW_INBOX",
  ]) if (!domain.includes(signature)) fail(`dominio incompleto: ${signature}`);
  requireMatch(domain, /WHERE c\."tenant_id"=\$\{tenantId\} AND c\."id"=\$\{id\}/, "lectura de resultado no es tenant-first");
  requireMatch(domain, /input\.payloadHash !== hashCrmCaseMutation\(payload\)/, "payloadHash no se recalcula canónicamente en servidor");
  requireMatch(domain, /m\."tenant_id"=\$\{tenantId\} AND m\."id"=\$\{membershipId\} AND m\."user_id"=\$\{userId\}/, "actor no revalida User, Membership y Tenant");
  requireMatch(domain, /WHERE "tenant_id"=\$\{who\.tenantId\} AND "public_ref"=CAST\(\$\{ref\} AS uuid\)/, "PATCH no resuelve tenant/publicRef");
  requireMatch(domain, /who\.role === "V"[\s\S]*owner_membership_id !== who\.membershipId[\s\S]*owner_user_id !== who\.userId/, "V no queda limitado al owner completo");

  const listRoute = read("api/crm/pipeline-cases/index.js");
  const detailRoute = read("api/crm/pipeline-cases/[caseKey]/index.js");
  requireMatch(listRoute, /method:\s*"POST"[\s\S]*createCrmPipelineCase/, "POST crear no delega al dominio");
  requireMatch(detailRoute, /method:\s*"PATCH"[\s\S]*updateCrmPipelineCase/, "PATCH editar no delega al dominio");
  for (const source of [listRoute, detailRoute]) if (/req\.body|clientId|ownerMembershipId|ownerUserId/.test(source)) fail("ruta interpreta autoridad o IDs internos");

  const clientOptions = `${read("api/_lib/crmClientOptions.js")}\n${read("api/crm/client-options.js")}`;
  requireMatch(clientOptions, /tenantId:\s*String\(tenantId\)[\s\S]*select:\s*\{\s*publicRef:\s*true,\s*name:\s*true,\s*type:\s*true,\s*status:\s*true\s*\}/, "selector Client no es tenant-first o mínimo");
  if (/document|email|phone|clientId|tenantId:\s*true/i.test(clientOptions)) fail("selector Client expone PII o autoridad interna");

  const readDomain = read("api/_lib/crmPipelineRead.js");
  assertNoLegacyClientNameAuthority(readDomain, "lectura CRM publica, selecciona o usa fallback clientName legacy");

  const frontend = ["src/crm-relational/mutationApi.ts", "src/crm-relational/mutationAccess.ts", "src/commercial-crm/CommercialCaseForm.tsx", "src/commercial-crm/CommercialCaseDetail.tsx", "src/commercial-crm/CommercialInboxModule.tsx"].map(read).join("\n");
  if (/localStorage|sessionStorage|indexedDB|\/api\/cases|\/api\/events/.test(frontend)) fail("frontend usa fallback o persistencia empresarial");
  assertNoLegacyClientNameAuthority(frontend, "frontend consume campo DTO o fallback clientName legacy");
  if (/\b(?:clientId|tenantId|ownerMembershipId|ownerUserId|publicRef)\b/.test(frontend)) fail("frontend expone identidad interna");
  if (!["deniedPermissions", "pipeline:create", "pipeline:update:own", "pipeline:update:any"].every((value) => frontend.includes(value))) fail("frontend no aplica permisos explícitos y denies");
  requireMatch(frontend, /VITE_CRM_PIPELINE_CASE_MUTATION_MODE[\s\S]*mutation === "LOCAL_ONLY"[\s\S]*mutation === "PREVIEW_REHEARSAL"/, "UI de mutación no posee compuerta focal exacta");
  requireMatch(frontend, /mutation === undefined \|\| mutation === "DISABLED"[\s\S]*return false/, "UI de mutación no falla cerrada por defecto");

  const browserSuite = read("tests/v17-commercial-crm/commercial-inbox.spec.ts");
  requireMatch(browserSuite, /V17_CAPTURE_MUTATION_EVIDENCE === "1"/, "captura documental no exige autorización explícita");
  requireMatch(browserSuite, /CAPTURE_MUTATION_EVIDENCE && \["chromium-desktop", "chromium-mobile"\]\.includes/, "suite browser puede reescribir evidencia por defecto");

  return Object.freeze({ ok: true, migrations: 21, migration: MIGRATION, endpoints: Object.freeze(["POST /api/crm/pipeline-cases", "PATCH /api/crm/pipeline-cases/:caseRef", "GET /api/crm/client-options"]), mutationModes: Object.freeze(["LOCAL_ONLY", "PREVIEW_REHEARSAL"]), productionMutationMode: "DISABLED" });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmCaseMutationsGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
