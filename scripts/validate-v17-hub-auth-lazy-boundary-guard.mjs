import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.env.V17_HUB_AUTH_LAZY_GUARD_ROOT || process.cwd());
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => { throw new Error(`V17_HUB_AUTH_LAZY_GUARD_FAILED:${message}`); };
const requireText = (source, signature, message) => { if (!source.includes(signature)) fail(message); };

function commercialDescriptor(source) {
  const file = ts.createSourceFile("appCatalog.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (file.parseDiagnostics.length) fail("el catálogo contiene sintaxis inválida");
  const declarations = file.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "HUB_APPLICATIONS");
  const initializer = declarations.length === 1 ? declarations[0].initializer : undefined;
  if (!initializer || !ts.isCallExpression(initializer)
    || !ts.isPropertyAccessExpression(initializer.expression)
    || !ts.isIdentifier(initializer.expression.expression)
    || initializer.expression.expression.text !== "Object"
    || initializer.expression.name.text !== "freeze"
    || initializer.arguments.length !== 1
    || !ts.isArrayLiteralExpression(initializer.arguments[0])) {
    fail("HUB_APPLICATIONS debe ser un catálogo declarativo único");
  }
  const descriptors = initializer.arguments[0].elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) fail("el catálogo no admite descriptores dinámicos");
    const properties = new Map();
    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property)
        || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        fail("el catálogo no admite propiedades dinámicas ni spreads");
      }
      const name = property.name.text;
      if (properties.has(name)) fail("el catálogo contiene una propiedad duplicada");
      properties.set(name, property.initializer);
    }
    const appId = properties.get("appId");
    if (!appId || !ts.isStringLiteral(appId)) fail("el catálogo requiere appId literal");
    return { appId: appId.text, properties };
  });
  const commercial = descriptors.filter((descriptor) => descriptor.appId === "commercial-crm");
  if (commercial.length !== 1) fail("el catálogo requiere un descriptor Comercial único");
  return commercial[0].properties;
}

function hasLiteralString(node, expected) {
  return Boolean(node && ts.isStringLiteral(node) && node.text === expected);
}

function hasLiteralStringArray(node, expected) {
  if (!node || !ts.isArrayLiteralExpression(node) || node.elements.length !== expected.length
    || node.elements.some((element) => !ts.isStringLiteral(element))) return false;
  const actual = node.elements.map((element) => element.text);
  return new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));
}

const app = read("src/App.tsx");
const boundary = read("src/components/auth/CanonicalAccessDenied.tsx");
const errorBoundary = read("src/components/auth/CanonicalAuthorizationError.tsx");
const api = read("src/lib/api.ts");
const routeAccess = read("src/hub/hubRouteAccess.ts");
const hubAccess = read("src/hub/hubAccess.ts");
const catalog = read("src/hub/appCatalog.ts");
const workspace = read("src/hub/HubWorkspace.tsx");
const commercialGuard = read("scripts/validate-v17-commercial-crm-guard.mjs");
const index = read("index.html");

requireText(app, "const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'))", "HubWorkspace dejó de ser lazy");
if (/import\s+HubWorkspace\s+from/.test(app)) fail("HubWorkspace usa import eager");
requireText(app, "evaluateHubRouteAccess(routeState.pathname, routeState.accessContext)", "la ruta no usa la decisión pura previa");
requireText(app, "routeState.status === 'DENIED' || !routeDecision.allowed", "la autorización previa fue eliminada");
requireText(app, "<CanonicalAccessDenied", "el 403 canónico no pertenece al shell inicial");
requireText(app, "<CanonicalAuthorizationError", "el error seguro no pertenece al shell inicial");
requireText(app, "validateLegacySession(session, controller.signal).then", "la navegación no revalida la sesión abortable antes del lazy");
requireText(app, "status: 'VALIDATING'", "la navegación no registra su estado de revalidación");
requireText(app, "pointer-events-none fixed inset-x-0", "el estado pendiente bloquea logout o navegación segura");
requireText(app, "activeNavigation.current?.controller.abort()", "la navegación no cancela la revalidación anterior");
requireText(app, "const fence = ++navigationFence.current", "la navegación perdió su fencing");
requireText(app, "controller.signal.aborted || fence !== navigationFence.current", "una respuesta abortada o tardía puede ganar");
requireText(app, "setRouteState((current) => ({ ...current, status: 'ERROR' }))", "el fallo de red no desmonta la aplicación protegida");
requireText(api, "signal?: AbortSignal", "el transporte Auth no acepta cancelación");
requireText(api, "signal: options.signal", "fetch no recibe la señal de cancelación");
const decisionIndex = app.indexOf("const decision = evaluateHubRouteAccess(pathname, validatedAccessContext)");
const pushIndex = app.indexOf("if (historyMode === 'PUSH' && decision.allowed) window.history.pushState");
if (decisionIndex < 0 || pushIndex < 0 || pushIndex < decisionIndex) fail("pushState ocurre antes de autorizar");
const denialIndex = app.indexOf("routeState.status === 'DENIED' || !routeDecision.allowed");
const lazyRenderIndex = app.indexOf("<HubWorkspace");
if (denialIndex < 0 || lazyRenderIndex < 0 || denialIndex > lazyRenderIndex) fail("HubWorkspace puede renderizar antes de autorizar");

requireText(routeAccess, "findHubApplicationByRoute(normalizedPath)", "la ruta directa no usa el catálogo canónico");
requireText(routeAccess, "visibleHubApplications(HUB_APPLICATIONS, context)", "el Hub no exige una aplicación autorizada");
requireText(routeAccess, "evaluateHubAccess(application, context)", "tarjeta y ruta no comparten decisión pura");
if (/localStorage|sessionStorage|URLSearchParams|x-osi-|location\.search|location\.hash/i.test(routeAccess)) fail("la frontera confía en autoridad del navegador");

const deniedIndex = hubAccess.indexOf("application.requiredPermissions.some((permission) => denied.has(permission))");
const roleIndex = hubAccess.indexOf("application.baselineRoles.includes(context.role)");
if (deniedIndex < 0 || roleIndex < 0 || deniedIndex > roleIndex) fail("deniedPermissions no prevalece sobre roles baseline");
const commercial = commercialDescriptor(catalog);
if (commercial.get("requiresExplicitPermissions")?.kind !== ts.SyntaxKind.TrueKeyword) fail("roles baseline conceden pipeline:view");
if (!hasLiteralStringArray(commercial.get("requiredPermissions"), ["pipeline:view"])
  || !hasLiteralString(commercial.get("permissionMode"), "ALL")) {
  fail("Comercial debe exigir el permiso explícito pipeline:view con modo ALL");
}
if (!hasLiteralStringArray(commercial.get("baselineRoles"), ["A", "V"])) fail("los roles Comerciales deben conservar A y V");
if (!hasLiteralString(commercial.get("route"), "/commercial")
  || !hasLiteralStringArray(commercial.get("routeAliases"), ["/crm", "/sales/pipeline", "/commercial/relationships"])) {
  fail("las rutas comerciales no comparten descriptor");
}

if (/evaluateHubAccess\s*\(\s*selected|function\s+AccessDenied|<AccessDenied|addEventListener\(["']popstate|history\.pushState/.test(workspace)) fail("la autorización o el routing regresó al chunk lazy");
for (const signature of ["pathname: string", "onNavigate: (pathname: string) => void"]) requireText(workspace, signature, `HubWorkspace dejó de ser controlado: ${signature}`);
requireText(workspace, "selected?.appId === \"commercial-crm\" && crmReadEnabled", "la lectura CRM perdió su compuerta funcional");
requireText(workspace, 'lazy(() => import("@/commercial-crm/AdvancedErpShell"))', "el ERP Comercial dejó de ser lazy");
if (/const\s+BASE\s*=|allowed(?:Backend|Prisma|Global)?Changes|[0-9a-f]{40}/i.test(commercialGuard)) fail("una guardia protegida usa SHA fijo o allowlist global");
if (/prefetch|webpackPrefetch|rel=["'](?:modulepreload|preload)["']/i.test([app, routeAccess, workspace, index].join("\n"))) fail("se introdujo prefetch o preload protegido");

if (/from\s+["'][^"']*(?:hub|commercial-crm)[^"']*["']/.test(`${boundary}\n${errorBoundary}`)) fail("una frontera canónica importa el árbol protegido");
for (const signature of ["headingRef.current?.focus()", "tabIndex={-1}", "Volver a una ruta segura", 'data-authorization-boundary="pre-lazy"']) {
  requireText(boundary, signature, `el 403 accesible perdió: ${signature}`);
  requireText(errorBoundary, signature, `el error accesible perdió: ${signature}`);
}

console.log(JSON.stringify({ ok: true, boundary: "PRE_LAZY", navigationRevalidation: true, abort: true, fencing: true, historyAfterAuthorization: true, commercialCatalog: "AST_VALIDATED", protectedLazyImportsValidated: ["HubWorkspace", "AdvancedErpShell"] }));
