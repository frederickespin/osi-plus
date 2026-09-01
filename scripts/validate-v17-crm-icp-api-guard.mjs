import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateV17CrmIcpFoundationGuard } from "./validate-v17-crm-icp-foundation-guard.mjs";

const fail = (message) => { throw new Error(`V17_CRM_ICP_API_GUARD:${message}`); };
const requireMatch = (text, pattern, message) => { if (!pattern.test(text)) fail(message); };
const forbidMatch = (text, pattern, message) => { if (pattern.test(text)) fail(message); };

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function validateV17CrmIcpApiGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  validateV17CrmIcpFoundationGuard({ root, overrides });
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (migrations.length !== 22 || migrations.at(-1) !== "20260831010000_v17_crm_icp_foundation") {
    fail("el lote API no puede añadir ni reordenar migraciones");
  }

  const foundation = read("api/_lib/crmIcpV2Domain.js");
  requireMatch(foundation, /productionApiEnabled:\s*false/, "productionApiEnabled dejó de estar en false");
  const http = read("api/_lib/crmIcpV2ApiHttp.js");
  for (const signature of [
    'DISABLED: "DISABLED"', 'LOCAL_ONLY: "LOCAL_ONLY"', 'PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL"',
    'CRM_ICP_V2_API_PREVIEW_BRANCH = "feature/v17-crm-icp-api-05b1"',
    'CRM_ICP_V2_API_PREVIEW_BATCH = "V17-CRM-ICP-05B1-PREVIEW"',
    'requireCrmPipelineExplicitlyDisabled(env)', 'COMMERCIAL_TENANCY_MUTATION_MODE === "DISABLED"',
  ]) if (!http.includes(signature)) fail(`runtime incompleto: ${signature}`);
  forbidMatch(http, /PRODUCTION_(?:WRITE|PILOT|READ)|VERCEL_ENV\s*===\s*"production"|V17_PRODUCTION_PILOT/, "runtime ICP contiene modo productivo");
  requireMatch(http, /mode === CRM_ICP_V2_API_MODES\.LOCAL_ONLY[\s\S]*hasVercelSignal\(env\)[\s\S]*!isRealLoopbackRequest\(req\)/, "LOCAL_ONLY no exige socket real y ausencia de Vercel");
  const handler = http.slice(http.indexOf("return withPrivateApiHeaders"));
  const gate = handler.indexOf("resolveCrmIcpV2ApiMode(env, req)");
  const origin = handler.indexOf("assertSameOrigin(req)");
  const auth = handler.indexOf("resolveContext(req");
  const body = handler.indexOf("readJsonObject(req");
  if (gate < 0 || origin < gate || auth < origin || body < auth) fail("orden gate -> origin -> auth -> body inválido");
  for (const signature of ["setCrmPrivateHeaders(res)", "withPrivateApiHeaders", "CRM_ICP_V2_API_DISABLED", "matchFingerprint"]) {
    if (!http.includes(signature)) fail(`protección HTTP ausente: ${signature}`);
  }

  const domain = read("api/_lib/crmIcpV2ApiDomain.js");
  for (const signature of [
    "normalizeCrmIcpV2CreateInput", "buildCrmIcpV2AtomicPlan", "next_icp_client_code", "pg_try_advisory_xact_lock",
    "appendCommercialAudit", "pipelineCaseRouteSnapshot.createMany", "routeContractVersion: 2", "pipelineCaseCommand.create",
    "CRM_PIPELINE_IDEMPOTENCY_CONFLICT", "CRM_ICP_V2_API_05B1", "PERMS.PIPELINE_CREATE_PENDING_DESTINATION",
  ]) if (!domain.includes(signature)) fail(`ejecutor atómico incompleto: ${signature}`);
  forbidMatch(domain, /MAX\s*\(|Math\.max\([^\n]*client|console\.(?:log|warn|error)\([^\n]*(?:phone|email|tax|address)/i, "código Client o PII usa autoridad insegura");
  const foundationVolumeContract = read("api/_lib/crmIcpV2Domain.js");
  const rootFieldContract = foundationVolumeContract.slice(
    foundationVolumeContract.indexOf("const ROOT_FIELDS"),
    foundationVolumeContract.indexOf("const UNSIGNED_ROOT_FIELDS"),
  );
  forbidMatch(rootFieldContract, /estimatedCbm/, "ICP volvió a aceptar volumen anticipado");
  requireMatch(foundationVolumeContract, /estimatedCbm:\s*null/, "ICP no fija volumen como pendiente");
  requireMatch(domain, /estimatedCbm:\s*0/, "marcador legacy de volumen dejó de ser cero no autoritativo");
  requireMatch(domain, /volume:\s*Object\.freeze\(\{\s*status:\s*"PENDING_SOURCE",\s*estimatedCbm:\s*null,\s*source:\s*null\s*\}\)/, "respuesta de volumen pendiente incompleta");
  requireMatch(domain, /m\."tenant_id"=\$\{tenantId\}\s+AND m\."id"=\$\{membershipId\}\s+AND m\."user_id"=\$\{userId\}/, "actor no se revalida tenant-first");
  requireMatch(domain, /tenantId:\s*actor\.tenantId,\s*clientId,[\s\S]*addressRef:\s*\{\s*in:\s*refs\s*\}/, "ClientAddress no queda ligada a Tenant y Client");
  requireMatch(domain, /actor\.role === "V"\s*\?\s*\{\s*ownerMembershipId:\s*actor\.membershipId,\s*ownerUserId:\s*actor\.userId\s*\}/, "detalle V no exige owner completo");
  requireMatch(domain, /metadataJson:\s*plan\.audit/, "auditoría no usa metadata mínima del plan");
  forbidMatch(domain, /metadataJson:\s*\{[^}]*?(?:phone|email|taxId|street|address)/is, "auditoría copia PII");
  requireMatch(domain, /originLocation:\s*"ICP_V2_STRUCTURED_ROUTE"/, "texto legacy vuelve a ser autoridad de ruta");

  const rbac = read("api/_lib/rbac.js");
  requireMatch(rbac, /PIPELINE_CREATE_PENDING_DESTINATION:\s*"pipeline:create:pending-destination"/, "permiso pendiente ausente");
  requireMatch(rbac, /EXPLICIT_PIPELINE_MUTATION_PERMISSIONS[\s\S]*PERMS\.PIPELINE_CREATE_PENDING_DESTINATION/, "permiso pendiente se concede por rol baseline");

  const routes = {
    create: read("api/crm/icp-v2/pipeline-cases/index.js"),
    search: read("api/crm/icp-v2/clients/search.js"),
    detail: read("api/crm/icp-v2/pipeline-cases/[caseKey]/index.js"),
  };
  requireMatch(routes.create, /createCrmIcpV2CreateHandler[\s\S]*createCrmIcpV2Case/, "POST crear no delega al contrato ICP");
  requireMatch(routes.search, /createCrmIcpClientSearchHandler[\s\S]*searchCrmIcpClients/, "POST buscar no delega a búsqueda tenant-first");
  requireMatch(routes.detail, /createCrmIcpV2DetailHandler[\s\S]*findCrmIcpV2Case/, "GET detalle no delega a lectura v2");
  for (const source of Object.values(routes)) {
    forbidMatch(source, /req\.body|tenantId|membershipId|userId|clientId/, "ruta interpreta autoridad o ID interno");
  }
  const authInventory = read("scripts/validate-mt01b3a-auth-guard.mjs");
  for (const path of [
    "api/crm/icp-v2/clients/search.js",
    "api/crm/icp-v2/pipeline-cases/[caseKey]/index.js",
    "api/crm/icp-v2/pipeline-cases/index.js",
  ]) if (authInventory.split(`\"${path}\"`).length - 1 !== 2) fail(`ruta fuera del inventario auth: ${path}`);
  requireMatch(authInventory, /ICP_V2_API_ROUTES[\s\S]*crmIcpV2ApiHttp\\\.js/, "rutas ICP no exigen su contrato HTTP en el inventario auth");
  const commercialWriteGuard = read("scripts/validate-mt01c2b3a-guard.mjs");
  requireMatch(commercialWriteGuard, /path === "api\/_lib\/crmIcpV2ApiDomain\.js"[\s\S]*no limita promoción por caso, tenant y revisión inicial/, "promoción ICP fuera del inventario comercial");
  requireMatch(commercialWriteGuard, /api\/_lib\/crmIcpV2ApiDomain\.js:client\.create[\s\S]*api\/_lib\/crmIcpV2ApiDomain\.js:pipelineCase\.create/, "creadores ICP fuera del inventario comercial");
  const publicRefGuard = read("scripts/validate-v17-case-public-ref-guard.mjs");
  requireMatch(publicRefGuard, /authorizedPublicRefConsumers[\s\S]*"api\/_lib\/crmIcpV2ApiDomain\.js"/, "dominio ICP fuera del inventario publicRef");
  const crm01aGuard = read("scripts/validate-crm-01a-guard.mjs");
  const crm01b1Guard = read("scripts/validate-crm-01b1-guard.mjs");
  const crm01b2Guard = read("scripts/validate-crm-01b2-guard.mjs");
  const corsInventory = read("scripts/protected-cors-route-inventory.json");
  const crm01b3b1Guard = read("scripts/validate-crm-01b3b1-guard.mjs");
  const crm01b3b3Guard = read("scripts/validate-crm-01b3b3-guard.mjs");
  const varyGuard = read("scripts/validate-v17-crm-vary-guard.mjs");
  const canonicalRunner = read("scripts/run-canonical-db-tests.mjs");
  const hubGuard = read("scripts/validate-v17-hub-guard.mjs");
  requireMatch(crm01b1Guard, /RUNTIME_SERVICE_ALLOWLIST[\s\S]*api\/_lib\/crmIcpV2ApiDomain\.js/, "dominio ICP fuera del inventario journal");
  requireMatch(crm01b2Guard, /ICP_API_DOMAIN = "api\/_lib\/crmIcpV2ApiDomain\.js"/, "dominio ICP fuera del inventario de mutación");
  if (crm01b2Guard.split("CASE_MUTATION_DOMAIN, ICP_API_DOMAIN").length - 1 !== 2) {
    fail("dominio ICP fuera del inventario de mutación");
  }
  for (const path of ["/api/crm/icp-v2/clients/search", "/api/crm/icp-v2/pipeline-cases", "/api/crm/icp-v2/pipeline-cases/[caseKey]"]) {
    if (!corsInventory.includes(`\"${path}\"`)) fail(`ruta fuera del inventario CORS privado: ${path}`);
  }
  for (const [name, inventory] of [["CRM-01A", crm01aGuard], ["CRM-01B3B1", crm01b3b1Guard]]) {
    for (const path of Object.keys(routes).map((key) => ({
      create: "api/crm/icp-v2/pipeline-cases/index.js",
      search: "api/crm/icp-v2/clients/search.js",
      detail: "api/crm/icp-v2/pipeline-cases/[caseKey]/index.js",
    })[key])) if (!inventory.includes(`\"${path}\"`)) fail(`ruta fuera del inventario ${name}: ${path}`);
  }
  requireMatch(varyGuard, /EXPECTED_ROUTES[\s\S]*"api\/crm\/icp-v2\/clients\/search\.js": "createCrmIcpClientSearchHandler"[\s\S]*"api\/crm\/icp-v2\/pipeline-cases\/index\.js": "createCrmIcpV2CreateHandler"[\s\S]*"api\/crm\/icp-v2\/pipeline-cases\/\[caseKey\]\/index\.js": "createCrmIcpV2DetailHandler"/, "rutas ICP fuera del inventario Vary");
  requireMatch(varyGuard, /api\/_lib\/crmIcpV2ApiHttp\.js/, "wrapper ICP fuera del inventario Vary");
  requireMatch(crm01b3b3Guard, /routes\.length === 12[\s\S]*crmIcpV2ApiHttp/, "rutas ICP fuera del inventario CRM-01B3B3");
  requireMatch(canonicalRunner, /crmProductionGateGuardRun\.report\.routes === 12[\s\S]*crmOwnerCatalogGuardRun\.report\.routes === 12[\s\S]*v17CasePublicRefGuardRun\.report\.runtimeConsumers === 7/, "agregador canónico no reconoce los consumidores ICP");
  for (const path of [
    "api/_lib/crmIcpV2ApiDomain.js",
    "api/_lib/crmIcpV2ApiHttp.js",
    "api/crm/icp-v2/clients/search.js",
    "api/crm/icp-v2/pipeline-cases/[caseKey]/index.js",
    "api/crm/icp-v2/pipeline-cases/index.js",
  ]) if (!hubGuard.includes(`\"${path}\"`)) fail(`archivo fuera de la guardia Hub: ${path}`);

  const srcFiles = walk(resolve(root, "src")).filter((path) => /\.(?:js|jsx|ts|tsx)$/.test(path));
  const frontend = srcFiles.map((path) => read(relative(resolve(root), path).replaceAll("\\", "/"))).join("\n");
  forbidMatch(frontend, /\/api\/crm\/icp-v2|crmIcpV2Api/, "el lote API conectó un consumidor UI");
  const oldRoutes = `${read("api/crm/pipeline-cases/index.js")}\n${read("api/crm/pipeline-cases/[caseKey]/index.js")}\n${read("api/clients/index.js")}`;
  forbidMatch(oldRoutes, /crmIcpV2|icp-v2/i, "el lote cambió autoridad de rutas históricas");

  const docs = read("docs/V17-CRM-ICP-05B1-API-CONTRACT.md");
  for (const statement of ["productionApiEnabled` permanece en `false`", "no actualiza casos", "no añade consumidores frontend", "no recibe, calcula ni acepta `estimatedCbm`", "experiencia ERP más reciente previa a la integración CRM"]) {
    if (!docs.includes(statement)) fail(`límite contractual ausente: ${statement}`);
  }
  return Object.freeze({
    ok: true,
    migrations: 22,
    endpoints: Object.freeze([
      "POST /api/crm/icp-v2/pipeline-cases",
      "POST /api/crm/icp-v2/clients/search",
      "GET /api/crm/icp-v2/pipeline-cases/:caseRef",
    ]),
    modes: Object.freeze(["DISABLED", "LOCAL_ONLY", "PREVIEW_REHEARSAL"]),
    productionApiEnabled: false,
    uiConsumers: 0,
  });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmIcpApiGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
