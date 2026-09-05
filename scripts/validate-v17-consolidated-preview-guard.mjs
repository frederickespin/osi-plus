import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODES = Object.freeze([
  "api/_lib/crmIcpV2ApiHttp.js", "api/_lib/crmServicesHttp.js", "api/_lib/crmSurveyHttp.js",
  "api/_lib/materialsInventoryHttp.js", "api/_lib/toolsEquipmentHttp.js", "api/_lib/logisticsEngineHttp.js",
  "api/_lib/costingHttp.js", "api/_lib/quoteHttp.js",
]);
function read(root, path, overrides) { return overrides?.get(path) ?? readFileSync(resolve(root, path), "utf8"); }
function invariant(value, message) { if (!value) throw new Error(`V17_CONSOLIDATED_PREVIEW_GUARD:${message}`); }

export function validateV17ConsolidatedPreviewGuard({ root = process.cwd(), overrides = new Map(), migrations } = {}) {
  const detail = read(root, "src/commercial-crm/CommercialCaseDetail.tsx", overrides);
  const inbox = read(root, "src/commercial-crm/CommercialInboxModule.tsx", overrides);
  const hub = read(root, "src/hub/HubWorkspace.tsx", overrides);
  const app = read(root, "src/App.tsx", overrides);
  const survey = read(root, "src/survey/SurveyCasePanel.tsx", overrides);
  const icp = read(root, "src/crm-icp-v2/IcpIntakeForm.tsx", overrides);
  const quote = read(root, "src/quote/QuotePanel.tsx", overrides);
  const costing = read(root, "src/costing/CostingPanel.tsx", overrides);
  const shared = read(root, "shared/v17ConsolidatedPreview.js", overrides);
  const expectedTabs = ["SUMMARY", "SERVICES", "SURVEY", "LOGISTICS", "COSTING", "QUOTE"];
  const tabBlock = detail.slice(detail.indexOf("const TABS"), detail.indexOf("] as const") + 10);
  const positions = expectedTabs.map((tab) => tabBlock.indexOf(`\"${tab}\"`));
  invariant(positions.every((position) => position >= 0) && positions.every((position, index) => index === 0 || position > positions[index - 1]), "orden de tabs canónico ausente");
  invariant(!/ACTIVITY|TASKS|NOTES|FILES|COMMUNICATION/u.test(tabBlock), "tabs paralelos reaparecieron");
  for (const gate of ["servicesEnabled", "surveyEnabled", "logisticsEnabled", "costingEnabled", "quoteEnabled"]) invariant(detail.includes(gate), `feature gate ausente:${gate}`);
  invariant(/const AdvancedErpShell = lazy/u.test(hub) && /selected\?\.appId === "commercial-crm" && crmReadEnabled/u.test(hub), "ERP carga antes del gate comercial");
  invariant(/surveyAuthorized/u.test(hub) && /materialsAuthorized/u.test(hub) && /toolsAuthorized/u.test(hub), "recursos cargan sin capacidad efectiva");
  invariant(/clearTenantScopedState/u.test(app) && /handleMembershipChange/u.test(app) && /replaceState/u.test(app), "cambio de tenant no limpia contexto y navegación");
  invariant(/openFullCase\(receipt\.caseRef\)/u.test(inbox) && !/icpReceipt\.caseRef/u.test(inbox), "ICP no conduce a Ficha o expone referencia opaca");
  invariant(!/materials-inventory|MaterialsInventory|<select/iu.test(survey), "Survey selecciona materiales");
  invariant(!/costingApi\.calculate/u.test(quote), "Quote recalcula Costing");
  invariant(!/logisticsApi\.calculate/u.test(costing), "Costing recalcula Motor Logístico");
  invariant(!/estimatedCbm|Volumen estimado|volume/iu.test(icp), "ICP contiene volumen");
  invariant(/Listo para Operaciones/u.test(quote) && /!accepted && access\.canRecordDecision/u.test(quote), "aceptación única no congela otras propuestas");
  invariant(/feature\/v17-consolidated-preview/u.test(shared) && !/PRODUCTION/u.test(shared), "rama Preview consolidada no es exacta");
  for (const path of MODES) {
    const source = read(root, path, overrides);
    invariant(/PREVIEW_REHEARSAL/u.test(source) && /isV17ConsolidatedPreviewBranch/u.test(source), `modo Preview no integrado:${path}`);
    invariant(!/PRODUCTION_(?:READ|PILOT|WRITE)/u.test(source), `modo Production introducido:${path}`);
  }
  const migrationCount = migrations ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  invariant(migrationCount === 29, `migraciones:${migrationCount}`);
  invariant(!/Auth V2|VITE_MT01B2_CLIENT_ENABLED=true/u.test(shared + detail + hub), "Auth V2 activado");
  return Object.freeze({ ok: true, tabs: expectedTabs.length, domains: 9, migrations: migrationCount, productionApiEnabled: false });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) console.log(JSON.stringify(validateV17ConsolidatedPreviewGuard()));
