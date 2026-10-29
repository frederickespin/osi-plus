import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const guard = resolve("scripts/validate-v17-hub-auth-lazy-boundary-guard.mjs");
const files = [
  "src/App.tsx",
  "src/components/auth/CanonicalAccessDenied.tsx",
  "src/components/auth/CanonicalAuthorizationError.tsx",
  "src/lib/api.ts",
  "src/hub/hubRouteAccess.ts",
  "src/hub/hubAccess.ts",
  "src/hub/appCatalog.ts",
  "src/hub/HubWorkspace.tsx",
  "scripts/validate-v17-commercial-crm-guard.mjs",
  "scripts/validate-v17-hub-auth-lazy-boundary-guard.mjs",
  "index.html",
];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "v17-hub-auth-lazy-"));
  for (const path of files) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(path, "utf8"));
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [guard], {
    encoding: "utf8",
    env: { ...process.env, V17_HUB_AUTH_LAZY_GUARD_ROOT: root },
  });
}

function mutate(root, path, transform) {
  const target = join(root, path);
  const before = readFileSync(target, "utf8");
  const after = transform(before);
  assert.notEqual(after, before, `la mutación debe modificar ${path}`);
  writeFileSync(target, after);
}

function editCommercial(source, transform) {
  const file = ts.createSourceFile("appCatalog.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = [];
  function visit(node) {
    if (ts.isObjectLiteralExpression(node) && node.properties.some((property) =>
      ts.isPropertyAssignment(property)
      && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      && property.name.text === "appId"
      && ts.isStringLiteral(property.initializer)
      && property.initializer.text === "commercial-crm")) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(matches.length, 1, "fixture requiere un solo descriptor Comercial");
  const node = matches[0];
  const before = node.getText(file);
  const after = transform(before);
  assert.notEqual(after, before, "la mutación debe modificar el descriptor Comercial");
  return source.slice(0, node.getStart(file)) + after + source.slice(node.getEnd());
}

function equivalentCatalog(name, transform) {
  const root = fixture();
  try {
    mutate(root, "src/hub/appCatalog.ts", transform);
    const result = run(root);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    return name;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function negative(name, path, transform, expected) {
  const root = fixture();
  try {
    mutate(root, path, transform);
    const result = run(root);
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stdout}\n${result.stderr}`, expected, name);
    return name;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const positive = run(process.cwd());
assert.equal(positive.status, 0, positive.stderr);
const equivalents = [
  equivalentCatalog("descriptor compacto", (source) => editCommercial(source, (object) => object.split(/\r?\n/).map((line) => line.trim()).join(" "))),
  equivalentCatalog("alias multilinea, comentarios y claves entre comillas", (source) => editCommercial(source, (object) => object
    .replace('appId: "commercial-crm"', '"appId": \'commercial-crm\'')
    .replace('route: "/commercial"', '"route": \'/commercial\'')
    .replace('routeAliases: ["/crm", "/sales/pipeline", "/commercial/relationships"]', 'routeAliases: [\n        "/crm", // Alias compatible\n        "/sales/pipeline",\n        "/commercial/relationships",\n      ]')
    .replace('requiresExplicitPermissions: true', '"requiresExplicitPermissions": /* requerido */ true'))),
];
const guardSource = readFileSync(guard, "utf8");
assert.doesNotMatch(guardSource, /from\s+["']node:child_process["']|git\s+(?:diff|merge-base)|const\s+BASE\s*=|allowed(?:Backend|Prisma|Global)?Changes|[0-9a-f]{40}/i);
const negatives = [
  negative("bypass previo", "src/App.tsx", (s) => s.replace("routeState.status === 'DENIED' || !routeDecision.allowed", "false"), /autorización previa fue eliminada/),
  negative("navegación sin revalidación", "src/App.tsx", (s) => s.replace("validateLegacySession(session, controller.signal).then", "Promise.resolve(session).then"), /navegación no revalida/),
  negative("navegación sin abort", "src/App.tsx", (s) => s.split("activeNavigation.current?.controller.abort()").join("void activeNavigation.current"), /no cancela/),
  negative("navegación sin fencing", "src/App.tsx", (s) => s.replace("const fence = ++navigationFence.current", "const fence = navigationFence.current"), /perdió su fencing/),
  negative("respuesta tardía aceptada", "src/App.tsx", (s) => s.replace("controller.signal.aborted || fence !== navigationFence.current", "false"), /tardía puede ganar/),
  negative("red deja datos visibles", "src/App.tsx", (s) => s.replace("setRouteState((current) => ({ ...current, status: 'ERROR' }))", "setRouteState((current) => ({ ...current, status: 'READY' }))"), /fallo de red no desmonta/),
  negative("estado pendiente bloquea logout", "src/App.tsx", (s) => s.replace("pointer-events-none fixed inset-x-0", "fixed inset-x-0"), /bloquea logout/),
  negative("push antes de autorizar", "src/App.tsx", (s) => s.replace(
    /const decision = evaluateHubRouteAccess\(pathname, validatedAccessContext\);\r?\n      if \(historyMode === 'PUSH' && decision\.allowed\) window\.history\.pushState\(\{\}, '', pathname\);/,
    "if (historyMode === 'PUSH' && decision.allowed) window.history.pushState({}, '', pathname);\n      const decision = evaluateHubRouteAccess(pathname, validatedAccessContext);",
  ), /pushState ocurre antes/),
  negative("fetch sin signal", "src/lib/api.ts", (s) => s.replace("signal: options.signal", "signal: undefined"), /fetch no recibe/),
  negative("import eager", "src/App.tsx", (s) => s.replace("const HubWorkspace = lazy(() => import('@/hub/HubWorkspace'));", "import HubWorkspace from '@/hub/HubWorkspace';"), /dejó de ser lazy|import eager/),
  negative("decisión dentro del lazy", "src/hub/HubWorkspace.tsx", (s) => `${s}\nevaluateHubAccess(selected, accessContext);\n`, /regresó al chunk lazy/),
  negative("routing dentro del lazy", "src/hub/HubWorkspace.tsx", (s) => `${s}\nwindow.history.pushState({}, '', '/commercial');\n`, /routing regresó al chunk lazy/),
  negative("ruta concede acceso", "src/hub/hubRouteAccess.ts", (s) => s.replace("evaluateHubAccess(application, context)", "({ allowed: true })"), /no comparten decisión pura/),
  negative("deny tardío", "src/hub/hubAccess.ts", (s) => s.replace("const denied = new Set(context.deniedPermissions);", "const denied = new Set(context.deniedPermissions);\n  const baseline = application.baselineRoles.includes(context.role);"), /deniedPermissions no prevalece/),
  negative("rol concede permiso", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace("requiresExplicitPermissions: true", "requiresExplicitPermissions: false")), /roles baseline conceden/),
  negative("alias sin catálogo", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('routeAliases: ["/crm", "/sales/pipeline", "/commercial/relationships"]', 'routeAliases: ["/crm", "/sales/pipeline"]')), /rutas comerciales no comparten/),
  negative("storage como autoridad", "src/hub/hubRouteAccess.ts", (s) => `${s}\nlocalStorage.getItem("pipeline:view");\n`, /autoridad del navegador/),
  negative("prefetch protegido", "src/App.tsx", (s) => `${s}\nconst unsafe = '<link rel="prefetch">';\n`, /prefetch o preload/),
  negative("403 sin foco", "src/components/auth/CanonicalAccessDenied.tsx", (s) => s.replace("headingRef.current?.focus()", "void headingRef.current"), /403 accesible perdió/),
  negative("error sin foco", "src/components/auth/CanonicalAuthorizationError.tsx", (s) => s.replace("headingRef.current?.focus()", "void headingRef.current"), /error accesible perdió/),
  negative("SHA fijo en guardia", "scripts/validate-v17-commercial-crm-guard.mjs", (s) => `${s}\nconst BASE = "0123456789012345678901234567890123456789";\n`, /SHA fijo o allowlist global/),
  negative("allowlist global", "scripts/validate-v17-commercial-crm-guard.mjs", (s) => `${s}\nconst allowedBackendChanges = new Set();\n`, /SHA fijo o allowlist global/),
  negative("permiso comercial vacío", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('requiredPermissions: ["pipeline:view"]', 'requiredPermissions: []')), /permiso explícito pipeline:view con modo ALL/),
  negative("permiso comercial distinto", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('requiredPermissions: ["pipeline:view"]', 'requiredPermissions: ["clients:view"]')), /permiso explícito pipeline:view con modo ALL/),
  negative("modo ANY comercial", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('permissionMode: "ALL"', 'permissionMode: "ANY"')), /permiso explícito pipeline:view con modo ALL/),
  negative("permiso comercial ausente", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('requiredPermissions: ["pipeline:view"],', '')), /permiso explícito pipeline:view con modo ALL/),
  negative("modo comercial ausente", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('permissionMode: "ALL",', '')), /permiso explícito pipeline:view con modo ALL/),
  negative("explicit ausente no se hereda de otra app", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('requiresExplicitPermissions: true,', '')), /roles baseline conceden/),
  negative("roles comerciales ampliados", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('baselineRoles: ["A", "V"]', 'baselineRoles: ["A", "V", "K"]')), /roles Comerciales deben conservar A y V/),
  negative("ruta comercial incorrecta", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('route: "/commercial"', 'route: "/other"')), /rutas comerciales no comparten/),
  negative("alias ausente no se rescata con comentario", "src/hub/appCatalog.ts", (s) => `${editCommercial(s, (object) => object.replace('routeAliases: ["/crm", "/sales/pipeline", "/commercial/relationships"],', ''))}\n// route: "/commercial", routeAliases: ["/crm", "/sales/pipeline", "/commercial/relationships"]\n`, /rutas comerciales no comparten/),
  negative("comentario no rescata autoridad comercial", "src/hub/appCatalog.ts", (s) => `${editCommercial(s, (object) => object.replace('requiresExplicitPermissions: true', 'requiresExplicitPermissions: false'))}\n// appId: "commercial-crm", requiresExplicitPermissions: true\n`, /roles baseline conceden/),
  negative("descriptor comercial ausente", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('appId: "commercial-crm"', 'appId: "other-commercial"')), /descriptor Comercial único/),
  negative("descriptor comercial duplicado", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => `${object},\n${object}`), /descriptor Comercial único/),
  negative("override por propiedad duplicada", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('requiresExplicitPermissions: true,', 'requiresExplicitPermissions: true, requiresExplicitPermissions: false,')), /propiedad duplicada/),
  negative("override dinámico por spread", "src/hub/appCatalog.ts", (s) => editCommercial(s, (object) => object.replace('requiresExplicitPermissions: true,', 'requiresExplicitPermissions: true, ...{ requiresExplicitPermissions: false },')), /propiedades dinámicas ni spreads/),
];

console.log(JSON.stringify({ ok: true, positive: equivalents.length + 1, negative: negatives.length, assertions: negatives.length + equivalents.length + 1, equivalents, negatives }));
