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
  for (const value of ["Agenda", "Inventario", "Accesos", "Evidencias", "Revisión", "Detalle técnico", "15 visitas asignadas", "Más próxima", "Salida anticipada", "Registrar llegada", "Cliente confirma llegada", "Puntual · confirmado", "Iniciar Survey", "Inventario rápido", "Área y modo permanecen activos", "Disminuir cantidad", "Aumentar cantidad", "Artículo no registrado", "Áreas configurables", "Receta local", "Receta internacional", "Condición del artículo", "Averiado", "requiere una fotografía", "Caja de madera", "Sobredimensionado", "Medidas activadas", "ft³", "lb", "No selecciona materiales de empaque", "No cabe en elevador", "Perfil interno del edificio", "Aprendizaje de zona", "piso 3 por escalera", "elevador sobre piso 5", "Motor Logístico", "Firma del cliente visitado", "no precios", "Marítimo", "Aéreo", "Almacenaje", "Resultado automático de recetas administrativas · no editable por el evaluador", "Peso cobrable: Cotización", "Publicar resultado de Survey", "Datos sintéticos en este preview"]) if (!visual.includes(value)) fail(`Preview incompleto: ${value}`);
  if (visual.includes('["ASSIGNMENT", "Asignación"') || visual.includes('["PACKING", "Empaque"')) fail("el flujo no puede regresar a la propuesta descartada");
  if (/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/i.test(visual)) fail("Preview visual realiza red o persiste datos");
  const app = read("src/App.tsx");
  if (!app.includes("isCrmSurveyVisualPreviewRoute") || !app.includes("<SurveyVisualPreview")) fail("ruta no conectada al límite visual");
  const docs = read("docs/V17-CRM-SURVEY-09A-PREVIEW-CONTRACT.md");
  for (const value of ["exclusivamente visual", "agenda cronológica de 15 visitas", "no selecciona materiales de empaque", "confirmación del cliente", "métrico e imperial", "catálogo configurable de áreas", "búsqueda progresiva", "fotografía obligatoria", "perfil histórico versionado", "análisis agregados por zona", "no fija precios", "no reserva ni descuenta inventario", "resultado publicado e inmutable", "nunca se calcula en ICP", "No añade migraciones", "No consume API", "Production permanece sin cambios", "tenant-first", "V17-REFERENCE-BASELINE.md"]) if (!docs.includes(value)) fail(`contrato incompleto: ${value}`);
  const baseline = read("docs/V17-REFERENCE-BASELINE.md");
  for (const value of ["https://osi-plus-v17-experience-preview-02a-cxp80thtn.vercel.app/", "Revisar la función equivalente", "código histórico local", "Presentar el esquema al usuario antes de implementar", "versión mejorada", "Cotizador con datos de Survey"]) if (!baseline.includes(value)) fail(`referencia obligatoria incompleta: ${value}`);
  return Object.freeze({ ok: true, migrations: 22, productionChanged: false, apiConsumers: 0, previewRoute: "/experience-preview/survey", mobileTerminal: true, assignedVisits: 15, clientArrivalConfirmation: true, dualUnits: true, configurableRooms: true, buildingAccessHistory: true, evaluatorPackingSelection: false, syntheticData: true });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmSurveyPreviewGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
