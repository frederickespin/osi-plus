import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17ConsolidatedPreviewGuard } from "./validate-v17-consolidated-preview-guard.mjs";

const files = [
  "src/commercial-crm/CommercialCaseDetail.tsx", "src/commercial-crm/CommercialInboxModule.tsx", "src/hub/HubWorkspace.tsx", "src/App.tsx",
  "src/survey/SurveyCasePanel.tsx", "src/crm-icp-v2/IcpIntakeForm.tsx", "src/quote/QuotePanel.tsx", "src/costing/CostingPanel.tsx", "shared/v17ConsolidatedPreview.js",
  "api/_lib/crmIcpV2ApiHttp.js", "api/_lib/crmServicesHttp.js", "api/_lib/crmSurveyHttp.js", "api/_lib/materialsInventoryHttp.js",
  "api/_lib/toolsEquipmentHttp.js", "api/_lib/logisticsEngineHttp.js", "api/_lib/costingHttp.js", "api/_lib/quoteHttp.js",
];
const baseline = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
const cases = [];
function rejects(name, path, mutate, options = {}) { const overrides = new Map(baseline); overrides.set(path, mutate(overrides.get(path))); assert.throws(() => validateV17ConsolidatedPreviewGuard({ overrides, ...options }), /V17_CONSOLIDATED_PREVIEW_GUARD/); cases.push(name); }
assert.equal(validateV17ConsolidatedPreviewGuard({ overrides: baseline }).productionApiEnabled, false);
rejects("orden tabs", files[0], (value) => value.replace('["SURVEY", "Survey"', '["QUOTE", "Survey"'));
rejects("tab paralelo", files[0], (value) => value.replace('] as const', ', ["ACTIVITY", "Actividad", FileText]] as const'));
rejects("Survey sin gate", files[0], (value) => value.replaceAll("surveyEnabled", "true"));
rejects("ERP eager", files[2], (value) => value.replace("const AdvancedErpShell = lazy", "const AdvancedErpShell = eager"));
rejects("recurso sin permiso", files[2], (value) => value.replaceAll("materialsAuthorized", "true"));
rejects("ICP no navega", files[1], (value) => value.replaceAll("openFullCase(receipt.caseRef)", "setCreateOpen(false)"));
rejects("Survey selecciona material", files[4], (value) => `${value}\nconst MaterialsInventory = {};`);
rejects("Quote recalcula Costing", files[6], (value) => `${value}\ncostingApi.calculate({});`);
rejects("Costing recalcula Motor", files[7], (value) => `${value}\nlogisticsApi.calculate({});`);
rejects("ICP añade volumen", files[5], (value) => `${value}\nconst estimatedCbm = 10;`);
rejects("Production mode", "api/_lib/quoteHttp.js", (value) => `${value}\nconst PRODUCTION_PILOT = true;`);
rejects("migración 30", files[0], (value) => value, { migrations: 30 });
console.log(`V17-CONSOLIDATED-PREVIEW-10A guard negatives: ${cases.length}/${cases.length}`);
