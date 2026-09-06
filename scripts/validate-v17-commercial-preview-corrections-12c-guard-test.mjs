import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateCommercialPreviewCorrections12cGuard } from "./validate-v17-commercial-preview-corrections-12c-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
let negatives = 0;
function rejects(path, mutate) {
  assert.throws(() => validateCommercialPreviewCorrections12cGuard({ [path]: mutate(read(path)) }));
  negatives += 1;
}

assert.equal(validateCommercialPreviewCorrections12cGuard().productionApiEnabled, false);
rejects("src/commercial-crm/CommercialCaseDetail.tsx", (value) => value.replace('["COSTING", "Costos", Calculator]', '["LOGISTICS", "Motor Logístico", Calculator], ["COSTING", "Costos", Calculator]'));
rejects("src/commercial-crm/CommercialCaseDetail.tsx", (value) => `${value}\nconst LogisticsPlanPanel = lazy(() => import(\"@/logistics-engine/LogisticsPlanPanel\"));`);
rejects("src/commercial-crm/CaseWorkflowOverview.tsx", (value) => `${value}\nonSelectTab(\"LOGISTICS\");`);
rejects("src/survey/SurveyCasePanel.tsx", (value) => `${value}\nlogisticsApi.calculate({});`);
rejects("src/logistics-engine/LogisticsVisitSummary.tsx", (value) => `${value}\nfetch(\"/api/logistics/plans/calculate\");`);
rejects("src/costing/CostingPanel.tsx", (value) => `${value}\nlogisticsApi.publish({});`);
rejects("src/admin-tenant/AdminTenantMembershipModule.tsx", (value) => value.replace("isLogisticsUiEnabled() && logisticsRulesAccess.canRulesView", "isLogisticsUiEnabled()"));
rejects("src/admin-tenant/AdminTenantMembershipModule.tsx", (value) => value.replace("logisticsAdminEnabled && <Suspense", "true && <Suspense"));
rejects("src/hub/HubWorkspace.tsx", (value) => value.replace("adminMembershipAvailable || logisticsAdminAvailable", "adminMembershipAvailable"));
rejects("src/hub/HubWorkspace.tsx", (value) => value.replace('selected?.appId === "administration" && logisticsAdminAvailable', 'selected?.appId === "administration"'));
rejects("src/hub/appCatalog.ts", (value) => value.replace('["membership:view", "logistics:rules:view"]', '["membership:view"]'));
rejects("api/_lib/logisticsEngineHttp.js", (value) => `${value}\nconst PRODUCTION_PILOT = true;`);
process.stdout.write(`${JSON.stringify({ ok: true, negatives })}\n`);
