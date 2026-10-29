import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateV17CrmVaryGuard } from "./validate-v17-crm-vary-guard.mjs";

const paths = [
  "api/_lib/crmHttpHeaders.js",
  "api/_lib/crmPipelineReadHttp.js",
  "api/_lib/crmCaseMutationHttp.js",
  "api/_lib/pipelineCaseMutationHttp.js",
  "api/_lib/crmOwnerCatalogHttp.js",
  "api/_lib/crmIcpV2ApiHttp.js",
  "api/_lib/crmServicesHttp.js",
  "api/_lib/crmSurveyHttp.js",
  ".github/workflows/ci.yml",
];
const baseline = Object.fromEntries(paths.map((path) => [path, readFileSync(resolve(path), "utf8")]));
const canonicalRoutes = [
  "api/crm/client-options.js",
  "api/crm/pipeline-cases/index.js",
  "api/crm/pipeline-cases/[caseKey]/index.js",
  "api/crm/pipeline-summary.js",
  "api/crm/pipeline-owner-options.js",
  "api/crm/pipeline-cases/[caseKey]/allowed-transitions.js",
  "api/crm/pipeline-cases/[caseKey]/transition.js",
  "api/crm/pipeline-cases/[caseKey]/assign-owner.js",
  "api/crm/pipeline-cases/[caseKey]/unassign-owner.js",
  "api/crm/icp-v2/clients/search.js",
  "api/crm/icp-v2/pipeline-cases/index.js",
  "api/crm/icp-v2/pipeline-cases/[caseKey]/index.js",
  "api/crm/services/cases/[caseRef].js",
  "api/crm/services/catalog/index.js",
  "api/crm/services/catalog/[serviceRef].js",
  "api/crm/services/defaults/index.js",
  "api/crm/services/catalog-modes/index.js",
  "api/crm/services/configurations/[caseRef].js",
  "api/crm/services/configurations/conflicts/[conflictRef].js",
  "api/crm/services/material-policies/index.js",
  "api/crm/services/modes/index.js",
  "api/crm/services/packages/index.js",
  "api/crm/survey/assignments/index.js",
  "api/crm/survey/assignments/[assignmentRef].js",
  "api/crm/survey/scheduling/index.js",
  "api/crm/survey/catalog/index.js",
  "api/crm/survey/drafts/[surveyRef].js",
  "api/crm/survey/drafts/[surveyRef]/photos.js",
  "api/crm/survey/drafts/[surveyRef]/publish.js",
  "api/crm/survey/publications/[publicationRef].js",
  "api/crm/survey/publications/[publicationRef]/pdf.js",
].sort();

let assertions = 0;
function rejected(name, options, pattern) {
  assert.throws(() => validateV17CrmVaryGuard(options), pattern, name);
  assertions += 1;
}

assert.equal(validateV17CrmVaryGuard({ sources: baseline, routes: canonicalRoutes }).ok, true);
assertions += 1;

rejected("Origin ausente", {
  sources: { ...baseline, "api/_lib/crmHttpHeaders.js": baseline["api/_lib/crmHttpHeaders.js"].replace(', "Origin"', "") },
  routes: canonicalRoutes,
}, /tokens requeridos/);
rejected("Authorization ausente", {
  sources: { ...baseline, "api/_lib/crmHttpHeaders.js": baseline["api/_lib/crmHttpHeaders.js"].replace('"Authorization", ', "") },
  routes: canonicalRoutes,
}, /tokens requeridos/);
rejected("deduplicación retirada", {
  sources: { ...baseline, "api/_lib/crmHttpHeaders.js": baseline["api/_lib/crmHttpHeaders.js"].replace("seen.has(lower)", "false") },
  routes: canonicalRoutes,
}, /deduplicación/);
rejected("preservación retirada", {
  sources: { ...baseline, "api/_lib/crmHttpHeaders.js": baseline["api/_lib/crmHttpHeaders.js"].replace("...preserved, ...requiredByLower.values()", "...requiredByLower.values()") },
  routes: canonicalRoutes,
}, /no se preservan/);
rejected("wildcard permitido", {
  sources: { ...baseline, "api/_lib/crmHttpHeaders.js": baseline["api/_lib/crmHttpHeaders.js"].replace('token === "*"', "false") },
  routes: canonicalRoutes,
}, /wildcard/);
rejected("gate antes de headers", {
  sources: { ...baseline, "api/_lib/pipelineCaseMutationHttp.js": baseline["api/_lib/pipelineCaseMutationHttp.js"].replace("setCrmPrivateHeaders(res);", "") },
  routes: canonicalRoutes,
}, /orden/);
rejected("API ICP antes de headers", {
  sources: { ...baseline, "api/_lib/crmIcpV2ApiHttp.js": baseline["api/_lib/crmIcpV2ApiHttp.js"].replace("setCrmPrivateHeaders(res);", "") },
  routes: canonicalRoutes,
}, /orden/);
rejected("ruta futura sin contrato", { sources: baseline, routes: [...canonicalRoutes, "api/crm/future.js"].sort() }, /ruta CRM nueva/);
rejected("ruta evita wrapper", {
  sources: baseline,
  routes: canonicalRoutes,
  routeSourceOverrides: { "api/crm/pipeline-summary.js": "export default async function handler() {}" },
}, /evita el wrapper/);
rejected("CI omite contrato", {
  sources: { ...baseline, ".github/workflows/ci.yml": baseline[".github/workflows/ci.yml"].split("node scripts/v17-crm-vary-contract-test.mjs").join("") },
  routes: canonicalRoutes,
}, /CI no exige/);

for (const route of [
  "api/crm/services/catalog-modes/index.js", "api/crm/services/configurations/[caseRef].js",
  "api/crm/services/configurations/conflicts/[conflictRef].js", "api/crm/services/material-policies/index.js",
  "api/crm/services/modes/index.js", "api/crm/services/packages/index.js",
]) {
  rejected(`ruta consolidada ausente: ${route}`, { sources: baseline, routes: canonicalRoutes.filter((path) => path !== route) }, /ruta CRM nueva o faltante/);
}
for (const adapter of ["crmCaseMutationHttp", "crmServicesHttp", "crmSurveyHttp", "crmOwnerCatalogHttp"]) {
  const path = `api/_lib/${adapter}.js`;
  rejected(`headers antes de gate: ${adapter}`, { sources: { ...baseline, [path]: baseline[path].replaceAll("setCrmPrivateHeaders(res);", "") }, routes: canonicalRoutes }, /orden/);
}
rejected("ruta nueva bajo Services sigue sin estar autorizada", { sources: baseline, routes: [...canonicalRoutes, "api/crm/services/future.js"].sort() }, /ruta CRM nueva/);
const packages = "api/crm/services/packages/index.js";
const packageSource = readFileSync(resolve(packages), "utf8");
rejected("import correcto sin llamada no preserva wrapper", {
  sources: baseline, routes: canonicalRoutes,
  routeSourceOverrides: { [packages]: packageSource.replace("export default createCrmServicesHandler(", "export default unsafeHandler(") },
}, /evita el wrapper/);
rejected("nombre de factory correcto desde otro módulo no autoriza", {
  sources: baseline, routes: canonicalRoutes,
  routeSourceOverrides: { [packages]: packageSource.replace("crmServicesHttp.js", "unsafeHttp.js") },
}, /evita el wrapper/);
rejected("ruta no puede retirar Vary", {
  sources: baseline, routes: canonicalRoutes,
  routeSourceOverrides: { [packages]: packageSource + '\nres.removeHeader("vary");' },
}, /sobrescribe Vary/);
rejected("comentario no suple la llamada al wrapper", {
  sources: baseline, routes: canonicalRoutes,
  routeSourceOverrides: { [packages]: '// createCrmServicesHandler({});\nexport default () => null;' },
}, /evita el wrapper/);
rejected("POST y PATCH de casos también requieren su wrapper", {
  sources: baseline, routes: canonicalRoutes,
  routeSourceOverrides: { "api/crm/pipeline-cases/index.js": readFileSync(resolve("api/crm/pipeline-cases/index.js"), "utf8").replaceAll("createCrmCaseMutationHandler", "unsafeMutation") },
}, /evita el wrapper/);
rejected("ruta nueva no puede sobrescribir Vary", {
  sources: baseline, routes: canonicalRoutes,
  routeSourceOverrides: { [packages]: packageSource + '\nres.setHeader("Vary", "Origin");' },
}, /sobrescribe Vary/);
rejected("ruta nueva no puede declarar wildcard", {
  sources: baseline, routes: canonicalRoutes,
  routeSourceOverrides: { [packages]: packageSource + '\nconst headers = { Vary: "*" };' },
}, /Vary wildcard/);
rejected("cache privado no puede eliminarse", {
  sources: { ...baseline, "api/_lib/crmHttpHeaders.js": baseline["api/_lib/crmHttpHeaders.js"].replace('res.setHeader("Cache-Control", "private, no-store")', 'res.setHeader("Cache-Control", "public")') }, routes: canonicalRoutes,
}, /cache privado/);
rejected("CORS heredado no puede conservarse", {
  sources: { ...baseline, "api/_lib/crmHttpHeaders.js": baseline["api/_lib/crmHttpHeaders.js"].replace('removeHeader("Access-Control-Allow-Origin")', 'removeHeader("Other-Header")') }, routes: canonicalRoutes,
}, /wildcard heredado/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions, routes: canonicalRoutes.length })}\n`);
