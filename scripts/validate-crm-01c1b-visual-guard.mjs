import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const invariant = (condition, message) => { if (!condition) throw new Error(`CRM01C1B_VISUAL_GUARD:${message}`); };
const negative = process.env.CRM01C1B_VISUAL_GUARD_NEGATIVE_CASE;
const sources = {
  module: read("src/crm-relational/RelationalPipelineModule.tsx"),
  app: read("src/App.tsx"),
  sidebar: read("src/components/layout/Sidebar.tsx"),
  env: read("src/lib/env.ts"),
  vite: read("vite.config.ts"),
  vercel: read("vercel.json"),
  config: read("playwright.crm-01c1b.config.ts"),
  spec: read("tests/crm-01c1b/commercial-workspace.spec.ts"),
  environmentTest: read("tests/crm-01c1b/environment.ts"),
  workflow: read(".github/workflows/ci.yml"),
};
if (negative === "legacy-store") sources.module += '\nimport "@/lib/salesStore";';
if (negative === "relative-base") sources.vite = sources.vite.replace("base: '/',", "base: './',");
if (negative === "production-fallback") sources.env = sources.env.replace('return "unknown";', 'return "production";');
if (negative === "missing-browser-suite") sources.workflow = sources.workflow.replace("npm run test:crm-01c1b:browser", "npm run build");

const forbidden = ["useCasesStore", "pipeline/apiClient", "mocks", "localCaseCache", "salesStore", "caseBridge", "commercialAuditStore", "osi-plus.pipeline", "DOMPurify 3.3.1"];
for (const token of forbidden) invariant(!sources.module.includes(token), `referencia heredada prohibida:${token}`);
invariant(!/\b28\b/.test(sources.module), "no se pueden hardcodear 28 casos locales");
invariant(/const PAGE_SIZE = 25/.test(sources.module), "la página debe permanecer en 25 filas");
invariant(/Inbox Comercial/.test(sources.module) && /Owner/.test(sources.module), "falta la experiencia relacional canónica");
invariant(/CRM_PIPELINE_PATH = '\/sales\/pipeline'/.test(sources.app), "deep link canónico ausente");
invariant(/canAccessModule\(role, 'crm-pipeline'\)/.test(sources.app), "el deep link debe respetar el mapa canónico");
invariant(/base:\s*'\/'/.test(sources.vite), "los assets deben ser absolutos desde raíz");
invariant(sources.vercel.includes('"destination": "/index.html"'), "rewrite SPA ausente");
invariant(/VERCEL_ENV === "preview"/.test(sources.env), "Preview debe identificarse con metadata pública");
invariant(/VERCEL_ENV === "production" && environment\.VERCEL_GIT_COMMIT_REF === "main"/.test(sources.env), "Production requiere ambiente y main");
invariant(/return "unknown"/.test(sources.env) && /Entorno no identificado/.test(sources.env), "identidad desconocida debe fallar cerrada");
invariant(/Pipeline CRM/.test(sources.sidebar) && /Inbox Comercial relacional/.test(sources.sidebar), "menú comercial canónico ausente");
invariant(!/useCasesStore|localCaseCache|salesStore|caseBridge|commercialAuditStore/.test(sources.spec), "las pruebas no pueden reintroducir stores heredados");
for (const project of ["chromium-desktop", "firefox-desktop", "webkit-desktop", "chromium-mobile", "firefox-mobile", "webkit-mobile"]) {
  invariant(sources.config.includes(`name: "${project}"`), `navegador omitido:${project}`);
}
invariant(sources.spec.includes('page.goto("/sales/pipeline")') && sources.spec.includes("page.reload()"), "deep link y refresh no están cubiertos");
invariant(sources.environmentTest.includes('VITE_APP_ENV: "production"') && sources.spec.includes('appEnvOnly: "unknown"'), "falta guardia ejecutable contra Production implícita");
invariant(sources.workflow.includes("node scripts/validate-crm-01c1b-visual-guard.mjs"), "CI no ejecuta la guardia visual");
invariant(sources.workflow.includes("npm run test:crm-01c1b:browser"), "CI no ejecuta los seis perfiles visuales");

const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter((item) => item.isDirectory());
invariant(migrations.length === 16, "se exigen exactamente 16 migraciones");
console.log("CRM-01C1B visual guard: PASS (6 perfiles, 16 migraciones)");
