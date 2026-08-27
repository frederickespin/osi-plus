import assert from "node:assert/strict";
import {
  loadV17CommercialCrmPreviewSnapshot,
  validateV17CommercialCrmPreviewSnapshot,
} from "./validate-v17-commercial-crm-preview-guard.mjs";

const actual = loadV17CommercialCrmPreviewSnapshot();
const PR_51_DOCUMENTS = Object.freeze([
  "docs/V17-CANONICAL-UI-ERP-01A-INVENTORY.md",
  "docs/V17-CANONICAL-UI-ERP-01A-MATRIX.csv",
  "docs/V17-CANONICAL-UI-ERP-01A-ROADMAP.md",
  "docs/V17-COMMERCIAL-VERTICAL-01A-SPEC.md",
]);

function clone(snapshot = actual) {
  return {
    files: { ...snapshot.files },
    migrations: [...snapshot.migrations],
    bundlePresent: snapshot.bundlePresent,
    bundleText: snapshot.bundleText,
  };
}

function mutate(path, transform) {
  const snapshot = clone();
  snapshot.files[path] = transform(snapshot.files[path]);
  return snapshot;
}

function mustFail(name, snapshot, expression) {
  assert.throws(() => validateV17CommercialCrmPreviewSnapshot(snapshot), expression, name);
  return { name, passed: true };
}

function mustPass(name, snapshot) {
  assert.equal(validateV17CommercialCrmPreviewSnapshot(snapshot).ok, true, name);
  return { name, passed: true };
}

const results = [
  mustPass("árbol actual", clone()),
  mustFail("default Hub activo", mutate("src/hub/hubMode.ts", (source) => source.replace('DISABLED: "DISABLED"', 'DISABLED: "LOCAL_ONLY"')), /default Hub inseguro/),
  mustFail("default cliente CRM activo", mutate("src/crm-relational/clientMode.ts", (source) => source.replace("return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: true })", "return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY, valid: true })")), /default cliente CRM no falla cerrado/),
  mustFail("default lectura CRM activo", mutate("src/crm-relational/clientMode.ts", (source) => source.replace("return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.DISABLED, valid: true })", "return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.READ_ONLY, valid: true })")), /default lectura CRM no falla cerrado/),
  mustFail("rama Preview alterada", mutate("shared/v17CommercialCrmPreview.js", (source) => source.replace("feature/v17-commercial-crm-preview", "main")), /autoridad Preview incompleta/),
  mustFail("batch Preview alterado", mutate("shared/v17CommercialCrmPreview.js", (source) => source.replace("V17-COMMERCIAL-CRM-PREVIEW-01", "ALTERED")), /autoridad Preview incompleta/),
  mustFail("Preview permitido en Production", mutate("shared/v17CommercialCrmPreview.js", (source) => source.replace('environment.VERCEL_ENV === "preview"', 'environment.VERCEL_ENV === "production"')), /autoridad Preview incompleta/),
  mustFail("mutación Preview sustituida por modo local", mutate("shared/v17CommercialCrmPreview.js", (source) => source.replace("[DISABLED, V17_COMMERCIAL_CRM_PREVIEW_MODE]", "[DISABLED, LOCAL_ONLY]")), /autoridad Preview incompleta/),
  mustFail("mutaciones comerciales generales activadas", mutate("shared/v17CommercialCrmPreview.js", (source) => source.replace("environment.COMMERCIAL_TENANCY_MUTATION_MODE === DISABLED", "environment.COMMERCIAL_TENANCY_MUTATION_MODE === LOCAL_ONLY")), /autoridad Preview incompleta/),
  mustFail("Preview eliminado de la mutación focal", mutate("api/_lib/crmCaseMutationHttp.js", (source) => source.replace("mode !== CRM_PIPELINE_MUTATION_MODES.PREVIEW_REHEARSAL", "mode !== CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY")), /mutación focal no limita Preview exacto/),
  mustFail("mutaciones históricas habilitadas en Preview", mutate("api/_lib/pipelineCaseMutationHttp.js", (source) => source.replace('throw new CommercialTenancyError("CRM_PIPELINE_MUTATIONS_DISABLED", 409);', "return mode;")), /mutaciones históricas se habilitan/),
  mustFail("deniedPermissions ignorado", mutate("src/hub/hubAccess.ts", (source) => source.replace("application.requiredPermissions.some((permission) => denied.has(permission))", "false")), /deniedPermissions no prevalece/),
  mustFail("alias CRM sin decisión compartida", mutate("src/hub/appCatalog.ts", (source) => source.replace('routeAliases: ["/crm", "/sales/pipeline"]', 'routeAliases: ["/sales/pipeline"]')), /rutas CRM equivalentes divergentes/),
  mustFail("ruta directa sin decisión común", mutate("src/hub/hubRouteAccess.ts", (source) => source.replace("evaluateHubAccess(application, context)", "{ allowed: true }")), /ruta directa omite decisión común/),
  mustFail("CORS wildcard alcanza Auth, Admin y CRM", mutate("vercel.json", (source) => source.replace("/api/((?!auth/|admin/|crm/|clients(?:/|$)|projects(?:/|$)|k/project-(?:validate|release)(?:/|$)).*)", "/api/(.*)")), /Auth y CRM no están excluidos/),
  mustFail("Inbox importa localStorage", mutate("src/commercial-crm/CommercialInboxModule.tsx", (source) => `${source}\nlocalStorage.getItem("fixture");\n`), /storage empresarial importado/),
  mustFail("Inbox importa mock", mutate("src/commercial-crm/CommercialInboxModule.tsx", (source) => `import { fixture } from "@/mocks/cases";\n${source}`), /mock, bridge o store importado/),
  mustFail("resolver canónico eliminado", mutate("src/hub/hubMode.ts", (source) => source.replaceAll("resolveV17CommercialCrmPreviewClientAuthority", "unsafePreviewResolver")), /default Hub inseguro/),
  mustFail("confirmación servidor omitida", mutate("src/App.tsx", (source) => source.replace("isRelationalCrmReadEnabled() && serverConfirmed", "isRelationalCrmReadEnabled()")), /frontend no coordina Hub\/cliente\/lectura/),
  mustFail("variable privada incluida en bundle", { ...clone(), bundleText: `${actual.bundleText}\nJWT_SECRET` }, /configuración servidor empaquetada: JWT_SECRET/),
  mustPass("PR #51 documental 4/4", { ...clone(), unrelatedChanges: PR_51_DOCUMENTS }),
  mustPass("corrección accesible del drawer", mutate("src/commercial-crm/CommercialInboxModule.tsx", (source) => source.replace("Detalle de la oportunidad comercial seleccionada.", "Descripción accesible actualizada."))),
  mustPass("cambio no relacionado", { ...clone(), unrelatedChanges: ["src/components/unrelated.tsx"] }),
  mustPass("checkout shallow sin historial", { ...clone(), gitHistoryAvailable: false }),
  mustPass("main sin diff de PR", { ...clone(), gitRef: "main", changedFiles: [] }),
];

const guardSource = actual.files["scripts/validate-v17-commercial-crm-preview-guard.mjs"];
assert.equal(/node:child_process|git\s+(?:diff|merge-base)|const\s+BASE\s*=/.test(guardSource), false);

console.log(JSON.stringify({ ok: true, assertions: results.length, negative: 19, positive: 6, results }, null, 2));
