import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_PATH = "scripts/protected-cors-route-inventory.json";
const CATEGORY_NAMES = Object.freeze(["protectedSameOrigin", "publicDeliberate", "legacyPendingClosed", "webhookOwnAuth"]);
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

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function parseProtectedCorsInventoryManifest(text) {
  let manifest;
  try { manifest = JSON.parse(text); }
  catch { throw new Error("PROTECTED_CORS_GUARD: manifiesto CORS no es JSON válido"); }
  invariant(manifest?.version === "V17-PROTECTED-CORS-INVENTORY-1", "versión del manifiesto CORS inesperada");
  invariant(manifest?.categories && typeof manifest.categories === "object", "categorías del manifiesto CORS ausentes");
  invariant(JSON.stringify(Object.keys(manifest.categories).sort()) === JSON.stringify([...CATEGORY_NAMES].sort()), "categorías del manifiesto CORS inesperadas");

  const categories = {};
  const occurrences = new Map();
  let duplicates = 0;
  for (const name of CATEGORY_NAMES) {
    const routes = manifest.categories[name];
    invariant(Array.isArray(routes) && routes.every((route) => typeof route === "string" && route.startsWith("/api/")), `categoría CORS inválida: ${name}`);
    duplicates += routes.length - new Set(routes).size;
    categories[name] = Object.freeze([...routes].sort());
    for (const route of routes) occurrences.set(route, (occurrences.get(route) || 0) + 1);
  }
  const overlaps = [...occurrences.values()].filter((count) => count > 1).length;
  invariant(duplicates === 0, "manifiesto CORS contiene rutas duplicadas");
  invariant(overlaps === 0, "manifiesto CORS contiene categorías superpuestas");
  const allRoutes = Object.freeze([...occurrences.keys()].sort());
  return Object.freeze({
    version: manifest.version,
    categories: Object.freeze(categories),
    allRoutes,
    duplicates,
    overlaps,
    manifestSha256: sha256(text),
    inventorySha256: sha256(JSON.stringify({ version: manifest.version, categories })),
  });
}

export function loadProtectedCorsInventory({ root = process.cwd(), overrides = new Map() } = {}) {
  return parseProtectedCorsInventoryManifest(source(root, MANIFEST_PATH, overrides));
}

export function validateCrmCorsInventoryReport(report, expected) {
  const fields = [
    "manifestVersion", "manifestSha256", "inventorySha256", "routes", "classifiedRoutes",
    "protectedSameOrigin", "publicDeliberate", "legacyPending", "webhookOwnAuth",
  ];
  invariant(report?.ok === true, "reporte CORS no indica éxito");
  for (const field of fields) invariant(report[field] === expected[field], `resumen CORS no coincide con manifiesto: ${field}`);
  for (const field of ["duplicates", "unclassified", "overlaps"]) invariant(report[field] === 0, `resumen CORS inseguro: ${field}`);
  invariant(report.routes === report.classifiedRoutes, "inventario CORS descubierto y clasificado diverge");
  invariant(report.platformApiHeaderRules === 0, "reporte CORS permite headers API de plataforma");
  return true;
}

export function expectedCrmCorsInventoryReport({ root = process.cwd(), overrides = new Map() } = {}) {
  const inventory = loadProtectedCorsInventory({ root, overrides });
  return Object.freeze({
    manifestVersion: inventory.version,
    manifestSha256: inventory.manifestSha256,
    inventorySha256: inventory.inventorySha256,
    routes: inventory.allRoutes.length,
    classifiedRoutes: inventory.allRoutes.length,
    protectedSameOrigin: inventory.categories.protectedSameOrigin.length,
    publicDeliberate: inventory.categories.publicDeliberate.length,
    legacyPending: inventory.categories.legacyPendingClosed.length,
    webhookOwnAuth: inventory.categories.webhookOwnAuth.length,
  });
}

export function inventoryApiRoutes(root = process.cwd(), overrides, extraRoutes = []) {
  const discovered = filesBelow(resolve(root, "api"))
    .filter((file) => /\.(?:js|ts)$/u.test(file))
    .filter((file) => !relative(resolve(root, "api"), file).split(sep).includes("_lib"))
    .filter((file) => relative(root, file).split(sep).join("/") !== "api/_disabled/legacyHeaderAuthorization.js")
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
  const inventory = loadProtectedCorsInventory({ root, overrides });
  const protectedSameOriginRoutes = inventory.categories.protectedSameOrigin;
  const publicCorsRoutes = inventory.categories.publicDeliberate;
  const legacyPendingRoutes = inventory.categories.legacyPendingClosed;
  const config = parseConfig(vercelText);
  invariant(Array.isArray(config.headers), "vercel.json debe declarar headers");
  const apiHeaderRules = config.headers.filter((rule) => String(rule?.source || "").startsWith("/api/"));
  invariant(apiHeaderRules.length === 0, "vercel.json no puede aplicar CORS global a /api/**");

  const routes = inventoryApiRoutes(root, overrides, extraRoutes);
  const paths = routes.map((route) => route.path);
  invariant(new Set(paths).size === paths.length, "inventario contiene rutas duplicadas");
  const unclassified = paths.filter((path) => !inventory.allRoutes.includes(path));
  const absent = inventory.allRoutes.filter((path) => !paths.includes(path));
  invariant(unclassified.length === 0 && absent.length === 0, `ruta API nueva, ausente o clasificación incompleta: nuevas=${unclassified.join(",")} ausentes=${absent.join(",")}`);

  const httpSource = source(root, "api/_lib/http.js", overrides);
  validatePrivateWrapper(httpSource);
  validatePublicWrapper(httpSource);

  for (const route of routes) {
    invariant(!CREDENTIALS_TRUE.test(route.source), `${route.path} declara credentials permisivo`);
    invariant(!ORIGIN_REFLECTION.test(route.source), `${route.path} refleja Origin`);
    if (publicCorsRoutes.includes(route.path)) {
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
    "api/_lib/crmCaseMutationHttp.js", "api/_lib/crmIcpV2ApiHttp.js", "api/_lib/crmOwnerCatalogHttp.js", "api/_lib/crmPipelineReadHttp.js",
    "api/_lib/crmServicesHttp.js", "api/_lib/crmSurveyHttp.js", "api/_lib/pipelineCaseMutationHttp.js",
  ]) {
    const wrapper = source(root, relativePath, overrides);
    invariant(!WILDCARD_ORIGIN.test(wrapper), `${relativePath} declara wildcard`);
    invariant(!CREDENTIALS_TRUE.test(wrapper), `${relativePath} declara credentials permisivo`);
    if (relativePath !== "api/_lib/pipelineCaseMutationHttp.js") invariant(!ORIGIN_REFLECTION.test(wrapper), `${relativePath} refleja Origin`);
  }
  invariant(/mt01bAllowedOrigins\(env\)\.has\(origin\)/u.test(source(root, "api/_lib/pipelineCaseMutationHttp.js", overrides)), "CRM local no limita Origin a la allowlist exacta");

  return Object.freeze({
    ok: true,
    manifestVersion: inventory.version,
    manifestSha256: inventory.manifestSha256,
    inventorySha256: inventory.inventorySha256,
    routes: routes.length,
    classifiedRoutes: inventory.allRoutes.length,
    protectedSameOrigin: protectedSameOriginRoutes.length,
    publicDeliberate: publicCorsRoutes.length,
    webhookOwnAuth: inventory.categories.webhookOwnAuth.length,
    legacyPending: legacyPendingRoutes.length,
    duplicates: inventory.duplicates,
    unclassified: unclassified.length,
    overlaps: inventory.overlaps,
    platformApiHeaderRules: apiHeaderRules.length,
  });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(validateCrmCorsGuard(), null, 2)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; }
}
