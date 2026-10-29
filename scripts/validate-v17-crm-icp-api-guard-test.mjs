import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17CrmIcpApiGuard } from "./validate-v17-crm-icp-api-guard.mjs";
import { MT01B3A_ROUTE_INVENTORY } from "./validate-mt01b3a-auth-guard.mjs";
import { PUBLIC_REFERENCE_CONTRACTS } from "./validate-v17-case-public-ref-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
let assertions = 0;
function rejected(name, overrides, pattern) {
  assert.throws(() => validateV17CrmIcpApiGuard({ overrides }), pattern, name);
  assertions += 1;
}

assert.equal(validateV17CrmIcpApiGuard().ok, true); assertions += 1;
const foundation = read("api/_lib/crmIcpV2Domain.js");
const http = read("api/_lib/crmIcpV2ApiHttp.js");
const domain = read("api/_lib/crmIcpV2ApiDomain.js");
const rbac = read("api/_lib/rbac.js");
const createRoute = read("api/crm/icp-v2/pipeline-cases/index.js");
const searchRoute = read("api/crm/icp-v2/clients/search.js");
const detailRoute = read("api/crm/icp-v2/pipeline-cases/[caseKey]/index.js");
const docs = read("docs/V17-CRM-ICP-05B1-API-CONTRACT.md");
const commercialWriteGuard = read("scripts/validate-mt01c2b3a-guard.mjs");
const crm01aGuard = read("scripts/validate-crm-01a-guard.mjs");
const crm01b1Guard = read("scripts/validate-crm-01b1-guard.mjs");
const crm01b2Guard = read("scripts/validate-crm-01b2-guard.mjs");
const corsInventory = read("scripts/protected-cors-route-inventory.json");
const varyGuard = read("scripts/validate-v17-crm-vary-guard.mjs");
const crm01b3b3Guard = read("scripts/validate-crm-01b3b3-guard.mjs");
const canonicalRunner = read("scripts/run-canonical-db-tests.mjs");

rejected("Production habilitado", { "api/_lib/crmIcpV2Domain.js": foundation.replace("productionApiEnabled: false", "productionApiEnabled: true") }, /API productiva|productionApiEnabled/);
rejected("modo productivo añadido", { "api/_lib/crmIcpV2ApiHttp.js": `${http}\nconst V17_PRODUCTION_PILOT = true;` }, /modo productivo/);
rejected("Preview permite mutación histórica", { "api/_lib/crmIcpV2ApiHttp.js": http.replace("requireCrmPipelineExplicitlyDisabled(env)", "true") }, /runtime incompleto|modo productivo/);
rejected("auth antes del gate", { "api/_lib/crmIcpV2ApiHttp.js": http.replace("resolveCrmIcpV2ApiMode(env, req);", "void resolveContext(req); resolveCrmIcpV2ApiMode(env, req);") }, /orden/);
rejected("sin socket loopback", { "api/_lib/crmIcpV2ApiHttp.js": http.replace("|| !isRealLoopbackRequest(req)", "|| false") }, /LOCAL_ONLY/);
rejected("MAX para código Client", { "api/_lib/crmIcpV2ApiDomain.js": domain.replace('SELECT "osi"."next_icp_client_code"() AS "code"', 'SELECT MAX("code") AS "code"') }, /autoridad insegura|ejecutor atómico/);
rejected("actor sin tenant", { "api/_lib/crmIcpV2ApiDomain.js": domain.replace('m."tenant_id"=${tenantId} AND ', "") }, /actor no se revalida/);
rejected("dirección sin Client", { "api/_lib/crmIcpV2ApiDomain.js": domain.replace("tenantId: actor.tenantId, clientId, addressRef", "tenantId: actor.tenantId, addressRef") }, /ClientAddress/);
rejected("V sin owner completo", { "api/_lib/crmIcpV2ApiDomain.js": domain.replace("ownerMembershipId: actor.membershipId, ownerUserId: actor.userId", "ownerMembershipId: actor.membershipId") }, /owner completo/);
rejected("auditoría con PII", { "api/_lib/crmIcpV2ApiDomain.js": domain.replace("metadataJson: plan.audit", "metadataJson: { phone: command.caseContact.phone }") }, /auditoría/);
rejected("permiso pending automático", { "api/_lib/rbac.js": rbac.replace("PERMS.PIPELINE_CREATE_PENDING_DESTINATION,", "") }, /permiso pendiente/);
rejected("ruta crear interpreta body", { "api/crm/icp-v2/pipeline-cases/index.js": `${createRoute}\nconst forbidden = req.body;` }, /ruta interpreta/);
rejected("ruta búsqueda desconectada", { "api/crm/icp-v2/clients/search.js": searchRoute.replace("=> searchCrmIcpClients", "=> legacySearch") }, /POST buscar/);
rejected("detalle desconectado", { "api/crm/icp-v2/pipeline-cases/[caseKey]/index.js": detailRoute.replace("=> findCrmIcpV2Case", "=> legacyDetail") }, /GET detalle/);
rejected("consumidor UI fuera del cliente autorizado", { "src/App.tsx": `${read("src/App.tsx")}\nconst icpEndpoint = "/api/crm/icp-v2/pipeline-cases";` }, /consumidores UI/);
rejected("límite documental retirado", { "docs/V17-CRM-ICP-05B1-API-CONTRACT.md": docs.replace("no añade consumidores frontend", "añade frontend") }, /límite contractual/);
const searchPath = "api/crm/icp-v2/clients/search.js";
const searchClassification = MT01B3A_ROUTE_INVENTORY[searchPath];
function rejectedAuthClassification(name, classification, pattern) {
  const authInventory = { ...MT01B3A_ROUTE_INVENTORY, [searchPath]: classification };
  assert.throws(() => validateV17CrmIcpApiGuard({ authInventory }), pattern, name);
  assertions += 1;
}
rejectedAuthClassification("ruta fuera de inventario auth", undefined, /inventario auth/);
rejectedAuthClassification("ICP no puede clasificarse como metadata pública", { ...searchClassification, kind: "PUBLIC_METADATA" }, /clasificación auth ICP incorrecta/);
rejectedAuthClassification("ICP requiere wrapper empresarial explícito", { ...searchClassification, wrappedFactory: false }, /clasificación auth ICP incorrecta/);
rejectedAuthClassification("ICP no puede delegar a otro módulo", { ...searchClassification, calls: [{ module: "api/_lib/clientTemporaryAccessHttp.js", name: "createCrmIcpClientSearchHandler" }] }, /clasificación auth ICP incorrecta/);
rejectedAuthClassification("ICP no puede cambiar su handler clasificado", { ...searchClassification, calls: [{ module: "api/_lib/crmIcpV2ApiHttp.js", name: "createCrmIcpV2CreateHandler" }] }, /clasificación auth ICP incorrecta/);
rejectedAuthClassification("ICP no puede omitir su contrato HTTP", { ...searchClassification, calls: [] }, /clasificación auth ICP incorrecta/);
rejected("promoción fuera de inventario comercial", { "scripts/validate-mt01c2b3a-guard.mjs": commercialWriteGuard.replace('  } else if (path === "api/_lib/crmIcpV2ApiDomain.js") {', '  } else if (path === "api/_lib/removed.js") {') }, /inventario comercial/);
rejected("volumen anticipado vuelve al ICP", { "api/_lib/crmIcpV2Domain.js": foundation.replace('const ROOT_FIELDS = new Set([...REQUIRED_ROOT_FIELDS, "requirementNotes"]);', 'const ROOT_FIELDS = new Set([...REQUIRED_ROOT_FIELDS, "requirementNotes", "estimatedCbm"]);') }, /volumen anticipado/);
function rejectedPublicReferences(name, classification) {
  const publicReferenceContracts = { ...PUBLIC_REFERENCE_CONTRACTS, "api/_lib/crmIcpV2ApiDomain.js": classification };
  assert.throws(() => validateV17CrmIcpApiGuard({ publicReferenceContracts }), /inventario publicRef/, name);
  assertions += 1;
}
rejectedPublicReferences("dominio fuera de inventario publicRef", undefined);
rejectedPublicReferences("ICP no puede perder clasificación CASE", ["CLIENT"]);
rejectedPublicReferences("ICP no puede perder clasificación CLIENT", ["CASE"]);
rejectedPublicReferences("ICP no puede asumir otra clase de referencia", ["CASE", "MEMBERSHIP"]);
rejected("ruta fuera de inventario CRM-01A", { "scripts/validate-crm-01a-guard.mjs": crm01aGuard.replace('  "api/crm/icp-v2/clients/search.js",', "") }, /inventario CRM-01A/);
rejected("dominio fuera de inventario journal", { "scripts/validate-crm-01b1-guard.mjs": crm01b1Guard.replace(', "api/_lib/crmIcpV2ApiDomain.js"', "") }, /inventario journal/);
rejected("dominio fuera de inventario de mutación", { "scripts/validate-crm-01b2-guard.mjs": crm01b2Guard.replace(', ICP_API_DOMAIN', "") }, /inventario de mutación/);
rejected("ruta fuera de inventario CORS", { "scripts/protected-cors-route-inventory.json": corsInventory.replace('"/api/crm/icp-v2/clients/search",', '"/api/crm/icp-v2/clients/removed",') }, /inventario CORS/);
rejected("ruta fuera de inventario Vary", { "scripts/validate-v17-crm-vary-guard.mjs": varyGuard.replace('"api/crm/icp-v2/clients/search.js": "createCrmIcpClientSearchHandler"', '"api/crm/icp-v2/clients/removed.js": "createCrmIcpClientSearchHandler"') }, /inventario Vary/);
rejected("ruta fuera de inventario CRM-01B3B3", { "scripts/validate-crm-01b3b3-guard.mjs": crm01b3b3Guard.replace("routes.length === 12", "routes.length === 9") }, /inventario CRM-01B3B3/);
rejected("agregador canónico desactualizado", { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replace("v17CasePublicRefGuardRun.report.runtimeConsumers === Object.keys(PUBLIC_REFERENCE_CONTRACTS).length", "v17CasePublicRefGuardRun.report.runtimeConsumers === 7") }, /agregador canónico/);
rejected("agregador no puede omitir clasificación de referencias", { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replace("JSON.stringify(v17CasePublicRefGuardRun.report.consumerContracts[path].kinds) === JSON.stringify(kinds)", "true") }, /agregador canónico/);
rejected("agregador no puede omitir inventario exacto", { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replace("JSON.stringify(Object.keys(v17CasePublicRefGuardRun.report.consumerContracts || {}).sort()) === JSON.stringify(Object.keys(PUBLIC_REFERENCE_CONTRACTS).sort())", "true") }, /agregador canónico/);
rejected("agregador no puede omitir import del contrato", { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replace('import { PUBLIC_REFERENCE_CONTRACTS } from "./validate-v17-case-public-ref-guard.mjs";', "") }, /agregador canónico/);
rejected("agregador no puede aceptar reporte inválido", { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replace("v17CasePublicRefGuardRun.report.ok === true", "true") }, /agregador canónico/);
rejected("agregador no puede retirar rutas ICP del gate productivo", { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replace("crmProductionGateGuardRun.report.routes === 12", "crmProductionGateGuardRun.report.routes === 9") }, /agregador canónico/);
rejected("agregador no puede omitir gate del catálogo owner", { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replace("crmOwnerCatalogGuardRun.report.routes === 12", "true") }, /agregador canónico/);
assert.equal(validateV17CrmIcpApiGuard({ overrides: { "scripts/run-canonical-db-tests.mjs": canonicalRunner.replaceAll(".report.routes === 12", ".report.routes === (12)") } }).ok, true); assertions += 1;
rejected("Hub no puede importar autoridad backend", { "src/hub/HubWorkspace.tsx": read("src/hub/HubWorkspace.tsx") + '\nimport { createCrmIcpV2Case } from "../../api/_lib/crmIcpV2ApiDomain.js";\n' }, /guardia Hub/);
rejected("Hub no puede perder autorización antes del lazy", { "src/App.tsx": read("src/App.tsx").replace("routeState.status === 'DENIED' || !routeDecision.allowed", "false") }, /guardia Hub/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
