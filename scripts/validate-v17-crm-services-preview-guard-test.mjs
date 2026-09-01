import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17CrmServicesPreviewGuard } from "./validate-v17-crm-services-preview-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
let assertions = 0;
assert.equal(validateV17CrmServicesPreviewGuard().ok, true); assertions += 1;
const visual = read("src/crm-services-preview/ServicesVisualPreview.tsx");
const route = read("src/crm-services-preview/clientMode.ts");
const docs = read("docs/V17-CRM-SERVICES-06A-PREVIEW-CONTRACT.md");
assert.throws(() => validateV17CrmServicesPreviewGuard({ overrides: { "src/crm-services-preview/ServicesVisualPreview.tsx": `${visual}\nfetch("/api/services");` } }), /realiza red/); assertions += 1;
assert.throws(() => validateV17CrmServicesPreviewGuard({ overrides: { "src/crm-services-preview/ServicesVisualPreview.tsx": visual.replace("Servicios complementarios", "Texto libre") } }), /Preview incompleto/); assertions += 1;
assert.throws(() => validateV17CrmServicesPreviewGuard({ overrides: { "src/crm-services-preview/clientMode.ts": route.replace('runtime.vercelEnvironment === "preview"', "true") } }), /ruta visual/); assertions += 1;
assert.throws(() => validateV17CrmServicesPreviewGuard({ overrides: { "docs/V17-CRM-SERVICES-06A-PREVIEW-CONTRACT.md": docs.replace("Production permanece sin cambios", "Production activa") } }), /contrato incompleto/); assertions += 1;
process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
