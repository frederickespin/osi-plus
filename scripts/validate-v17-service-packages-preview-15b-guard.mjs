import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = Object.freeze({
  detail: "src/commercial-crm/CommercialCaseDetail.tsx",
  inbox: "src/commercial-crm/CommercialInboxModule.tsx",
  read: "api/_lib/crmPipelineRead.js",
  logistics: "api/_lib/logisticsEngineContract.js",
  surveyPanel: "src/survey/SurveyCasePanel.tsx",
  surveyApp: "src/survey/SurveyApp.tsx",
  surveyDomain: "api/_lib/crmSurveyDomain.js",
  quote: "src/quote/QuotePanel.tsx",
  shared: "shared/v17ConsolidatedPreview.js",
});
const read = (root, path, overrides) => overrides?.get(path) ?? readFileSync(resolve(root, path), "utf8");
const invariant = (value, message) => { if (!value) throw new Error(`V17_SERVICE_PACKAGES_PREVIEW_15B_GUARD:${message}`); };

export function validateV17ServicePackagesPreview15BGuard({ root = process.cwd(), overrides = new Map(), migrations } = {}) {
  const source = Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, read(root, path, overrides)]));
  const tabs = source.detail.slice(source.detail.indexOf("const TABS"), source.detail.indexOf("] as const") + 10);
  invariant(/\["SUMMARY", "Resumen"[\s\S]*\["SURVEY", "Survey"[\s\S]*\["SERVICES", "Servicios"[\s\S]*\["COSTING", "Costos"[\s\S]*\["QUOTE", "Cotización"/u.test(tabs), "orden Survey a Cotización incorrecto");
  invariant(!/RELATIONSHIPS|LOGISTICS|"Evaluación"/u.test(tabs), "tab paralelo o label anterior reapareció");
  invariant(/Método de Survey/u.test(source.surveyPanel) && /Visita presencial/u.test(source.surveyPanel) && /Visita virtual/u.test(source.surveyPanel) && /Listado \+ fotografías/u.test(source.surveyPanel) && /Mini-visita/u.test(source.surveyPanel), "selector visible de método incompleto");
  invariant(/CRM_SURVEY_MINI_ITEM_TYPE_LIMIT/u.test(source.surveyDomain) && /activeItemTypes >= 10/u.test(source.surveyDomain), "límite Mini no se aplica en servidor");
  invariant(/draft\.items\.length >= 10/u.test(source.surveyApp) && /catalog\.version/u.test(source.surveyApp) && /Estimado \/ Aproximado/u.test(source.surveyApp) && /MINI_SURVEY/u.test(source.surveyApp), "límite o fuente Mini no se representa");
  invariant(!/CommunicationPanel/u.test(source.surveyPanel) && !/CommunicationPanel/u.test(source.quote), "historial de Comunicaciones duplicado");
  invariant((source.detail.match(/<CommunicationPanel\b/gu) || []).length === 1 && /id="case-communications"/u.test(source.detail), "autoridad única de Comunicaciones ausente");
  invariant(/Dir\. origen/u.test(source.inbox) && /Dir\. destino/u.test(source.inbox) && !/label="Ruta"/u.test(source.inbox), "Inbox no usa origen y destino separados");
  invariant(/item\.route\?\.origin/u.test(source.inbox) && /item\.route\?\.destination/u.test(source.inbox) && !/originLocation \|\| "Origen pendiente"/u.test(source.inbox), "Inbox reconstruye ruta legacy");
  invariant(/PUBLISHED_LOGISTICS/u.test(source.read) && /originZoneType/u.test(source.logistics) && /destinationZoneType/u.test(source.logistics), "clasificación publicada por lado ausente");
  invariant(/Fuera de área METRO/u.test(source.inbox) && /TriangleAlert/u.test(source.inbox) && /sr-only/u.test(source.inbox), "advertencia accesible fuera METRO ausente");
  invariant(!/Santo Domingo|Distrito Nacional|latitude|longitude/iu.test(source.inbox), "geografía METRO hard-coded en frontend");
  invariant((source.inbox.match(/>Ficha del caso<\/Button>/gu) || []).length === 1, "acción Ficha duplicada");
  invariant(/<Pencil \/>Editar/u.test(source.inbox) && !/Pencil|CommercialCaseForm|>Editar<\/Button>/u.test(source.detail), "edición general no está confinada al Inbox");
  invariant(/feature\/v17-consolidated-preview/u.test(source.shared) && !/PRODUCTION_(?:READ|PILOT|WRITE)/u.test(source.shared), "Preview dejó de ser fail-closed");
  const migrationCount = migrations ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  invariant(migrationCount === 34, `migraciones:${migrationCount}`);
  return Object.freeze({ ok: true, tabs: 5, communicationsAuthorities: 1, miniItemTypes: 10, migrations: migrationCount, productionApiEnabled: false });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) console.log(JSON.stringify(validateV17ServicePackagesPreview15BGuard()));
