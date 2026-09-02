import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fail = (message) => { throw new Error(`V17_CRM_SURVEY_PREVIEW_GUARD:${message}`); };

export function validateV17CrmSurveyPreviewGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (migrations.length !== 22) fail("el Preview no puede añadir migraciones");
  const route = read("src/crm-survey-preview/clientMode.ts");
  for (const value of ['CRM_SURVEY_VISUAL_PREVIEW_BRANCH = "feature/v17-crm-survey-preview-09a"', 'pathname === "/experience-preview/survey"', 'runtime.vercelEnvironment === "preview"']) if (!route.includes(value)) fail(`ruta visual incompleta: ${value}`);
  const visual = read("src/crm-survey-preview/SurveyVisualPreview.tsx");
  for (const value of ["Asignación", "Facilidades", "Artículos", "Empaque", "Evidencias", "Resumen", "Sólo puede consultar y capturar el servicio asignado", "El ICP no lo calcula", "Permiso de estacionamiento", "Motor Logístico", "Receta v3", "nesting", "Inventario confirma existencia y costo", "Firma del cliente visitado", "no precios", "Marítimo", "Aéreo", "Local", "Almacenaje", "Peso real: pendiente", "Peso cobrable: Cotización", "Publicar resultado de Survey", "Datos sintéticos en este preview"]) if (!visual.includes(value)) fail(`Preview incompleto: ${value}`);
  if (/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/i.test(visual)) fail("Preview visual realiza red o persiste datos");
  const app = read("src/App.tsx");
  if (!app.includes("isCrmSurveyVisualPreviewRoute") || !app.includes("<SurveyVisualPreview")) fail("ruta no conectada al límite visual");
  const docs = read("docs/V17-CRM-SURVEY-09A-PREVIEW-CONTRACT.md");
  for (const value of ["exclusivamente visual", "no fija precios", "no reserva ni descuenta inventario", "resultado publicado e inmutable", "nunca se calcula en ICP", "No añade migraciones", "No consume API", "Production permanece sin cambios", "tenant-first"]) if (!docs.includes(value)) fail(`contrato incompleto: ${value}`);
  return Object.freeze({ ok: true, migrations: 22, productionChanged: false, apiConsumers: 0, previewRoute: "/experience-preview/survey", mobileTerminal: true, syntheticData: true });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmSurveyPreviewGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
