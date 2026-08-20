import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateV17CrmVaryGuard } from "./validate-v17-crm-vary-guard.mjs";

const paths = [
  "api/_lib/crmHttpHeaders.js",
  "api/_lib/crmPipelineReadHttp.js",
  "api/_lib/pipelineCaseMutationHttp.js",
  "api/_lib/crmOwnerCatalogHttp.js",
  ".github/workflows/ci.yml",
];
const baseline = Object.fromEntries(paths.map((path) => [path, readFileSync(resolve(path), "utf8")]));
const canonicalRoutes = [
  "api/crm/pipeline-cases/index.js",
  "api/crm/pipeline-cases/[id].js",
  "api/crm/pipeline-summary.js",
  "api/crm/pipeline-owner-options.js",
  "api/crm/pipeline-cases/[id]/allowed-transitions.js",
  "api/crm/pipeline-cases/[id]/transition.js",
  "api/crm/pipeline-cases/[id]/assign-owner.js",
  "api/crm/pipeline-cases/[id]/unassign-owner.js",
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

process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
