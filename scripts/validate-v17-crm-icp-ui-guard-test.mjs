import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17CrmIcpUiGuard } from "./validate-v17-crm-icp-ui-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
let assertions = 0;
const rejected = (name, overrides, pattern) => { assert.throws(() => validateV17CrmIcpUiGuard({ overrides }), pattern, name); assertions += 1; };
assert.equal(validateV17CrmIcpUiGuard().ok, true); assertions += 1;

const mode = read("src/crm-icp-v2/clientMode.ts");
const api = read("src/crm-icp-v2/api.ts");
const form = read("src/crm-icp-v2/IcpIntakeForm.tsx");
const access = read("src/crm-relational/mutationAccess.ts");
const inbox = read("src/commercial-crm/CommercialInboxModule.tsx");
const server = read("api/_lib/crmIcpV2ApiHttp.js");
const docs = read("docs/V17-CRM-ICP-05C1-UI-CONTRACT.md");
const visual = read("src/crm-icp-v2/IcpVisualPreview.tsx");
const workflow = read(".github/workflows/ci.yml");

rejected("UI productiva", { "src/crm-icp-v2/clientMode.ts": `${mode}\nconst PRODUCTION = true;` }, /productiva/);
rejected("rama Preview relajada", { "src/crm-icp-v2/clientMode.ts": mode.replace("runtime.gitBranch === CRM_ICP_V2_UI_PREVIEW_BRANCH", "true") }, /compuerta UI/);
rejected("API remoto", { "src/crm-icp-v2/api.ts": api.replace('const API_ROOT = "/api/crm/icp-v2"', 'const API_ROOT = "https://example.invalid/api/crm/icp-v2"') }, /same-origin|origen remoto/);
rejected("credenciales omitidas", { "src/crm-icp-v2/api.ts": api.replace('credentials: "same-origin"', 'credentials: "omit"') }, /protección cliente/);
rejected("tenant desde navegador", { "src/crm-icp-v2/api.ts": `${api}\nconst tenantId = "unsafe";` }, /autoridad interna/);
rejected("volumen enviado", { "src/crm-icp-v2/api.ts": api.replace("const unsigned = {", "const unsigned = { estimatedCbm: 12,") }, /payload enviado/);
rejected("campo numérico", { "src/crm-icp-v2/IcpIntakeForm.tsx": `${form}\nconst unsafe = <input type=\"number\" />;` }, /captura volumen/);
rejected("más de ocho paradas", { "src/crm-icp-v2/IcpIntakeForm.tsx": form.replace("stops.length >= 8", "stops.length >= 20") }, /ocho paradas/);
rejected("permiso pendiente retirado", { "src/crm-relational/mutationAccess.ts": access.replace('const CREATE_PENDING_DESTINATION = "pipeline:create:pending-destination";', 'const CREATE_PENDING_DESTINATION = "pipeline:create";') }, /permiso explícito/);
rejected("Inbox desconectado", { "src/commercial-crm/CommercialInboxModule.tsx": inbox.replace("<IcpIntakeForm", "<LegacyForm") }, /integración Inbox/);
rejected("API Preview UI desconectada", { "api/_lib/crmIcpV2ApiHttp.js": server.replace("isExactV17CommercialCrmPreviewServerEnvironment(env)", "true") }, /perfil Preview UI/);
rejected("documentación sin límite", { "docs/V17-CRM-ICP-05C1-UI-CONTRACT.md": docs.replace("no contiene entrada de volumen ni CBM", "captura volumen") }, /documentación UI/);
rejected("Preview visual con red", { "src/crm-icp-v2/IcpVisualPreview.tsx": `${visual}\nfetch(\"/api/private\");` }, /demostración visual/);
rejected("CI omite navegador ICP", { ".github/workflows/ci.yml": workflow.replace("npm run test:v17-crm-icp-ui:browser", "true") }, /CI no ejecuta/);

process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
