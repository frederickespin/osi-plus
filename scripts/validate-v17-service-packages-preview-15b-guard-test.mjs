import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17ServicePackagesPreview15BGuard } from "./validate-v17-service-packages-preview-15b-guard.mjs";

const files = [
  "src/commercial-crm/CommercialCaseDetail.tsx", "src/commercial-crm/CommercialInboxModule.tsx", "api/_lib/crmPipelineRead.js",
  "api/_lib/logisticsEngineContract.js", "src/survey/SurveyCasePanel.tsx", "src/survey/SurveyApp.tsx",
  "api/_lib/crmSurveyDomain.js", "src/quote/QuotePanel.tsx", "shared/v17ConsolidatedPreview.js",
];
const baseline = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
let negatives = 0;
function rejects(path, mutate, options = {}) {
  const overrides = new Map(baseline); overrides.set(path, mutate(overrides.get(path)));
  assert.throws(() => validateV17ServicePackagesPreview15BGuard({ overrides, ...options }), /V17_SERVICE_PACKAGES_PREVIEW_15B_GUARD/); negatives += 1;
}
assert.equal(validateV17ServicePackagesPreview15BGuard({ overrides: baseline }).productionApiEnabled, false);
rejects(files[0], (value) => value.replace('["SURVEY", "Survey", ClipboardCheck]', '["SURVEY", "Evaluación", ClipboardCheck]'));
rejects(files[0], (value) => value.replace('["SERVICES", "Servicios", BriefcaseBusiness]', '["RELATIONSHIPS", "Relaciones", BriefcaseBusiness], ["SERVICES", "Servicios", BriefcaseBusiness]'));
rejects(files[4], (value) => value.replace("Método de Survey", "Método oculto"));
rejects(files[6], (value) => value.replace("activeItemTypes >= 10", "activeItemTypes >= 11"));
rejects(files[5], (value) => value.replace("draft.items.length >= 10", "draft.items.length >= 11"));
rejects(files[4], (value) => `${value}\nconst CommunicationPanel = () => null;`);
rejects(files[0], (value) => value.replace('id="case-communications"', 'id="case-events-copy"'));
rejects(files[1], (value) => value.replaceAll("Dir. origen", "Ruta"));
rejects(files[2], (value) => value.replaceAll("PUBLISHED_LOGISTICS", "FRONTEND_GUESS"));
rejects(files[2], (value) => value.replace('where: { family: "TRANSPORT", kind: "VISIT_ZONE" }', 'where: { family: "ZONE" }'));
rejects(files[1], (value) => `${value}\nconst metroCities = ["Santo Domingo"];`);
rejects(files[1], (value) => value.replace("<Pencil />Editar", "Editar no disponible"));
rejects(files[0], (value) => `${value}\nconst Pencil = CommercialCaseForm;`);
rejects(files[0], (value) => value, { migrations: 35 });
console.log(`V17-SERVICE-PACKAGES-PREVIEW-15B guard negatives: ${negatives}/${negatives}`);
