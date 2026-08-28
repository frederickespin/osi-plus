import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_GLOBAL_API_SOURCE = "/api/((?!auth(?:/|$)|crm(?:/|$)|clients(?:/|$)|projects(?:/|$)|k(?:/|$)|admin(?:/|$)).*)";
const REQUIRED_ROUTES = Object.freeze([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/refresh",
  "/api/auth/session/upgrade",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`AUTH_LEGACY_HEADERS_GUARD: ${message}`);
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function routePath(root, file) {
  return `/${relative(root, file).split(sep).join("/").replace(/\.(?:js|ts)$/, "").replace(/\/index$/, "")}`;
}

function parseConfig(text) {
  try { return JSON.parse(text); }
  catch { throw new Error("AUTH_LEGACY_HEADERS_GUARD: vercel.json no es JSON válido"); }
}

function headerValue(rule, key) {
  return rule.headers?.find((header) => String(header.key).toLowerCase() === key)?.value;
}

function unsafeRule(rule) {
  return headerValue(rule, "access-control-allow-origin") === "*"
    || headerValue(rule, "access-control-allow-credentials") === "true"
    || /public/i.test(String(headerValue(rule, "cache-control") || ""));
}

function matches(source, path) {
  return new RegExp(`^${source}$`, "u").test(path);
}

export function inventoryAuthRoutes(root = process.cwd()) {
  return filesBelow(resolve(root, "api", "auth"))
    .filter((file) => /\.(?:js|ts)$/.test(file))
    .map((file) => routePath(root, file))
    .sort();
}

export function validateAuthLegacyPrivateHeadersGuard({
  root = process.cwd(),
  vercelText = readFileSync(resolve(root, "vercel.json"), "utf8"),
  routes = inventoryAuthRoutes(root),
  routeSources = routes.map((path) => ({
    path,
    source: readFileSync(resolve(root, `${path.slice(1)}.js`), "utf8"),
  })),
  authHttpSource = readFileSync(resolve(root, "api", "_lib", "authHttp.js"), "utf8"),
  authOriginSource = readFileSync(resolve(root, "api", "_lib", "authOrigin.js"), "utf8"),
} = {}) {
  const config = parseConfig(vercelText);
  invariant(JSON.stringify(routes) === JSON.stringify([...REQUIRED_ROUTES]), "inventario recursivo Auth inesperado");
  invariant(Array.isArray(config.headers), "vercel.json debe declarar headers");
  const unsafeRules = config.headers.filter(unsafeRule);
  invariant(unsafeRules.length === 1, "debe existir una única regla heredada insegura fuera de Auth/CRM");
  invariant(unsafeRules[0].source === CANONICAL_GLOBAL_API_SOURCE, "la regla global no excluye namespaces Auth/CRM completos");
  for (const path of [...routes, "/api/auth/future-route"]) {
    invariant(!unsafeRules.some((rule) => matches(rule.source, path)), `${path} heredaría CORS/caché inseguros`);
  }

  for (const { path, source } of routeSources) {
    const wrapper = path === "/api/auth/login" || path === "/api/auth/me"
      ? "withLegacyAuthHeaders"
      : "withMt01bAuthHeaders";
    invariant(source.includes(wrapper), `${path} no usa ${wrapper}`);
    invariant(!/Access-Control-Allow-(?:Origin|Credentials)/.test(source), `${path} declara CORS propio`);
    invariant(!/Cache-Control[^\n]+public/i.test(source), `${path} declara caché pública`);
  }

  invariant(/Cache-Control["'],\s*["']private, no-store/.test(authHttpSource), "wrapper Auth no fija private, no-store");
  invariant(!/Access-Control-Allow-Origin["'],\s*["']\*/.test(authHttpSource), "wrapper Auth declara wildcard");
  invariant(!/Access-Control-Allow-Credentials["'],\s*["']true/.test(authHttpSource), "wrapper Auth declara credenciales CORS");
  invariant(/appendVary\(res, ["']Authorization["']\)/.test(authHttpSource), "wrapper Auth no varía por Authorization");
  invariant(/appendVary\(res, ["']Origin["']\)/.test(authHttpSource), "wrapper Auth no varía por Origin");
  invariant(/removeHeader/.test(authHttpSource) && /Access-Control-Allow-Origin/.test(authHttpSource), "wrapper Auth no retira CORS heredado");
  invariant(/req\.method === ["']OPTIONS["'][\s\S]*sendMethodNotAllowed/.test(authHttpSource), "OPTIONS LEGACY podría alcanzar auth/body/Prisma");
  invariant(/req\.method === ["']HEAD["']/.test(authHttpSource) && /invokeHead/.test(authHttpSource), "HEAD no está contenido");
  invariant(!/setMt01bCors\(req, res\)/.test(authOriginSource), "wrapper V2 todavía emite CORS");
  invariant(/req\.method === ["']OPTIONS["'][\s\S]*status\(405\)/.test(authOriginSource), "OPTIONS V2 todavía responde 204");
  invariant(/setAuthPrivateHeaders\(res\)/.test(authOriginSource), "rutas V2 desactivadas no reciben headers privados");

  return Object.freeze({ ok: true, routes: routes.length, futureRoutesProtected: true });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateAuthLegacyPrivateHeadersGuard(), null, 2)}\n`); }
  catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
