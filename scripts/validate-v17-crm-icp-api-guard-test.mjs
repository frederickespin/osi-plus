import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17CrmIcpApiGuard } from "./validate-v17-crm-icp-api-guard.mjs";

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

rejected("Production habilitado", { "api/_lib/crmIcpV2Domain.js": foundation.replace("productionApiEnabled: false", "productionApiEnabled: true") }, /API productiva|productionApiEnabled/);
rejected("modo productivo añadido", { "api/_lib/crmIcpV2ApiHttp.js": `${http}\nconst V17_PRODUCTION_PILOT = true;` }, /modo productivo/);
rejected("Preview permite mutación histórica", { "api/_lib/crmIcpV2ApiHttp.js": http.replace('env.CRM_PIPELINE_MUTATION_MODE === "DISABLED"', 'env.CRM_PIPELINE_MUTATION_MODE === "PRODUCTION_PILOT"') }, /runtime incompleto|modo productivo/);
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
rejected("UI consumidora", { "src/App.tsx": `${read("src/App.tsx")}\nconst icpEndpoint = "/api/crm/icp-v2/pipeline-cases";` }, /consumidor UI/);
rejected("límite documental retirado", { "docs/V17-CRM-ICP-05B1-API-CONTRACT.md": docs.replace("no añade consumidores frontend", "añade frontend") }, /límite contractual/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
