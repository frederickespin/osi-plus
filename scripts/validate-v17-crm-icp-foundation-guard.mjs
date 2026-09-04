import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ICP_MIGRATION = "20260831010000_v17_crm_icp_foundation";
const PRIOR_MIGRATION_HASHES = Object.freeze({
  "20260824010000_v17_client_public_ref_case_mutations": "dbb093f15eb2ee708328518dcf19e52fd8b0623fbc893cec1a001cf819a6da70",
  "20260827010000_v17_tenant_membership_public_ref": "b1284e443778ad1c7336d7703c9478ac09215b81a00f6b09bad48ceba6d5051c",
  "20260827020000_v17_admin_identity_invitation": "9ee56aaee53d5629db8dada22bcf86511d10c837c4ad61fb37fbd0b4caf53808",
});

const fail = (message) => { throw new Error(`V17_CRM_ICP_FOUNDATION_GUARD:${message}`); };
const requireMatch = (text, pattern, message) => { if (!pattern.test(text)) fail(message); };
const forbidMatch = (text, pattern, message) => { if (pattern.test(text)) fail(message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function validateV17CrmIcpFoundationGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (migrations.length < 22 || migrations.indexOf(ICP_MIGRATION) !== 21) fail("migración 22 debe conservar su posición canónica");
  for (const [migration, expected] of Object.entries(PRIOR_MIGRATION_HASHES)) {
    const path = `prisma/migrations/${migration}/migration.sql`;
    if (sha256(Buffer.from(read(path), "utf8")) !== expected) fail(`migración publicada modificada: ${migration}`);
  }

  const schema = read("prisma/schema.prisma");
  const migrationPath = `prisma/migrations/${ICP_MIGRATION}/migration.sql`;
  const migration = read(migrationPath);
  const domain = read("api/_lib/crmIcpV2Domain.js");

  const clientAddressModel = schema.match(/model ClientAddress\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  const routeSnapshotModel = schema.match(/model PipelineCaseRouteSnapshot\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  requireMatch(clientAddressModel, /addressRef\s+String[\s\S]*@db\.Uuid[\s\S]*tenantId\s+String[\s\S]*clientId\s+String[\s\S]*@@unique\(\[tenantId, addressRef\]/, "ClientAddress público tenant-first ausente");
  requireMatch(routeSnapshotModel, /routeVersion\s+Int[\s\S]*role\s+PipelineCaseRouteRole[\s\S]*stopOrder\s+Int[\s\S]*sourceAddressRef\s+String\?/, "snapshot de ruta versionado ausente");
  for (const field of ["caseContactName", "caseContactPhoneNormalized", "caseContactEmailNormalized", "intakeChannel", "clientProfileType", "routeContractVersion", "routeRevision", "destinationStatus"]) {
    requireMatch(schema, new RegExp(`model PipelineCase\\s*\\{[\\s\\S]*\\b${field}\\b`), `PipelineCase.${field} ausente`);
  }
  for (const value of ["ORIGIN", "DESTINATION", "ADDITIONAL_STOP", "CONFIRMED", "APPROXIMATE", "PENDING"]) {
    if (!schema.includes(value)) fail(`enum ICP incompleto: ${value}`);
  }
  forbidMatch(`${clientAddressModel}\n${routeSnapshotModel}`, /(?:ServiceCase|\bLocation\b|BusinessEntity)/, "ICP depende de modelos históricos");

  requireMatch(migration, /CREATE SEQUENCE "osi"\."icp_client_code_seq"[\s\S]*CREATE FUNCTION "osi"\."next_icp_client_code"/, "Client.code no usa autoridad DB concurrente");
  forbidMatch(`${migration}\n${domain}`, /\bMAX\s*\(|MAX\s*\+\s*1/i, "Client.code usa MAX+1");
  requireMatch(migration, /osi_clients_tenant_tax_id_normalized_key[\s\S]*WHERE "tenant_id" IS NOT NULL AND "tax_id_normalized" IS NOT NULL/, "RNC exacto no queda protegido tenant-first");
  requireMatch(migration, /osi_clients_tenant_phone_email_normalized_key[\s\S]*"normalizedPhone", "normalized_email"/, "teléfono+correo no quedan protegidos tenant-first");
  requireMatch(migration, /client_addresses_address_ref_immutable[\s\S]*BEFORE UPDATE OF "address_ref"/, "addressRef no es inmutable");
  requireMatch(migration, /pipeline_case_route_snapshots_immutable[\s\S]*BEFORE UPDATE OR DELETE/, "snapshots no son inmutables");
  requireMatch(migration, /pipeline_case_route_snapshots_position_check[\s\S]*BETWEEN 1 AND 8/, "límite de ocho paradas ausente");
  requireMatch(migration, /CREATE UNIQUE INDEX "pipeline_case_route_snapshots_origin_key"\s+ON[^;]+WHERE "role" = 'ORIGIN';/, "origen único por versión ausente");
  requireMatch(migration, /CREATE UNIQUE INDEX "pipeline_case_route_snapshots_destination_key"\s+ON[^;]+WHERE "role" = 'DESTINATION';/, "destino único por versión ausente");
  requireMatch(migration, /pipeline_case_route_snapshots_next_revision[\s\S]*pipeline_case_route_snapshots_before_insert/, "inserción sólo en siguiente revisión ausente");
  requireMatch(migration, /DEFERRABLE INITIALLY DEFERRED[\s\S]*pipeline_cases_validate_route_snapshot_set/, "conjunto de snapshots no se valida al commit");
  requireMatch(migration, /osi_pipeline_case_quotes_final_destination_guard[\s\S]*pipeline_case_quotes_reject_final_pending_destination/, "cotización FINAL no bloquea PENDING");
  forbidMatch(migration, /^\s*(?:UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO)\s+"osi"\."(?:osi_clients|osi_pipeline_cases)"/im, "migración infiere o reescribe datos empresariales");

  for (const signature of [
    "CREATE_ICP_V2", "CASE_CLIENT_ROUTE_COMMAND_AUDIT", "osi.next_icp_client_code", "PARTIAL_CONFIRMED",
    "CRM_ICP_PENDING_DESTINATION_FORBIDDEN", "POST_SAME_ORIGIN_READ_ONLY", "maximumAdditionalStops: 8",
  ]) if (!domain.includes(signature)) fail(`dominio ICP incompleto: ${signature}`);
  requireMatch(domain, /exactTaxId === true[\s\S]*CRM_ICP_CLIENT_DUPLICATE/, "duplicado RNC no bloquea");
  requireMatch(domain, /exactPhoneEmail === true[\s\S]*CRM_ICP_CLIENT_DUPLICATE/, "duplicado teléfono+correo no bloquea");
  requireMatch(domain, /partialMatch[\s\S]*matchFingerprint[\s\S]*auditRequired: true/, "coincidencia parcial no exige confirmación auditada");
  requireMatch(domain, /destinationStatus === "PENDING"[\s\S]*pendingDestinationAuthorized !== true/, "PENDING no exige autoridad explícita");
  requireMatch(domain, /additionalStops\.length > 8/, "dominio permite más de ocho paradas");
  requireMatch(domain, /denied\.has\("pipeline:view"\)/, "deniedPermissions no prevalece en búsqueda");
  requireMatch(domain, /maskTaxId[\s\S]*maskPhone[\s\S]*maskEmail/, "respuesta de búsqueda no enmascara PII");
  requireMatch(domain, /POST_SAME_ORIGIN_READ_ONLY[\s\S]*tenantId:[\s\S]*name[\s\S]*taxIdNormalized[\s\S]*normalizedPhone[\s\S]*normalizedEmail/, "plan de búsqueda POST tenant-first incompleto");
  forbidMatch(domain, /console\.|logger\.|req\.query|URLSearchParams/, "dominio puede registrar o colocar PII en URL");
  requireMatch(domain, /productionApiEnabled:\s*false/, "fundación habilita API productiva");

  const apiRoot = resolve(root, "api/crm");
  const routeSources = walk(apiRoot)
    .filter((path) => statSync(path).isFile() && /\.(?:js|ts)$/.test(path))
    .map((path) => ({ path: relative(root, path).split(sep).join("/"), source: overrides[relative(root, path).split(sep).join("/")] ?? readFileSync(path, "utf8") }));
  const consumers = routeSources.filter((entry) => /crmIcpV2Domain/.test(entry.source));
  if (consumers.length > 0) fail(`API ICP fue habilitada antes de autorización: ${consumers.map((entry) => entry.path).join(",")}`);
  const generalClients = read("api/clients/index.js");
  requireMatch(generalClients, /req\.method === "POST" && !requireCommercialTenancyMutation\(req, res\)/, "POST general de Client perdió su compuerta");
  forbidMatch(generalClients, /crmIcpV2Domain|next_icp_client_code/, "POST general de Client consume la autoridad inline");
  const databaseSuite = read("scripts/v17-crm-icp-foundation-db-test.mjs");
  requireMatch(databaseSuite, /V17_CRM_ICP_TEST_DATABASE_URL[\s\S]*next_icp_client_code[\s\S]*ocho paradas[\s\S]*cross-tenant[\s\S]*cotización FINAL/, "suite PostgreSQL ICP incompleta");
  forbidMatch(databaseSuite, /process\.env\.(?:DATABASE_URL|DIRECT_URL)/, "suite ICP permite fallback a una base no autorizada");
  const rollback = read("scripts/v17-crm-icp-foundation-rollback.mjs");
  requireMatch(rollback, /V17_CRM_ICP_ROLLBACK_DATABASE_URL[\s\S]*osi_v17_icp_rollback[\s\S]*ROLLBACK_DATA_PRESENT/, "rollback local no falla cerrado");
  const workflow = read(".github/workflows/ci.yml");
  requireMatch(workflow, /guard:v17-crm-icp-foundation[\s\S]*test:v17-crm-icp-foundation[\s\S]*V17_CRM_ICP_TEST_DATABASE_URL[\s\S]*test:v17-crm-icp-foundation:db/, "CI no ejecuta guardias y PostgreSQL ICP");

  return Object.freeze({
    ok: true,
    migrations: 22,
    migration: ICP_MIGRATION,
    models: Object.freeze(["ClientAddress", "PipelineCaseRouteSnapshot"]),
    maximumAdditionalStops: 8,
    productionApiEnabled: false,
    runtimeRouteConsumers: 0,
  });
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmIcpFoundationGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
