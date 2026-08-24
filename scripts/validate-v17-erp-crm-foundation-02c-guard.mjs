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

assert.match(files.production, /hubMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE[\s\S]*clientMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE[\s\S]*readMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE/u);
assert.match(files.production, /vercelEnvironment === "production"[\s\S]*gitBranch === V17_COMMERCIAL_CRM_PRODUCTION_BRANCH/u);
assert.match(files.auth, /CRM_PIPELINE_MUTATION_MODES\.DISABLED/u);
assert.match(files.auth, /resolveCrmPipelineContext/u);
assert.match(files.app, /!hubMode\.valid \|\| !serverConfirmed/u);
assert.match(files.app, /commercialCrmProductionAuthorized !== true/u);
assert.ok(files.app.indexOf("!hubMode.valid || !serverConfirmed") < files.app.indexOf("<AuthorizedHubEntry"));
assert.match(files.hubMode, /resolveV17CommercialCrmProductionClientAuthority/u);
assert.match(files.clientMode, /productionPair/u);
assert.doesNotMatch(files.hub, /Esta fundación local no activa ninguna aplicación/u);
assert.match(files.hub, /CRM · sólo lectura/u);
for (const source of Object.values(files)) {
  assert.doesNotMatch(source, /prefetch|localStorage\.getItem\([^)]*(?:permission|role)|x-osi-/iu);
}

process.stdout.write(JSON.stringify({ ok: true, assertions: 17, protectedBoundary: "pre-lazy", mutations: "DISABLED" }));
