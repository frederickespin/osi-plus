import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SECURED_OSI_GET_ROUTES = Object.freeze([
  "api/osis/index.js",
  "api/osis/[id].js",
]);
export const SECURED_ENTERPRISE_GET_ROUTES = Object.freeze([
  ...SECURED_OSI_GET_ROUTES,
  "api/k/dashboard.js",
]);

const MUTATING_GET_PATTERN = /\b(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(|\$executeRaw|\$queryRawUnsafe|ensureDefaultSignals/;

function invariant(condition, message) {
  if (!condition) throw new Error(`SEC-COM-01A: ${message}`);
}

function methodBlock(source, method, nextMethod) {
  const startPattern = new RegExp(`if\\s*\\(req\\.method\\s*===\\s*["']${method}["']\\)\\s*\\{`);
  const match = startPattern.exec(source);
  invariant(match, `no se encontró el bloque ${method}`);
  const start = match.index;
  const end = nextMethod
    ? source.search(new RegExp(`if\\s*\\(req\\.method\\s*===\\s*["']${nextMethod}["']\\)\\s*\\{`))
    : source.length;
  invariant(end > start, `no se pudo delimitar ${method}`);
  return source.slice(start, end);
}

function exportedFunctionBlock(source, name, nextName) {
  const marker = source.includes(`export async function ${name}`) ? `export async function ${name}` : `export function ${name}`;
  const nextAsync = nextName ? source.indexOf(`export async function ${nextName}`, source.indexOf(marker) + 1) : -1;
  const nextSync = nextName ? source.indexOf(`export function ${nextName}`, source.indexOf(marker) + 1) : -1;
  const start = source.indexOf(marker);
  const candidates = [nextAsync, nextSync].filter((index) => index > start);
  const end = nextName && candidates.length ? Math.min(...candidates) : source.length;
  invariant(start >= 0 && end > start, `no se pudo delimitar ${name}`);
  return source.slice(start, end);
}

export function validateSecCom01aSources({ osiIndex, osiDetail, dashboard, kLib, http, apiClient, envExample }) {
  const osiGetBlocks = [
    [SECURED_OSI_GET_ROUTES[0], methodBlock(osiIndex, "GET", "POST")],
    [SECURED_OSI_GET_ROUTES[1], methodBlock(osiDetail, "GET", "PATCH")],
  ];
  for (const [route, block] of osiGetBlocks) {
    invariant(/requirePilotPermission\s*\([\s\S]*?PERMS\.OSI_VIEW/.test(block), `${route} GET debe exigir osi:view mediante el adaptador dual`);
    invariant(!/x-osi-(?:role|userid)|require(?:Perm|Role)FromHeaders/.test(block), `${route} GET no puede confiar en headers heredados`);
  }

  invariant(/res\.setHeader\(["']Cache-Control["'],\s*["']private, no-store["']\)/.test(http), "la política de cache debe ser private, no-store");
  invariant(/appendVary\(res,\s*["']Authorization["']\)/.test(http), "la política de cache debe variar por Authorization");
  for (const [route, source] of [[SECURED_OSI_GET_ROUTES[0], osiIndex], [SECURED_OSI_GET_ROUTES[1], osiDetail], ["api/k/dashboard.js", dashboard]]) {
    const cacheIndex = source.indexOf("setPrivateNoStore(res)");
    const authIndex = source.indexOf("requirePilotPermission(req");
    invariant(cacheIndex >= 0 && authIndex >= 0 && cacheIndex < authIndex, `${route} debe impedir cache compartida antes de autenticar`);
    invariant(/databaseUnavailable\s*\(res\)/.test(source), `${route} debe sanitizar fallos Prisma como 503`);
  }

  invariant(/req\.method\s*!==\s*["']GET["']/.test(dashboard), "dashboard debe aceptar únicamente GET");
  const dashboardGet = dashboard;
  invariant(/requirePilotPermission\s*\([\s\S]*?PERMS\.PROJECTS_VIEW/.test(dashboardGet), "dashboard debe exigir projects:view mediante el adaptador dual");
  invariant(/\["A",\s*"K"\]\.includes\(context\.role\)/.test(dashboardGet), "dashboard debe conservar acceso exclusivamente para roles A/K");
  invariant(!/x-osi-(?:role|userid)|require(?:Perm|Role)FromHeaders|ensureActorUserId/.test(dashboardGet), "dashboard no puede confiar en identidad o rol enviados por headers");
  invariant(!MUTATING_GET_PATTERN.test(dashboardGet), "GET /api/k/dashboard contiene una operación de escritura o inicialización");
  invariant(/effectiveSignalMap/.test(dashboardGet), "GET /api/k/dashboard debe calcular defaults sólo en memoria");
  invariant((dashboardGet.match(/prisma\.project\.findMany\s*\(/g) || []).length === 1, "GET /api/k/dashboard debe ejecutar una sola lectura de proyectos");
  const effectiveStart = kLib.indexOf("export function effectiveSignalMap");
  const effectiveEnd = kLib.indexOf("export function computeSignalColor", effectiveStart);
  const effectiveBlock = kLib.slice(effectiveStart, effectiveEnd);
  invariant(effectiveStart >= 0 && effectiveEnd > effectiveStart, "no se pudo delimitar effectiveSignalMap");
  invariant(!MUTATING_GET_PATTERN.test(effectiveBlock) && !/ensureDefaultSignals|new Date\(\)/.test(effectiveBlock), "fallback indirecto de dashboard debe ser determinista y sin escrituras");

  invariant(/requestJson[\s\S]*?getToken\(\)/.test(exportedFunctionBlock(apiClient, "getOsis", "createOsi")), "getOsis debe enviar el JWT LEGACY vigente");
  invariant(/requestJson[\s\S]*?getToken\(\)/.test(exportedFunctionBlock(apiClient, "getOsiById", "updateOsi")), "getOsiById debe enviar el JWT LEGACY vigente");
  invariant(/requestJson[\s\S]*?getToken\(\)/.test(exportedFunctionBlock(apiClient, "getKDashboard", "getKProject")), "getKDashboard debe enviar el JWT LEGACY vigente");
  invariant(/MT01B_AUTH_MODE=["']?LEGACY["']?/i.test(envExample), "LEGACY debe continuar predeterminado");
  invariant(/MT01B_TENANT_SWITCH_ENABLED=["']?false["']?/i.test(envExample), "tenant switch debe continuar desactivado");
  invariant(/VITE_MT01B2_CLIENT_ENABLED=["']?false["']?/i.test(envExample), "cliente V2 debe continuar desactivado");

  return Object.freeze({
    securedOsiGetRoutes: SECURED_OSI_GET_ROUTES.length,
    dashboardWrites: 0,
    legacyHeaderRouteFiles: 24,
  });
}

export function validateSecCom01aRepository(root = process.cwd()) {
  const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
  return validateSecCom01aSources({
    osiIndex: read("api/osis/index.js"),
    osiDetail: read("api/osis/[id].js"),
    dashboard: read("api/k/dashboard.js"),
    kLib: read("api/k/_lib.js"),
    http: read("api/_lib/http.js"),
    apiClient: read("src/lib/api.ts"),
    envExample: read(".env.example"),
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.stdout.write(`${JSON.stringify({ ok: true, ...validateSecCom01aRepository() })}\n`);
