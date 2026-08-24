import assert from "node:assert/strict";
import fs from "node:fs";

const files = {
  app: fs.readFileSync("src/App.tsx", "utf8"),
  hubMode: fs.readFileSync("src/hub/hubMode.ts", "utf8"),
  clientMode: fs.readFileSync("src/crm-relational/clientMode.ts", "utf8"),
  hub: fs.readFileSync("src/hub/HubWorkspace.tsx", "utf8"),
  production: fs.readFileSync("shared/v17CommercialCrmProduction.js", "utf8"),
  auth: fs.readFileSync("api/_lib/v17CommercialCrmProductionAuth.js", "utf8"),
};
const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const protectedUi = [
  fs.readFileSync("src/hub/HubWorkspace.tsx", "utf8"),
  fs.readFileSync("src/commercial-crm/AdvancedErpShell.tsx", "utf8"),
  fs.readFileSync("src/commercial-crm/CommercialInboxModule.tsx", "utf8"),
  fs.readFileSync("src/commercial-crm/CommercialCaseDetail.tsx", "utf8"),
  fs.readFileSync("src/crm-relational/readApi.ts", "utf8"),
].join("\n");

assert.match(files.production, /hubMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE[\s\S]*clientMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE[\s\S]*readMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE/u);
assert.match(files.production, /vercelEnvironment === "production"[\s\S]*gitBranch === V17_COMMERCIAL_CRM_PRODUCTION_BRANCH/u);
assert.match(files.auth, /CRM_PIPELINE_MUTATION_MODES\.DISABLED/u);
assert.match(files.auth, /resolveCrmPipelineContext/u);
assert.match(files.app, /!hubMode\.valid \|\| !serverConfirmed/u);
assert.match(files.app, /commercialCrmProductionAuthorized !== true/u);
assert.ok(files.app.indexOf("!hubMode.valid || !serverConfirmed") < files.app.indexOf("<AuthorizedHubEntry"));
assert.match(files.hubMode, /resolveV17CommercialCrmProductionClientAuthority/u);
assert.match(files.clientMode, /productionPair/u);
assert.match(files.hub, /Comercial abre el ERP sólo cuando la sesión y el entorno están autorizados/u);
assert.match(files.hub, /CRM · sólo lectura/u);
assert.match(workflow, /npm run test:v17-erp-crm-foundation-02c\s/u);
assert.match(workflow, /npm run test:v17-erp-crm-foundation-02c:browser/u);
assert.doesNotMatch(protectedUi, /\/api\/(?:clients|projects|k\/)|\/pipeline-owner-options|\/allowed-transitions|\/assign-owner|\/unassign-owner|\/transition/u);
assert.doesNotMatch(protectedUi, /crm-relational\/api/u);
for (const source of Object.values(files)) {
  assert.doesNotMatch(source, /prefetch|localStorage\.getItem\([^)]*(?:permission|role)|x-osi-/iu);
}

process.stdout.write(JSON.stringify({ ok: true, assertions: 21, protectedBoundary: "pre-lazy", mutations: "DISABLED", browserCi: 18 }));
