import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_CORS_ROUTES = Object.freeze(["/api/health", "/api/info"]);
const WEBHOOK_ROUTES = Object.freeze([]);
const PROTECTED_SAME_ORIGIN_ROUTES = Object.freeze([
  "/api/admin/identity-invitations", "/api/admin/identity-invitations/[invitationRef]",
  "/api/admin/memberships", "/api/admin/memberships/[membershipRef]",
  "/api/auth/admin-invitations/activate", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/auth/refresh", "/api/auth/session/upgrade",
  "/api/clients", "/api/projects",
  "/api/crm/client-options", "/api/crm/pipeline-cases", "/api/crm/pipeline-cases/[caseKey]",
  "/api/crm/pipeline-cases/[caseKey]/allowed-transitions", "/api/crm/pipeline-cases/[caseKey]/assign-owner",
  "/api/crm/pipeline-cases/[caseKey]/transition", "/api/crm/pipeline-cases/[caseKey]/unassign-owner",
  "/api/crm/pipeline-owner-options", "/api/crm/pipeline-summary",
  "/api/k/dashboard", "/api/k/pgd/apply", "/api/k/pgd/item", "/api/k/project",
  "/api/k/project-release", "/api/k/project-validate", "/api/k/signal",
]);
const LEGACY_PENDING_ROUTES = Object.freeze([
  "/api/_disabled/modules", "/api/_disabled/pgd/apply", "/api/_disabled/pgd/item",
  "/api/_disabled/project-release", "/api/_disabled/project-validate", "/api/_disabled/signal",
  "/api/osis", "/api/osis/[id]", "/api/osis/[id]/handshake", "/api/osis/[id]/return",
  "/api/pst/[serviceCode]", "/api/pst/active",
  "/api/ptf/suggestions/action", "/api/ptf/suggestions", "/api/ptf/suggestions/recompute",
  "/api/templates/approve", "/api/templates/approve-batch", "/api/templates/draft", "/api/templates/list",
  "/api/templates/pending", "/api/templates/publish", "/api/templates/reject", "/api/templates/submit",
  "/api/templates/version", "/api/users",
]);

const PRIVATE_ROUTE_SET = new Set([...PROTECTED_SAME_ORIGIN_ROUTES, ...LEGACY_PENDING_ROUTES]);
const CLASSIFIED_ROUTE_SET = new Set([...PRIVATE_ROUTE_SET, ...PUBLIC_CORS_ROUTES, ...WEBHOOK_ROUTES]);
const WILDCARD_ORIGIN = /setHeader\(\s*["']access-control-allow-origin["']\s*,\s*["']\*["']/iu;
const CREDENTIALS_TRUE = /setHeader\(\s*["']access-control-allow-credentials["']\s*,\s*["']true["']/iu;
const ORIGIN_REFLECTION = /setHeader\(\s*["']access-control-allow-origin["']\s*,\s*(?:req(?:uest)?\.?headers|origin)\b/iu;

function invariant(condition, message) {
  if (!condition) throw new Error(`PROTECTED_CORS_GUARD: ${message}`);
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function routePath(root, file) {
  return `/${relative(root, file).split(sep).join("/").replace(/\.(?:js|ts)$/u, "").replace(/\/index$/u, "")}`;
}

function source(root, relativePath, overrides) {
  return overrides?.get(relativePath) ?? readFileSync(resolve(root, relativePath), "utf8");
}

function parseConfig(text) {
  try { return JSON.parse(text); }
  catch { throw new Error("PROTECTED_CORS_GUARD: vercel.json no es JSON válido"); }
}

export function inventoryApiRoutes(root = process.cwd(), overrides, extraRoutes = []) {
  const discovered = filesBelow(resolve(root, "api"))
    .filter((file) => /\.(?:js|ts)$/u.test(file))
    .filter((file) => !relative(resolve(root, "api"), file).split(sep).includes("_lib"))
    .filter((file) => !basename(file).startsWith("_"))
    .map((file) => {
      const relativePath = relative(root, file).split(sep).join("/");
      return { path: routePath(root, file), relativePath, source: source(root, relativePath, overrides) };
    });
  return [...discovered, ...extraRoutes].sort((left, right) => left.path.localeCompare(right.path));
}

function validatePrivateWrapper(httpSource) {
  invariant(/function withPrivateApiHeaders\(handler, \{ handleOptions = false \} = \{\}\)/u.test(httpSource), "wrapper privado no falla cerrado para OPTIONS");
  invariant(/withJsonHeaders\(\(req, res\) => invokeHeadWithoutBody\(handler, req, res\), \{[\s\S]*applyHeaders: setPrivateNoStore,[\s\S]*handleOptions,[\s\S]*\}\)/u.test(httpSource), "wrapper privado no aplica headers privados");
  invariant(/invokeHeadWithoutBody\(handler, req, res\)/u.test(httpSource), "wrapper privado no garantiza HEAD sin body");
  invariant(/appendVary\(res, ["']Authorization["']\)[\s\S]*appendVary\(res, ["']Origin["']\)/u.test(httpSource), "Vary privado incompleto");
  invariant(/Cache-Control["']\s*,\s*["']private, no-store/u.test(httpSource), "caché privada ausente");
  invariant(!/\bcors\s*:/iu.test(httpSource), "un booleano CORS ambiguo puede reactivar wildcard");
  const privateBlock = httpSource.slice(httpSource.indexOf("function withPrivateApiHeaders"), httpSource.indexOf("function withPublicReadCorsHeaders"));
  invariant(!WILDCARD_ORIGIN.test(privateBlock) && !CREDENTIALS_TRUE.test(privateBlock), "wrapper privado declara CORS permisivo");
}

function validatePublicWrapper(httpSource) {
  invariant(/function withPublicReadCorsHeaders\(handler\)/u.test(httpSource), "wrapper público explícito ausente");
  invariant(/function setPublicReadCors\(res\)[\s\S]*Access-Control-Allow-Origin["']\s*,\s*["']\*["']/u.test(httpSource), "wrapper público no declara su CORS específico");
  invariant(!CREDENTIALS_TRUE.test(httpSource), "wrapper público combina wildcard y credentials");
  invariant(/GET,HEAD,OPTIONS/u.test(httpSource), "wrapper público amplió métodos");
}

export function validateCrmCorsGuard({ root = process.cwd(), overrides = new Map(), extraRoutes = [], vercelText = source(root, "vercel.json", overrides) } = {}) {
  const config = parseConfig(vercelText);
  invariant(Array.isArray(config.headers), "vercel.json debe declarar headers");
  const apiHeaderRules = config.headers.filter((rule) => String(rule?.source || "").startsWith("/api/"));
  invariant(apiHeaderRules.length === 0, "vercel.json no puede aplicar CORS global a /api/**");

  const routes = inventoryApiRoutes(root, overrides, extraRoutes);
  const paths = routes.map((route) => route.path);
  invariant(new Set(paths).size === paths.length, "inventario contiene rutas duplicadas");
  invariant(JSON.stringify(paths) === JSON.stringify([...CLASSIFIED_ROUTE_SET].sort()), "ruta API nueva o clasificación incompleta");

  const httpSource = source(root, "api/_lib/http.js", overrides);
  validatePrivateWrapper(httpSource);
  validatePublicWrapper(httpSource);

  for (const route of routes) {
    invariant(!CREDENTIALS_TRUE.test(route.source), `${route.path} declara credentials permisivo`);
    invariant(!ORIGIN_REFLECTION.test(route.source), `${route.path} refleja Origin`);
    if (PUBLIC_CORS_ROUTES.includes(route.path)) {
      invariant(route.source.includes("withPublicReadCorsHeaders"), `${route.path} no usa el wrapper público allowlisted`);
      continue;
    }
    invariant(!WILDCARD_ORIGIN.test(route.source), `${route.path} declara wildcard`);
    invariant(!route.source.includes("withPublicReadCorsHeaders"), `${route.path} usa CORS público fuera de allowlist`);
    if (route.source.includes("withPrivateApiHeaders")) continue;
    invariant(/^\/api\/(?:auth|crm|admin)\//u.test(route.path), `${route.path} no usa wrapper privado ni adaptador canónico`);
  }

  for (const relativePath of [
    "api/_lib/adminIdentityInvitationHttp.js", "api/_lib/adminMembershipHttp.js", "api/_lib/authHttp.js", "api/_lib/authOrigin.js",
    "api/_lib/crmCaseMutationHttp.js", "api/_lib/crmOwnerCatalogHttp.js", "api/_lib/crmPipelineReadHttp.js",
    "api/_lib/pipelineCaseMutationHttp.js",
  ]) {
    const wrapper = source(root, relativePath, overrides);
    invariant(!WILDCARD_ORIGIN.test(wrapper), `${relativePath} declara wildcard`);
    invariant(!CREDENTIALS_TRUE.test(wrapper), `${relativePath} declara credentials permisivo`);
    if (relativePath !== "api/_lib/pipelineCaseMutationHttp.js") invariant(!ORIGIN_REFLECTION.test(wrapper), `${relativePath} refleja Origin`);
  }
  invariant(/mt01bAllowedOrigins\(env\)\.has\(origin\)/u.test(source(root, "api/_lib/pipelineCaseMutationHttp.js", overrides)), "CRM local no limita Origin a la allowlist exacta");

  return Object.freeze({ ok: true, routes: routes.length, protectedSameOrigin: PROTECTED_SAME_ORIGIN_ROUTES.length, publicDeliberate: PUBLIC_CORS_ROUTES.length, webhookOwnAuth: WEBHOOK_ROUTES.length, legacyPending: LEGACY_PENDING_ROUTES.length, platformApiHeaderRules: apiHeaderRules.length });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateCrmCorsGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
