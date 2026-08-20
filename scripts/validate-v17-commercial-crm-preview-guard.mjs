import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "e7128e170188c2fab93ebc5c2768a5e656cb510f";
const read = (path) => readFileSync(path, "utf8");
const fail = (message) => { throw new Error(`V17_COMMERCIAL_CRM_PREVIEW_GUARD:${message}`); };
const requireText = (source, signature, message) => { if (!source.includes(signature)) fail(message); };

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const allowed = new Set([
  ".github/workflows/ci.yml",
  "api/_lib/commercialTenancyWrite.js",
  "api/_lib/crmHttpHeaders.js",
  "api/_lib/crmOwnerCatalogHttp.js",
  "api/_lib/crmPipelineAccess.js",
  "api/_lib/crmPipelineReadHttp.js",
  "api/_lib/http.js",
  "api/_lib/pipelineCaseMutationHttp.js",
  "api/_lib/v17CommercialCrmPreviewAuth.js",
  "api/auth/me.js",
  "docs/V17-COMMERCIAL-CRM-PREVIEW-01B-AUDIT.md",
  "package.json",
  "playwright.crm-01b3b2.config.ts",
  "playwright.v17-commercial-crm-preview.config.ts",
  "scripts/v17-commercial-crm-preview-browser-ci-reporter.mjs",
  "scripts/v17-crm-schema-browser-ci-reporter.mjs",
  "scripts/v17-commercial-crm-preview-http-test.mjs",
  "scripts/v17-app-environment-test.mjs",
  "scripts/v17-commercial-crm-preview-test.mjs",
  "scripts/v17-crm-vary-contract-test.mjs",
  "scripts/mt-01b1-test-helpers.mjs",
  "scripts/crm-01b3b3-disabled-options-test.mjs",
  "scripts/validate-crm-01a-guard-test.mjs",
  "scripts/validate-crm-01a-guard.mjs",
  "scripts/validate-crm-01b3a-guard-test.mjs",
  "scripts/validate-crm-01b3a-guard.mjs",
  "scripts/validate-crm-01b3b1-guard.mjs",
  "scripts/validate-crm-01b3b2-guard.mjs",
  "scripts/validate-v17-commercial-crm-guard.mjs",
  "scripts/validate-v17-commercial-crm-preview-guard.mjs",
  "scripts/validate-v17-crm-vary-guard-test.mjs",
  "scripts/validate-v17-crm-vary-guard.mjs",
  "scripts/validate-v17-hub-guard.mjs",
  "shared/v17CommercialCrmPreview.d.ts",
  "shared/v17CommercialCrmPreview.js",
  "shared/appEnvironment.d.ts",
  "shared/appEnvironment.js",
  "src/App.tsx",
  "src/components/EnvBanner.tsx",
  "src/components/auth/LoginScreen.tsx",
  "src/components/layout/Sidebar.tsx",
  "src/commercial-crm/CommercialInboxModule.tsx",
  "src/crm-relational/clientMode.ts",
  "src/crm-relational/RelationalPipelineModule.tsx",
  "src/crm-relational/api.ts",
  "src/crm-relational/readApi.ts",
  "src/hub/HubWorkspace.tsx",
  "src/hub/hubMode.ts",
  "src/lib/api.ts",
  "src/lib/env.ts",
  "src/lib/sessionStore.ts",
  "src/v17-preview-env.d.ts",
  "tests/v17-commercial-crm-preview/preview-rehearsal.spec.ts",
  "tests/v17-commercial-crm/commercial-inbox.spec.ts",
  "tests/v17-commercial-crm/read-api-adversarial-harness.ts",
  "tests/crm-01b3b2/relational-pipeline.spec.ts",
  "tests/v17-hub/mode-harness.ts",
  "tsconfig.crm-01b3b2.json",
  "tsconfig.v17-commercial-crm.json",
  "vite.config.ts",
]);
const changed = [...new Set([
  ...execFileSync("git", ["diff", "--name-only", BASE, "--"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
])];
for (const path of changed) if (!allowed.has(path)) fail(`archivo fuera de alcance: ${path}`);

const migrations = readdirSync(join("prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name));
if (migrations.length !== 17) fail(`se esperaban 17 migraciones, existen ${migrations.length}`);
if (changed.some((path) => path.startsWith("prisma/") || path === "package-lock.json")) fail("Prisma, migraciones o lockfile modificados");

const basePackage = JSON.parse(execFileSync("git", ["show", `${BASE}:package.json`], { encoding: "utf8" }));
const currentPackage = JSON.parse(read("package.json"));
if (JSON.stringify(basePackage.dependencies) !== JSON.stringify(currentPackage.dependencies)
  || JSON.stringify(basePackage.devDependencies) !== JSON.stringify(currentPackage.devDependencies)) fail("dependencias modificadas");

const shared = read("shared/v17CommercialCrmPreview.js");
for (const signature of [
  '"PREVIEW_REHEARSAL"',
  '"V17-COMMERCIAL-CRM-PREVIEW-01"',
  '"feature/v17-commercial-crm-preview"',
  'environment.VERCEL_ENV === "preview"',
  'environment.COMMERCIAL_TENANCY_WRITE_MODE === TENANT_WRITE',
  'environment.COMMERCIAL_TENANCY_READ_MODE === TENANT_READ',
]) requireText(shared, signature, `autoridad compartida incompleta: ${signature}`);
if (/(?:trim|toUpperCase|toLowerCase)\s*\(/.test(shared)) fail("la autoridad normaliza configuración inválida");

const access = read("api/_lib/crmPipelineAccess.js");
requireText(access, "isExactV17CommercialCrmPreviewServerEnvironment", "backend no usa autoridad canónica");
requireText(access, "CRM_PIPELINE_MUTATION_MODES.DISABLED", "mutaciones no quedan desactivadas");
const authMe = read("api/auth/me.js");
if (authMe.indexOf("requireV17CommercialCrmPreviewSessionMode(process.env)") > authMe.indexOf("findCurrentUser(payload.sub)")) fail("configuración Preview se evalúa después de Prisma");
requireText(authMe, "commercialCrmPreviewAuthorized: true", "servidor no confirma autorización al cliente");

const readHttp = read("api/_lib/crmPipelineReadHttp.js");
  requireText(readHttp, "setCrmPrivateHeaders(res)", "headers privados CRM ausentes");
requireText(readHttp, "cors: false", "CRM read no está restringido a mismo origen");
requireText(readHttp, "assertSameOrigin(req)", "CRM read omite validación de origen");
requireText(readHttp, '["GET", "HEAD"]', "CRM read no congela GET/HEAD");
if (/Access-Control-Allow-Origin|Access-Control-Allow-Credentials/.test(readHttp)) fail("CORS permisivo en CRM read");

const clientMode = read("src/crm-relational/clientMode.ts");
const hubMode = read("src/hub/hubMode.ts");
for (const source of [clientMode, hubMode]) requireText(source, "resolveV17CommercialCrmPreviewClientAuthority", "frontend omite autoridad compartida");
const app = read("src/App.tsx");
requireText(app, "commercialCrmPreviewAuthorized === true", "frontend no exige confirmación del servidor");
requireText(app, "isRelationalCrmReadEnabled() && previewConfirmed", "carga CRM no coordina compuertas");

const relationalApi = read("src/crm-relational/api.ts");
for (const signature of [
  "actual.length !== expected.length",
  "MAX_RESPONSE_BYTES = 1_000_000",
  "data.length > pageSize",
  "root.ok !== true",
  "assigned + unassigned !== total",
]) requireText(relationalApi, signature, `contrato CRM estricto ausente: ${signature}`);
const relationalModule = read("src/crm-relational/RelationalPipelineModule.tsx");
for (const signature of [
  'error.code.startsWith("CRM_PIPELINE_RESPONSE_")',
  "const summarySequence = useRef(0)",
  "Reintentar detalle",
  "!listError && <PipelineList",
]) requireText(relationalModule, signature, `estado CRM determinista ausente: ${signature}`);
const responseSchemaTests = read("tests/crm-01b3b2/relational-pipeline.spec.ts");
if (responseSchemaTests.includes("unrouteAll")) fail("prueba de esquema reutiliza interceptores entre recargas");
for (const signature of [
  "sin reutilizar interceptores",
  "lista rechaza autoridad interna, parciales, tipos y arrays excesivos",
  "detalle rechaza IDs internos, parciales y tipos incorrectos",
  "resumen rechaza autoridad, parciales, tipos y conteos incompatibles",
  "respuesta válida tardía no reemplaza el error contractual vigente",
]) requireText(responseSchemaTests, signature, `cobertura adversarial CRM ausente: ${signature}`);
const crmBrowserConfig = read("playwright.crm-01b3b2.config.ts");
const crmBrowserReporter = read("scripts/v17-crm-schema-browser-ci-reporter.mjs");
requireText(crmBrowserConfig, "v17-crm-schema-browser-ci-reporter.mjs", "CRM browser CI no exige reporter estricto");
requireText(crmBrowserReporter, "EXPECTED_PER_PROJECT = 33", "CRM browser CI no congela 33 pruebas por proyecto");
requireText(crmBrowserReporter, "EXPECTED_TOTAL = 198", "CRM browser CI no congela 198/198");
requireText(crmBrowserReporter, "skipped !== 0", "CRM browser CI no rechaza omisiones");

const vite = read("vite.config.ts");
requireText(vite, "__V17_VERCEL_ENV__", "metadata Vercel de build ausente");
requireText(vite, "__V17_VERCEL_GIT_COMMIT_REF__", "Git ref de build ausente");
const appEnvironment = read("shared/appEnvironment.js");
requireText(appEnvironment, 'UNKNOWN: "unknown"', "entorno desconocido no falla cerrado");
requireText(appEnvironment, "LOOPBACK_HOSTNAMES.includes(hostname)", "loopback no tiene precedencia");
if (/\.trim\(|toUpperCase|toLowerCase/.test(appEnvironment)) fail("resolver ambiental normaliza señales inválidas");
const environmentUi = read("src/lib/env.ts");
requireText(environmentUi, 'preview: "Preview"', "etiqueta Preview no es exacta");
requireText(environmentUi, 'unknown: "Ambiente desconocido"', "fallback desconocido ausente");

const workflow = read(".github/workflows/ci.yml");
if (workflow.includes("V17-COMMERCIAL-CRM-PREVIEW-01") || workflow.includes("PREVIEW_REHEARSAL")) fail("workflow activa el ensayo");
for (const signature of [
  "npm run guard:v17-commercial-crm-preview",
  "npm run test:v17-commercial-crm-preview",
  "npm run test:v17-commercial-crm-preview:http",
  "npm run test:v17-app-environment",
  "npm run test:v17-commercial-crm-preview:browser",
]) requireText(workflow, signature, `CI no exige ${signature}`);
const reporter = read("scripts/v17-commercial-crm-preview-browser-ci-reporter.mjs");
requireText(reporter, "EXPECTED_PER_PROJECT = 4", "reporter no congela cuatro pruebas por proyecto");
requireText(reporter, "EXPECTED_TOTAL = 24", "reporter no congela 24/24");
requireText(reporter, "skipped !== 0", "reporter no rechaza omisiones");
if (!existsSync("dist")) fail("bundle no construido antes de la guardia");
const bundle = filesBelow("dist").filter((path) => path.endsWith(".js")).map(read).join("\n");
for (const forbidden of [
  "CRM_PIPELINE_ACTIVATION_BATCH",
  "COMMERCIAL_TENANCY_ACTIVATION_BATCH",
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_SECRET",
  "postgresql://",
]) if (bundle.includes(forbidden)) fail(`configuración servidor empaquetada: ${forbidden}`);
const mutations = execFileSync("git", ["diff", "--name-only", BASE, "--", "api/crm", "api/_lib/crmPipelineMutationHttp.js", "api/_lib/pipelineCaseDomain.js"], { encoding: "utf8" }).trim();
if (mutations) fail("rutas o dominio de mutación modificados");

console.log(JSON.stringify({ ok: true, migrations: 17, changedFiles: changed.length, mutationsChanged: 0, externalActivation: false }));
