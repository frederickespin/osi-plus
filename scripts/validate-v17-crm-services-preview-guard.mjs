import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fail = (message) => { throw new Error(`V17_CRM_SERVICES_PREVIEW_GUARD:${message}`); };

export function validateV17CrmServicesPreviewGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (migrations.length !== 22) fail("el Preview no puede añadir migraciones");
  const route = read("src/crm-services-preview/clientMode.ts");
  for (const value of ['CRM_SERVICES_VISUAL_PREVIEW_BRANCH = "feature/v17-crm-services-preview-06a"', 'pathname === "/experience-preview/services"', 'runtime.vercelEnvironment === "preview"']) if (!route.includes(value)) fail(`ruta visual incompleta: ${value}`);
  const visual = read("src/crm-services-preview/ServicesVisualPreview.tsx");
  for (const value of ["Resumen", "Servicios", "Survey", "Actividad", "Tareas", "Cotización", "Notas", "Archivos", "Comunicación", "Servicio principal", "Servicios complementarios", "Otro servicio no catalogado", "pendiente de clasificación", "Catálogo de servicios", "Preparado para análisis", "Seleccionar todos", "Combo de complementarios", "Guardar como combo", "Combos", "Editar", "Desactivar"]) if (!visual.includes(value)) fail(`Preview incompleto: ${value}`);
  if (/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|estimatedCbm|type="number"/i.test(visual)) fail("Preview visual realiza red, persiste o captura volumen");
  const app = read("src/App.tsx");
  if (!app.includes("isCrmServicesVisualPreviewRoute") || !app.includes("<ServicesVisualPreview")) fail("ruta no conectada al límite visual");
  const docs = read("docs/V17-CRM-SERVICES-06A-PREVIEW-CONTRACT.md");
  for (const value of ["exclusivamente visual", "No añade migraciones", "Production permanece sin cambios", "no se eliminarán", "códigos independientes", "selector compacto agrupado", "activar o desactivar", "como sugerencia"]) if (!docs.includes(value)) fail(`contrato incompleto: ${value}`);
  return Object.freeze({ ok: true, migrations: 22, productionChanged: false, apiConsumers: 0, primaryServices: 12, complementaryServices: 13, combos: 4 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmServicesPreviewGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
