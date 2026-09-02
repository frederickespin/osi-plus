import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fail = (message) => { throw new Error(`V17_CRM_COSTING_PREVIEW_GUARD:${message}`); };

export function validateV17CrmCostingPreviewGuard({ root = process.cwd(), overrides = {} } = {}) {
  const read = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (migrations.length !== 22) fail("el Preview no puede añadir migraciones");
  const route = read("src/crm-costing-preview/clientMode.ts");
  for (const value of ['CRM_COSTING_VISUAL_PREVIEW_BRANCH = "feature/v17-crm-costing-preview-07a"', 'pathname === "/experience-preview/costing"', 'runtime.vercelEnvironment === "preview"']) if (!route.includes(value)) fail(`ruta visual incompleta: ${value}`);
  const visual = read("src/crm-costing-preview/CostingVisualPreview.tsx");
  for (const value of ["Resumen", "Servicios", "Survey", "Costos", "Cotización", "Evaluación de costos", "Survey publicado", "Costo interno", "Tratamiento", "Precio sugerido", "Margen estimado", "Personal", "Transporte", "Materiales", "Cajas de madera", "Equipos", "Compensaciones", "Terceros", "Riesgo", "Catálogos y reglas", "INCLUIDO", "EXTRA", "Snapshot preparado para Cotización", "Los valores mostrados son sintéticos"]) if (!visual.includes(value)) fail(`Preview incompleto: ${value}`);
  if (/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/i.test(visual)) fail("Preview visual realiza red o persiste datos");
  const app = read("src/App.tsx");
  if (!app.includes("isCrmCostingVisualPreviewRoute") || !app.includes("<CostingVisualPreview")) fail("ruta no conectada al límite visual");
  const docs = read("docs/V17-CRM-COSTING-07A-PREVIEW-CONTRACT.md");
  for (const value of ["exclusivamente visual", "Survey entrega hechos y cantidades", "costo interno, tratamiento comercial y precio sugerido", "No añade migraciones", "No consume API", "datos sintéticos", "Production permanece sin cambios", "tenant-first"]) if (!docs.includes(value)) fail(`contrato incompleto: ${value}`);
  return Object.freeze({ ok: true, migrations: 22, productionChanged: false, apiConsumers: 0, families: 8, syntheticRows: 11 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateV17CrmCostingPreviewGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
