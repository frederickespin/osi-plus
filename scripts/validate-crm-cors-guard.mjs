import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_GLOBAL_API_SOURCE = "/api/((?!auth(?:/|$)|crm(?:/|$)|clients(?:/|$)|projects(?:/|$)|k(?:/|$)|admin(?:/|$)).*)";
const SAFE_ROUTE_SEGMENT = "crm-cors-guard-id";
const PROTECTED_NAMESPACE_PATH = /^\/api\/(?:auth(?:\/|$)|crm(?:\/|$)|clients(?:\/|$)|projects(?:\/|$)|k(?:\/|$)|admin(?:\/|$))/u;
const FUTURE_PROTECTED_ROUTES = Object.freeze([
  "/api/auth/future-route",
  "/api/crm/future-route",
  "/api/clients/future-route",
  "/api/projects/future-route",
  "/api/k/future-route",
  "/api/admin/future-route",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`CRM_CORS_GUARD: ${message}`);
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function routePath(root, file) {
  let path = relative(root, file).split(sep).join("/").replace(/\.(?:js|ts)$/, "");
  path = path.replace(/\/index$/, "").replace(/\[[^/]+\]/g, SAFE_ROUTE_SEGMENT);
  return `/${path}`;
}

function headerValue(rule, key) {
  return rule.headers?.find((header) => String(header.key).toLowerCase() === key)?.value;
}

function isUnsafeRule(rule) {
  return headerValue(rule, "access-control-allow-origin") === "*"
    || headerValue(rule, "access-control-allow-credentials") === "true";
}

function matchesSource(source, path) {
  try {
    return new RegExp(`^${source}$`, "u").test(path);
  } catch (error) {
    throw new Error(`CRM_CORS_GUARD: patrón Vercel inválido (${error.name})`);
  }
}

function parseConfig(vercelText) {
  try { return JSON.parse(vercelText); }
  catch { throw new Error("CRM_CORS_GUARD: vercel.json no es JSON válido"); }
}

export function inventoryCrmRoutes(root = process.cwd()) {
  const apiRoot = resolve(root, "api");
  const crmRoot = resolve(apiRoot, "crm");
  return filesBelow(crmRoot)
    .filter((file) => /\.(?:js|ts)$/.test(file))
    .map((file) => routePath(root, file))
    .sort();
}

export function inventoryProtectedRoutes(root = process.cwd()) {
  return filesBelow(resolve(root, "api"))
    .filter((file) => /\.(?:js|ts)$/.test(file))
    .map((file) => routePath(root, file))
    .filter((path) => PROTECTED_NAMESPACE_PATH.test(path))
    .sort();
}

export function inventoryCrmRouteSources(root = process.cwd()) {
  const crmRoot = resolve(root, "api", "crm");
  return filesBelow(crmRoot)
    .filter((file) => /\.(?:js|ts)$/.test(file))
    .map((file) => Object.freeze({
      path: routePath(root, file),
      source: readFileSync(file, "utf8"),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function unsafeCrmRouteMatches({
  root = process.cwd(),
  vercelText = readFileSync(resolve(root, "vercel.json"), "utf8"),
  routes = inventoryCrmRoutes(root),
} = {}) {
  const config = parseConfig(vercelText);
  const unsafeRules = Array.isArray(config.headers) ? config.headers.filter(isUnsafeRule) : [];
  return routes.filter((path) => unsafeRules.some((rule) => matchesSource(rule.source, path))).sort();
}

export function unsafeProtectedRouteMatches({
  root = process.cwd(),
  vercelText = readFileSync(resolve(root, "vercel.json"), "utf8"),
  routes = inventoryProtectedRoutes(root),
} = {}) {
  const config = parseConfig(vercelText);
  const unsafeRules = Array.isArray(config.headers) ? config.headers.filter(isUnsafeRule) : [];
  return routes.filter((path) => unsafeRules.some((rule) => matchesSource(rule.source, path))).sort();
}

export function validateCrmCorsGuard({
  root = process.cwd(),
  vercelText = readFileSync(resolve(root, "vercel.json"), "utf8"),
  routes = inventoryCrmRoutes(root),
  routeSources = inventoryCrmRouteSources(root),
  protectedRoutes = inventoryProtectedRoutes(root),
  adminHttpSource = readFileSync(resolve(root, "api", "_lib", "adminMembershipHttp.js"), "utf8"),
} = {}) {
  const config = parseConfig(vercelText);

  invariant(Array.isArray(config.headers), "vercel.json debe declarar headers");
  invariant(routes.length > 0 && routes.every((path) => path.startsWith("/api/crm/")), "inventario CRM inválido");
  invariant(routeSources.length > 0, "fuentes de rutas CRM ausentes");
  invariant(protectedRoutes.length > routes.length, "inventario de APIs protegidas incompleto");
  invariant(protectedRoutes.some((path) => path.startsWith("/api/admin/")), "inventario Admin ausente");

  for (const route of routeSources) {
    invariant(!/Access-Control-Allow-Origin[^\n]+["']\*["']/.test(route.source), `${route.path} declara CORS wildcard`);
    invariant(!/Access-Control-Allow-Credentials[^\n]+["']true["']/.test(route.source), `${route.path} declara credenciales CORS`);
    if (route.source.includes("withCommonHeaders(")) {
      invariant(/\{\s*cors:\s*false\s*\}\s*\)/.test(route.source), `${route.path} hereda CORS wildcard desde withCommonHeaders`);
    }
  }

  const unsafeRules = config.headers.filter(isUnsafeRule);
  invariant(unsafeRules.length === 1, "debe conservarse una única regla CORS heredada para rutas no CRM");
  const [globalRule] = unsafeRules;
  invariant(globalRule.source === CANONICAL_GLOBAL_API_SOURCE, "la regla global debe excluir todo /api/crm/** sin allowlist parcial");
  invariant(headerValue(globalRule, "access-control-allow-origin") === "*", "CORS heredado no CRM cambió inesperadamente");
  invariant(headerValue(globalRule, "access-control-allow-credentials") === "true", "credenciales heredadas no CRM cambiaron inesperadamente");
  invariant(!/(?:pipeline-cases|pipeline-summary|pipeline-owner-options|transition|assign-owner|unassign-owner|allowed-transitions)/.test(globalRule.source), "se prohíben exclusiones CRM parciales por endpoint");

  const matched = unsafeCrmRouteMatches({ root, vercelText, routes });
  invariant(matched.length === 0, `rutas CRM cubiertas por CORS permisivo: ${matched.join(", ")}`);
  const matchedProtected = unsafeProtectedRouteMatches({ root, vercelText, routes: protectedRoutes });
  invariant(matchedProtected.length === 0, `rutas protegidas cubiertas por CORS permisivo: ${matchedProtected.join(", ")}`);

  invariant(matchesSource(globalRule.source, "/api/osis"), "la corrección alteró CORS heredado fuera del alcance");
  for (const path of [
    "/api/auth/login",
    "/api/crm/pipeline-cases",
    "/api/clients",
    "/api/projects",
    "/api/k/project-validate",
    "/api/admin/memberships",
    ...FUTURE_PROTECTED_ROUTES,
  ]) {
    invariant(!matchesSource(globalRule.source, path), `${path} heredaría CORS permisivo`);
  }
  invariant(!/setHeader\(["']Access-Control-Allow-Origin["']\s*,\s*(?:origin|req\.?headers)/u.test(adminHttpSource), "Admin refleja Origin sin allowlist");
  invariant(!/setHeader\(["']Access-Control-Allow-(?:Origin|Credentials)["']\s*,\s*["'](?:\*|true)["']/u.test(adminHttpSource), "Admin declara CORS permisivo");
  invariant((adminHttpSource.match(/assertSameOrigin\(req\);/gu) || []).length === 2
    && /ADMIN_MEMBERSHIP_ORIGIN_FORBIDDEN/u.test(adminHttpSource), "Admin no rechaza Origin externo");
  invariant(/\{\s*cors:\s*false,\s*handleOptions:\s*false\s*\}/u.test(adminHttpSource), "Admin permite CORS u OPTIONS global");

  return Object.freeze({
    ok: true,
    source: globalRule.source,
    crmRoutes: routes.length,
    matchedCrmRoutes: matched.length,
    protectedRoutes: protectedRoutes.length,
    matchedProtectedRoutes: matchedProtected.length,
    protectedNamespaces: 6,
    futureProtectedRoutes: FUTURE_PROTECTED_ROUTES.length,
    handlersChecked: routeSources.length,
    nonCrmCompatibilityRoutes: 1,
  });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateCrmCorsGuard(), null, 2)}\n`); }
  catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
