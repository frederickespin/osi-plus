import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateV17CrmIcpApiGuard } from "./validate-v17-crm-icp-api-guard.mjs";

const fail = (message) => { throw new Error(`V17_CRM_ICP_UI_GUARD:${message}`); };
const requireText = (text, value, message) => { if (!text.includes(value)) fail(message); };
const forbid = (text, pattern, message) => { if (pattern.test(text)) fail(message); };

export function validateV17CrmIcpUiGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const apiReport = validateV17CrmIcpApiGuard({ root, overrides });
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (migrations.length !== 22) fail("el lote UI no puede añadir migraciones");
  if (apiReport.productionApiEnabled !== false || apiReport.uiConsumers !== 1) fail("contrato API o consumidor UI inesperado");

  const mode = read("src/crm-icp-v2/clientMode.ts");
  for (const value of [
    'DISABLED: "DISABLED"', 'LOCAL_ONLY: "LOCAL_ONLY"', 'PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL"',
    'CRM_ICP_V2_UI_PREVIEW_BRANCH = "feature/v17-crm-icp-ui-05c1"',
    'CRM_ICP_V2_UI_PREVIEW_BATCH = "V17-CRM-ICP-05C1-PREVIEW"',
    'runtime.vercelEnvironment === "preview"', 'runtime.gitBranch === CRM_ICP_V2_UI_PREVIEW_BRANCH',
  ]) requireText(mode, value, `compuerta UI incompleta: ${value}`);
  if (mode.split("runtime.gitBranch === CRM_ICP_V2_UI_PREVIEW_BRANCH").length - 1 !== 2) {
    fail("compuerta UI o Preview visual no fijan la rama exacta");
  }
  forbid(mode, /PRODUCTION|main|localStorage|sessionStorage/i, "compuerta UI contiene autoridad productiva o storage");
  if (!/LOCAL_ONLY[\s\S]*hasVercelSignal[\s\S]*isLoopback/.test(mode)) fail("LOCAL_ONLY no queda confinado a loopback sin Vercel");

  const api = read("src/crm-icp-v2/api.ts");
  requireText(api, 'const API_ROOT = "/api/crm/icp-v2"', "cliente no usa prefijo same-origin fijo");
  for (const value of ['credentials: "same-origin"', 'cache: "no-store"', 'referrerPolicy: "no-referrer"', 'Authorization: `Bearer ${token}`', 'assertPrivateJson(response)']) {
    requireText(api, value, `protección cliente ausente: ${value}`);
  }
  forbid(api, /https?:\/\/|localStorage|sessionStorage|tenantId|membershipId|userId|x-tenant|x-user/i, "cliente contiene origen remoto, storage o autoridad interna");
  const unsigned = api.slice(api.indexOf("const unsigned ="), api.indexOf("const normalized ="));
  forbid(unsigned, /estimatedCbm|volume|cbm/i, "payload enviado volvió a incluir volumen");
  requireText(api, "estimatedCbm: null", "hash normalizado no representa volumen pendiente");
  requireText(api, "additionalStops: draft.additionalStops.map", "cliente no conserva orden de paradas");

  const form = read("src/crm-icp-v2/IcpIntakeForm.tsx");
  for (const value of ["Volumen pendiente", "El ICP no calcula volumen", "máximo 8", "pipeline:create:pending-destination", "Crear ICP"]) {
    if (value === "pipeline:create:pending-destination") continue;
    requireText(form, value, `formulario ICP incompleto: ${value}`);
  }
  forbid(form, /estimatedCbm|type="number"|localStorage|sessionStorage/i, "formulario captura volumen o persiste datos sensibles");
  requireText(form, "stops.length >= 8", "límite de ocho paradas ausente");
  requireText(form, "canCreatePendingDestination", "destino pendiente no depende del permiso UI");

  for (const value of ['pathname === "/experience-preview/icp"', 'runtime.vercelEnvironment === "preview"', "runtime.gitBranch === CRM_ICP_V2_UI_PREVIEW_BRANCH"]) {
    requireText(mode, value, `Preview visual no exige build exacto: ${value}`);
  }
  const visual = read("src/crm-icp-v2/IcpVisualPreview.tsx");
  for (const value of ["Preview visual", "sin datos reales", "visualApi", "No realiza solicitudes al servidor"]) {
    requireText(visual, value, `demostración visual incompleta: ${value}`);
  }
  forbid(visual, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|Authorization/i, "demostración visual ejecuta red, auth o storage");
  const app = read("src/App.tsx");
  requireText(app, "isCrmIcpV2VisualPreviewRoute()", "App no monta el Preview visual tras la compuerta exacta");

  const access = read("src/crm-relational/mutationAccess.ts");
  requireText(access, 'pipeline:create:pending-destination', "permiso explícito de destino pendiente ausente");
  const inbox = read("src/commercial-crm/CommercialInboxModule.tsx");
  for (const value of ["isCrmIcpV2UiEnabled", "<IcpIntakeForm", "Nuevo ICP", "El volumen continúa pendiente", "Pendiente de Survey o datos proporcionados"]) {
    requireText(inbox, value, `integración Inbox incompleta: ${value}`);
  }

  const server = read("api/_lib/crmIcpV2ApiHttp.js");
  for (const value of [
    'CRM_ICP_V2_UI_PREVIEW_BRANCH = "feature/v17-crm-icp-ui-05c1"',
    'CRM_ICP_V2_UI_PREVIEW_BATCH = "V17-CRM-ICP-05C1-PREVIEW"',
    "isExactV17CommercialCrmPreviewServerEnvironment(env)",
    'env.CRM_PIPELINE_MUTATION_MODE === "DISABLED"',
  ]) requireText(server, value, `perfil Preview UI incompleto: ${value}`);

  const docs = read("docs/V17-CRM-ICP-05C1-UI-CONTRACT.md");
  for (const value of ["productionApiEnabled=false", "no contiene entrada de volumen ni CBM", "hasta ocho paradas", "Production, `main`", "Fuera de alcance"]) {
    requireText(docs, value, `documentación UI incompleta: ${value}`);
  }
  const packageJson = read("package.json");
  requireText(packageJson, '"test:v17-crm-icp-ui:browser"', "suite browser ICP no está registrada");
  requireText(packageJson, '"test:v17-crm-icp-ui:visual"', "suite de Preview visual no está registrada");
  const workflow = read(".github/workflows/ci.yml");
  if (workflow.split("npm run guard:v17-crm-icp-ui").length - 1 !== 3
    || workflow.split("npm run test:v17-crm-icp-ui:browser").length - 1 !== 1
    || workflow.split("npm run test:v17-crm-icp-ui:visual").length - 1 !== 1) {
    fail("CI no ejecuta guardias y navegadores del lote UI en sus fases canónicas");
  }

  return Object.freeze({ ok: true, migrations: 22, productionApiEnabled: false, uiConsumers: 1, maximumAdditionalStops: 8 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmIcpUiGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
