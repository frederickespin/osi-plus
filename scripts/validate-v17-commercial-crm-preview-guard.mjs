import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const PREFIX = "V17_COMMERCIAL_CRM_PREVIEW_GUARD";

export const PREVIEW_GUARD_FILES = Object.freeze([
  ".github/workflows/ci.yml",
  "api/_lib/crmCaseMutationHttp.js",
  "api/_lib/pipelineCaseMutationHttp.js",
  "api/_lib/crmPipelineAccess.js",
  "api/auth/me.js",
  "shared/appEnvironment.js",
  "shared/v17CommercialCrmPreview.js",
  "scripts/validate-v17-commercial-crm-preview-guard.mjs",
  "src/App.tsx",
  "src/commercial-crm/AdvancedErpShell.tsx",
  "src/commercial-crm/CommercialInboxModule.tsx",
  "src/commercial-crm/CommercialCaseDetail.tsx",
  "src/commercial-crm/presentation.ts",
  "src/crm-relational/clientMode.ts",
  "src/crm-relational/mutationApi.ts",
  "src/crm-relational/readApi.ts",
  "src/hub/HubWorkspace.tsx",
  "src/hub/hubRouteAccess.ts",
  "src/components/auth/CanonicalAccessDenied.tsx",
  "src/components/auth/CanonicalAuthorizationError.tsx",
  "src/hub/appCatalog.ts",
  "src/hub/hubAccess.ts",
  "src/hub/hubMode.ts",
  "src/lib/env.ts",
  "src/lib/api.ts",
  "vercel.json",
  "vite.config.ts",
]);

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function fail(message) {
  throw new Error(`${PREFIX}:${message}`);
}

function requireText(files, path, signature, message) {
  const source = files[path];
  if (typeof source !== "string") fail(`archivo protegido ausente: ${path}`);
  if (!source.includes(signature)) fail(message);
}

function forbidText(files, path, expression, message) {
  const source = files[path];
  if (typeof source !== "string") fail(`archivo protegido ausente: ${path}`);
  if (expression.test(source)) fail(message);
}

function requirePattern(files, path, expression, message) {
  const source = files[path];
  if (typeof source !== "string") fail(`archivo protegido ausente: ${path}`);
  if (!expression.test(source)) fail(message);
}

function validateCspAndCors(files) {
  let configuration;
  try {
    configuration = JSON.parse(files["vercel.json"]);
  } catch {
    fail("vercel.json inválido");
  }
  const apiRules = (configuration.headers || []).filter((rule) => String(rule.source || "").startsWith("/api/"));
  if (apiRules.length !== 0) fail("CORS de plataforma puede alcanzar namespaces protegidos");
}

function validateInboxIsolation(files) {
  for (const path of [
    "src/commercial-crm/AdvancedErpShell.tsx",
    "src/commercial-crm/CommercialInboxModule.tsx",
    "src/commercial-crm/CommercialCaseDetail.tsx",
    "src/commercial-crm/presentation.ts",
    "src/crm-relational/readApi.ts",
  ]) {
    forbidText(files, path, /\b(?:localStorage|sessionStorage|indexedDB)\b/, `storage empresarial importado por Inbox: ${path}`);
    forbidText(
      files,
      path,
      /(?:import|from)\s*(?:\([^)]*)?["'][^"']*(?:mocks?|useCasesStore|salesStore|caseBridge|Store)[^"']*["']/i,
      `mock, bridge o store importado por Inbox: ${path}`,
    );
  }
}

export function validateV17CommercialCrmPreviewSnapshot(snapshot) {
  const files = snapshot?.files || {};
  const migrations = snapshot?.migrations || [];

  if (migrations.length !== 20) fail(`se esperaban 20 migraciones, existen ${migrations.length}`);

  const shared = "shared/v17CommercialCrmPreview.js";
  for (const signature of [
    'V17_COMMERCIAL_CRM_PREVIEW_MODE = "PREVIEW_REHEARSAL"',
    'V17_COMMERCIAL_CRM_PREVIEW_BATCH = "V17-COMMERCIAL-CRM-PREVIEW-01"',
    'V17_COMMERCIAL_CRM_PREVIEW_BRANCH = "feature/v17-commercial-crm-preview"',
    'environment.VERCEL === "1"',
    'environment.VERCEL_ENV === "preview"',
    "environment.VERCEL_GIT_COMMIT_REF === V17_COMMERCIAL_CRM_PREVIEW_BRANCH",
    "exactOneOf(environment.CRM_PIPELINE_MUTATION_MODE, [DISABLED, V17_COMMERCIAL_CRM_PREVIEW_MODE])",
    "environment.VITE_OSI_HUB_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE",
    "environment.VITE_CRM_PIPELINE_CLIENT_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE",
    "environment.VITE_CRM_PIPELINE_READ_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE",
    "environment.COMMERCIAL_TENANCY_MUTATION_MODE === DISABLED",
    "configuration.gitBranch === V17_COMMERCIAL_CRM_PREVIEW_BRANCH",
  ]) requireText(files, shared, signature, `autoridad Preview incompleta: ${signature}`);
  forbidText(files, shared, /(?:\.trim\(|toUpperCase|toLowerCase)/, "la autoridad Preview normaliza configuración inválida");

  const access = "api/_lib/crmPipelineAccess.js";
  for (const signature of [
    'DISABLED: "DISABLED"',
    "CRM_PIPELINE_READ_MODES.DISABLED",
    "CRM_PIPELINE_MUTATION_MODES.DISABLED",
    "isExactV17CommercialCrmPreviewServerEnvironment(env)",
    "readMode === CRM_PIPELINE_READ_MODES.PREVIEW_REHEARSAL",
    "mutationMode === CRM_PIPELINE_MUTATION_MODES.DISABLED",
    "mutationMode === CRM_PIPELINE_MUTATION_MODES.PREVIEW_REHEARSAL",
  ]) requireText(files, access, signature, `compuerta backend incompleta: ${signature}`);
  const mutationBlock = files[access]?.match(/export const CRM_PIPELINE_MUTATION_MODES[\s\S]*?\}\);/)?.[0] || "";
  if (!mutationBlock.includes("PREVIEW_REHEARSAL")) fail("compuerta focal de casos no admite Preview exacto");
  const caseMutation = "api/_lib/crmCaseMutationHttp.js";
  requireText(files, caseMutation, "mode !== CRM_PIPELINE_MUTATION_MODES.PREVIEW_REHEARSAL", "mutación focal no limita Preview exacto");
  const historicMutation = "api/_lib/pipelineCaseMutationHttp.js";
  requireText(files, historicMutation, 'throw new CommercialTenancyError("CRM_PIPELINE_MUTATIONS_DISABLED", 409)', "mutaciones históricas se habilitan en Preview");

  const hubMode = "src/hub/hubMode.ts";
  for (const signature of [
    'DISABLED: "DISABLED"',
    "raw === undefined || raw === OSI_HUB_MODES.DISABLED",
    "resolveV17CommercialCrmPreviewClientAuthority",
  ]) requireText(files, hubMode, signature, `default Hub inseguro: ${signature}`);
  requirePattern(files, hubMode, /if \(raw === undefined \|\| raw === OSI_HUB_MODES\.DISABLED\)\s*\{\s*return Object\.freeze\(\{ mode: OSI_HUB_MODES\.DISABLED, enabled: false, valid: true, reason: "DISABLED" \}\)/, "default Hub no falla cerrado");

  const clientMode = "src/crm-relational/clientMode.ts";
  for (const signature of [
    'DISABLED: "DISABLED"',
    "if (raw === undefined)",
    "raw === undefined || raw === CRM_PIPELINE_READ_CLIENT_MODES.DISABLED",
    "resolveV17CommercialCrmPreviewClientAuthority",
  ]) requireText(files, clientMode, signature, `default cliente/lectura inseguro: ${signature}`);
  requirePattern(files, clientMode, /if \(raw === undefined\)\s*return Object\.freeze\(\{ mode: CRM_PIPELINE_CLIENT_MODES\.DISABLED, valid: true \}\)/, "default cliente CRM no falla cerrado");
  requirePattern(files, clientMode, /if \(raw === undefined \|\| raw === CRM_PIPELINE_READ_CLIENT_MODES\.DISABLED\)\s*\{\s*return Object\.freeze\(\{ mode: CRM_PIPELINE_READ_CLIENT_MODES\.DISABLED, valid: true \}\)/, "default lectura CRM no falla cerrado");
  requireText(files, "src/crm-relational/mutationApi.ts", "CRM_PIPELINE_CLIENT_MODES.PREVIEW_REHEARSAL", "frontend no habilita el formulario sólo en Preview autorizado");

  const authMe = "api/auth/me.js";
  requireText(files, authMe, "requireV17CommercialCrmPreviewSessionMode(process.env)", "Auth omite compuerta Preview");
  requireText(files, authMe, "commercialCrmPreviewAuthorized: true", "Auth no confirma Preview al frontend");
  if (files[authMe].indexOf("requireV17CommercialCrmPreviewSessionMode(process.env)") > files[authMe].indexOf("findCurrentUser(payload.sub)")) {
    fail("configuración Preview se evalúa después de Prisma");
  }

  const catalog = "src/hub/appCatalog.ts";
  requireText(files, catalog, 'route: "/commercial", routeAliases: ["/crm", "/sales/pipeline"]', "rutas CRM equivalentes divergentes");
  const workspace = "src/hub/HubWorkspace.tsx";
  const routeAccess = "src/hub/hubRouteAccess.ts";
  requireText(files, routeAccess, "findHubApplicationByRoute(normalizedPath)", "ruta directa omite catálogo común");
  requireText(files, routeAccess, "evaluateHubAccess(application, context)", "ruta directa omite decisión común");
  requireText(files, workspace, "selected?.appId === \"commercial-crm\" && crmReadEnabled", "Inbox se carga sin compuerta de lectura");

  const accessUi = "src/hub/hubAccess.ts";
  requireText(files, accessUi, "application.requiredPermissions.some((permission) => denied.has(permission))", "deniedPermissions no prevalece");
  requireText(files, accessUi, "application.baselineRoles.includes(context.role)", "baseline de rol ausente");
  if (files[accessUi].indexOf("application.requiredPermissions.some") > files[accessUi].indexOf("application.baselineRoles.includes")) {
    fail("deniedPermissions se evalúa después del rol");
  }

  const app = "src/App.tsx";
  requireText(files, app, "commercialCrmPreviewAuthorized === true", "frontend no exige confirmación del servidor");
  requireText(files, app, "isRelationalCrmReadEnabled() && serverConfirmed", "frontend no coordina Hub/cliente/lectura");
  requireText(files, app, "evaluateHubRouteAccess(routeState.pathname, routeState.accessContext)", "frontend autoriza después del lazy");
  requireText(files, app, "validateLegacySession(session, controller.signal)", "frontend no revalida con cancelación");
  requireText(files, app, "activeNavigation.current?.controller.abort()", "frontend no cancela navegación obsoleta");

  const workflow = ".github/workflows/ci.yml";
  for (const signature of [
    "npm run guard:v17-commercial-crm-preview",
    "npm run test:v17-commercial-crm-preview:guard",
    "npm run test:v17-commercial-crm-preview",
    "npm run test:v17-commercial-crm-preview:http",
    "npm run test:v17-commercial-crm-preview:browser",
  ]) requireText(files, workflow, signature, `CI no exige ${signature}`);
  forbidText(files, workflow, /V17-COMMERCIAL-CRM-PREVIEW-01|PREVIEW_REHEARSAL/, "workflow activa el ensayo Preview");

  validateCspAndCors(files);
  validateInboxIsolation(files);

  const vite = "vite.config.ts";
  requireText(files, vite, "__V17_VERCEL_ENV__", "metadata Vercel de build ausente");
  requireText(files, vite, "__V17_VERCEL_GIT_COMMIT_REF__", "Git ref de build ausente");
  const appEnvironment = "shared/appEnvironment.js";
  requireText(files, appEnvironment, 'UNKNOWN: "unknown"', "entorno desconocido no falla cerrado");
  requireText(files, appEnvironment, "LOOPBACK_HOSTNAMES.includes(hostname)", "loopback no tiene precedencia");
  forbidText(files, appEnvironment, /(?:\.trim\(|toUpperCase|toLowerCase)/, "resolver ambiental normaliza señales inválidas");
  requireText(files, "src/lib/env.ts", 'preview: "Preview"', "etiqueta Preview no es exacta");
  requireText(files, "src/lib/env.ts", 'unknown: "Ambiente desconocido"', "fallback desconocido ausente");

  if (!snapshot.bundlePresent) fail("bundle no construido antes de la guardia");
  for (const forbidden of [
    "CRM_PIPELINE_ACTIVATION_BATCH",
    "COMMERCIAL_TENANCY_ACTIVATION_BATCH",
    "DATABASE_URL",
    "DIRECT_URL",
    "JWT_SECRET",
    "postgresql://",
  ]) if (String(snapshot.bundleText || "").includes(forbidden)) fail(`configuración servidor empaquetada: ${forbidden}`);

  return Object.freeze({
    ok: true,
    migrations: migrations.length,
    protectedFiles: PREVIEW_GUARD_FILES.length,
    historyRequired: false,
    diffRequired: false,
    externalActivation: false,
  });
}

export function loadV17CommercialCrmPreviewSnapshot(root = process.cwd()) {
  const files = Object.fromEntries(PREVIEW_GUARD_FILES.map((path) => [path, readFileSync(resolve(root, path), "utf8")]));
  const migrationDirectory = resolve(root, "prisma", "migrations");
  const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
    .map((entry) => entry.name);
  const dist = resolve(root, "dist");
  const bundlePresent = existsSync(dist);
  const bundleText = bundlePresent
    ? filesBelow(dist).filter((path) => path.endsWith(".js")).map((path) => readFileSync(path, "utf8")).join("\n")
    : "";
  return Object.freeze({ files: Object.freeze(files), migrations: Object.freeze(migrations), bundlePresent, bundleText });
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  console.log(JSON.stringify(validateV17CommercialCrmPreviewSnapshot(loadV17CommercialCrmPreviewSnapshot())));
}
