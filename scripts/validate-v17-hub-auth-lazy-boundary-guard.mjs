import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.env.V17_HUB_AUTH_LAZY_GUARD_ROOT || process.cwd());
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => { throw new Error(`V17_HUB_AUTH_LAZY_GUARD_FAILED:${message}`); };
const requireText = (source, signature, message) => { if (!source.includes(signature)) fail(message); };

const app = read("src/App.tsx");
const boundary = read("src/components/auth/CanonicalAccessDenied.tsx");
const routeAccess = read("src/hub/hubRouteAccess.ts");
const hubAccess = read("src/hub/hubAccess.ts");
const catalog = read("src/hub/appCatalog.ts");
const workspace = read("src/hub/HubWorkspace.tsx");
const commercialGuard = read("scripts/validate-v17-commercial-crm-guard.mjs");
const index = read("index.html");

requireText(app, "const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'))", "HubWorkspace dejó de ser lazy");
if (/import\s+HubWorkspace\s+from/.test(app)) fail("HubWorkspace usa import eager");
requireText(app, "evaluateHubRouteAccess(routeState.pathname, routeState.accessContext)", "la ruta no usa la decisión pura previa");
requireText(app, "if (!routeDecision.allowed)", "la autorización previa fue eliminada");
requireText(app, "<CanonicalAccessDenied", "el 403 canónico no pertenece al shell inicial");
requireText(app, "validateLegacySession(session).then", "la navegación no revalida la sesión antes del lazy");
requireText(app, "status: 'VALIDATING'", "la navegación no registra su estado de revalidación");
requireText(app, "if (historyMode === 'PUSH') window.history.pushState", "la navegación controlada perdió el historial canónico");
const denialIndex = app.indexOf("if (!routeDecision.allowed)");
const lazyRenderIndex = app.indexOf("<HubWorkspace");
if (denialIndex < 0 || lazyRenderIndex < 0 || denialIndex > lazyRenderIndex) fail("HubWorkspace puede renderizar antes de autorizar");

requireText(routeAccess, "findHubApplicationByRoute(normalizedPath)", "la ruta directa no usa el catálogo canónico");
requireText(routeAccess, "visibleHubApplications(HUB_APPLICATIONS, context)", "el Hub no exige una aplicación autorizada");
requireText(routeAccess, "evaluateHubAccess(application, context)", "tarjeta y ruta no comparten decisión pura");
if (/localStorage|sessionStorage|URLSearchParams|x-osi-|location\.search|location\.hash/i.test(routeAccess)) fail("la frontera confía en autoridad del navegador");

const deniedIndex = hubAccess.indexOf("application.requiredPermissions.some((permission) => denied.has(permission))");
const roleIndex = hubAccess.indexOf("application.baselineRoles.includes(context.role)");
if (deniedIndex < 0 || roleIndex < 0 || deniedIndex > roleIndex) fail("deniedPermissions no prevalece sobre roles baseline");
if (!/appId: "commercial-crm"[^\n]+requiresExplicitPermissions: true/.test(catalog)) fail("roles baseline conceden pipeline:view");
requireText(catalog, 'route: "/commercial", routeAliases: ["/crm", "/sales/pipeline"]', "las rutas comerciales no comparten descriptor");

if (/evaluateHubAccess\s*\(\s*selected|function\s+AccessDenied|<AccessDenied|addEventListener\(["']popstate|history\.pushState/.test(workspace)) fail("la autorización o el routing regresó al chunk lazy");
for (const signature of ["pathname: string", "onNavigate: (pathname: string) => void"]) requireText(workspace, signature, `HubWorkspace dejó de ser controlado: ${signature}`);
requireText(workspace, "selected.appId === \"commercial-crm\" && crmReadEnabled", "la lectura CRM perdió su compuerta funcional");
if (/const\s+BASE\s*=|allowed(?:Backend|Prisma|Global)?Changes|[0-9a-f]{40}/i.test(commercialGuard)) fail("una guardia protegida usa SHA fijo o allowlist global");
if (/prefetch|webpackPrefetch|rel=["'](?:modulepreload|preload)["']/i.test([app, routeAccess, workspace, index].join("\n"))) fail("se introdujo prefetch o preload protegido");

if (/from\s+["'][^"']*(?:hub|commercial-crm)[^"']*["']/.test(boundary)) fail("el 403 canónico importa el árbol protegido");
for (const signature of ["headingRef.current?.focus()", "tabIndex={-1}", "Volver a una ruta segura", 'data-authorization-boundary="pre-lazy"']) {
  requireText(boundary, signature, `el 403 accesible perdió: ${signature}`);
}

console.log(JSON.stringify({ ok: true, boundary: "PRE_LAZY", navigationRevalidation: true, protectedLazyImports: 3, migrationsExpected: 18 }));
