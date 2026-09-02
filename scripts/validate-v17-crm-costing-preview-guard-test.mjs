import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17CrmCostingPreviewGuard } from "./validate-v17-crm-costing-preview-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
let assertions = 0;
assert.equal(validateV17CrmCostingPreviewGuard().ok, true); assertions += 1;
const visual = read("src/crm-costing-preview/CostingVisualPreview.tsx");
const route = read("src/crm-costing-preview/clientMode.ts");
const docs = read("docs/V17-CRM-COSTING-07A-PREVIEW-CONTRACT.md");
assert.throws(() => validateV17CrmCostingPreviewGuard({ overrides: { "src/crm-costing-preview/CostingVisualPreview.tsx": `${visual}\nfetch("/api/costs");` } }), /realiza red/); assertions += 1;
assert.throws(() => validateV17CrmCostingPreviewGuard({ overrides: { "src/crm-costing-preview/CostingVisualPreview.tsx": visual.replaceAll("Costo interno", "Costo mezclado") } }), /Preview incompleto/); assertions += 1;
assert.throws(() => validateV17CrmCostingPreviewGuard({ overrides: { "src/crm-costing-preview/clientMode.ts": route.replace('runtime.vercelEnvironment === "preview"', "true") } }), /ruta visual/); assertions += 1;
assert.throws(() => validateV17CrmCostingPreviewGuard({ overrides: { "docs/V17-CRM-COSTING-07A-PREVIEW-CONTRACT.md": docs.replace("Production permanece sin cambios", "Production activa") } }), /contrato incompleto/); assertions += 1;
process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
