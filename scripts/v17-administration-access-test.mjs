import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Exercise the actual TypeScript access functions, with no DOM, server, browser,
// credentials, or generated files in the repository.
const bundled = await build({
  absWorkingDir: root,
  stdin: {
    contents: [
      'export * from "./src/administration/administrationSections.ts";',
      'export * from "./src/hub/appCatalog.ts";',
      'export * from "./src/hub/hubAccess.ts";',
      'export * from "./src/hub/hubRouteAccess.ts";',
    ].join("\n"),
    resolveDir: root,
    sourcefile: "administration-access-entry.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  tsconfig: resolve(root, "tsconfig.json"),
  write: false,
  logLevel: "silent",
});
const {
  ADMINISTRATION_SECTIONS,
  administrationSectionFromRoute,
  availableAdministrationSections,
  HUB_APPLICATIONS,
  findHubApplicationByRoute,
  evaluateHubAccess,
  evaluateHubRouteAccess,
} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

const administration = HUB_APPLICATIONS.find((application) => application.appId === "administration");
const enabled = Object.freeze({ access: true, services: true, logistics: true, costing: true, communications: true, policies: true });
const context = (permissions, denied = [], role = "A") => ({
  role,
  effectivePermissions: permissions,
  deniedPermissions: denied,
  source: permissions === null ? "SERVER_VALIDATED_ROLE" : "SERVER_EFFECTIVE_PERMISSIONS",
});
const sectionsFor = (permissions, denied = [], modes = enabled) =>
  availableAdministrationSections(modes, permissions, denied).map((section) => section.id);

test("los roles sin permisos explícitos no conceden Administración", () => {
  for (const role of ["A", "V", "K", "I"]) {
    assert.equal(evaluateHubAccess(administration, context([], [], role)).allowed, false, role);
    assert.equal(evaluateHubRouteAccess("/administration", context([], [], role)).allowed, false, role);
  }
});

test("un contexto sin lista efectiva rechaza la raíz, las subrutas y la navegación administrativa", () => {
  assert.equal(evaluateHubAccess(administration, context(null)).allowed, false);
  for (const section of ADMINISTRATION_SECTIONS) {
    assert.equal(evaluateHubRouteAccess(section.route, context(null)).allowed, false, section.route);
  }
  assert.deepEqual(sectionsFor(null), []);
});

test("Costos funciona con su permiso lector y sin membership:view", () => {
  const access = context(["costing:rules:view"]);
  assert.equal(evaluateHubRouteAccess("/administration", access).allowed, true);
  assert.equal(evaluateHubRouteAccess("/administration/costing", access).allowed, true);
  assert.equal(evaluateHubRouteAccess("/administration/access", access).allowed, false);
  assert.deepEqual(sectionsFor(access.effectivePermissions), ["costing"]);
});

test("Usuarios y roles exige administrador sin bloquear otras secciones autorizadas", () => {
  for (const role of ["V", "K", "I"]) {
    const access = context(["membership:view", "logistics:rules:view"], [], role);
    assert.equal(evaluateHubRouteAccess("/administration/access", access).allowed, false, role);
    assert.equal(evaluateHubRouteAccess("/administration/logistics", access).allowed, true, role);
    assert.equal(evaluateHubRouteAccess("/administration", access).allowed, true, role);
  }
  assert.equal(evaluateHubRouteAccess("/administration/access", context(["membership:view"])).allowed, true);
});

test("Servicios admite cada permiso lector independiente y no concede otras secciones", () => {
  for (const permission of ["services:catalog:view", "services:packages:view", "services:materials:view"]) {
    const access = context([permission]);
    assert.equal(evaluateHubRouteAccess("/administration", access).allowed, true, permission);
    assert.equal(evaluateHubRouteAccess("/administration/services", access).allowed, true, permission);
    assert.equal(evaluateHubRouteAccess("/administration/access", access).allowed, false, permission);
    assert.deepEqual(sectionsFor([permission]), ["services"], permission);
  }
});

test("denegar Logística conserva raíz y Costos, pero rechaza su subruta y su opción", () => {
  const permissions = ["logistics:rules:view", "costing:rules:view"];
  const denied = ["logistics:rules:view"];
  const access = context(permissions, denied);
  assert.equal(evaluateHubRouteAccess("/administration", access).allowed, true);
  assert.equal(evaluateHubRouteAccess("/administration/costing", access).allowed, true);
  assert.equal(evaluateHubRouteAccess("/administration/logistics", access).allowed, false);
  assert.deepEqual(sectionsFor(permissions, denied), ["costing"]);
});

test("denegar un permiso de Servicios conserva otro permiso lector independiente", () => {
  const permissions = ["services:catalog:view", "services:packages:view"];
  const denied = ["services:catalog:view"];
  assert.equal(evaluateHubRouteAccess("/administration/services", context(permissions, denied)).allowed, true);
  assert.deepEqual(sectionsFor(permissions, denied), ["services"]);
});

test("denegar todos los permisos de entrada impide raíz, subrutas y navegación", () => {
  const permissions = [...new Set(ADMINISTRATION_SECTIONS.flatMap((section) => section.permissions))];
  const access = context(permissions, permissions);
  assert.equal(evaluateHubRouteAccess("/administration", access).allowed, false);
  for (const section of ADMINISTRATION_SECTIONS) {
    assert.equal(evaluateHubRouteAccess(section.route, access).allowed, false, section.route);
  }
  assert.deepEqual(sectionsFor(permissions, permissions), []);
});

test("un permiso de gestión de personal no publica Políticas sin un permiso de entrada", () => {
  const permissions = ["costing:rules:view", "personnel:profiles:manage"];
  const access = context(permissions);
  // PersonnelPoliciesAccess.canView may include management rights. Its runtime
  // flag must not invent an entry permission missing from the Hub contract.
  assert.equal(evaluateHubRouteAccess("/administration", access).allowed, true);
  assert.equal(evaluateHubRouteAccess("/administration/policies", access).allowed, false);
  assert.deepEqual(sectionsFor(permissions), ["costing"]);
});

test("la disponibilidad exige tanto modo habilitado como permiso lector", () => {
  assert.deepEqual(sectionsFor(["costing:rules:view"], [], { ...enabled, costing: false }), []);
  assert.deepEqual(sectionsFor([], [], enabled), []);
  assert.deepEqual(sectionsFor(["personnel:profiles:view"]), ["policies"]);
  assert.deepEqual(sectionsFor(["personnel:profiles:view"], ["personnel:profiles:view"]), []);
});

test("las rutas desconocidas no se interpretan como una sección administrativa", () => {
  for (const path of ["/administration/unknown", "/administration/logistics/unknown", "/administration/logistic", "/administration/../costing"]) {
    assert.equal(administrationSectionFromRoute(path), null, path);
    assert.equal(findHubApplicationByRoute(path), null, path);
    assert.equal(evaluateHubRouteAccess(path, context(["costing:rules:view"])).reason, "ROUTE_NOT_REGISTERED", path);
  }
});

test("otras aplicaciones conservan la denegación global, incluso para permisos ANY", () => {
  const coordination = HUB_APPLICATIONS.find((application) => application.appId === "coordination");
  const deniedContext = context(["projects:view", "ops:view"], ["ops:view"], "K");
  assert.equal(evaluateHubAccess(coordination, deniedContext).allowed, false);
  assert.equal(evaluateHubAccess(coordination, deniedContext).reason, "PERMISSION_DENIED");
  assert.equal(evaluateHubRouteAccess("/coordination", deniedContext).allowed, false);
  assert.equal(evaluateHubAccess(coordination, context(["projects:view"], [], "K")).allowed, true);
  assert.deepEqual(HUB_APPLICATIONS.filter((application) => application.denyScope === "PERMISSION").map((application) => application.appId), ["administration"]);
});

test("catálogo y secciones coinciden en rutas y permisos explícitos", () => {
  const routes = ADMINISTRATION_SECTIONS.map((section) => section.route);
  assert.equal(new Set(routes).size, 6);
  assert.deepEqual(new Set(administration.routeAliases), new Set(routes));
  assert.deepEqual(new Set(administration.requiredPermissions), new Set(ADMINISTRATION_SECTIONS.flatMap((section) => section.permissions)));
  assert.equal(administration.requiresExplicitPermissions, true);
  assert.deepEqual(administration.baselineRoles, []);
  assert.equal(administration.permissionMode, "ANY");
  for (const section of ADMINISTRATION_SECTIONS) {
    assert.equal(findHubApplicationByRoute(section.route)?.appId, "administration", section.route);
    assert.equal(administrationSectionFromRoute(section.route)?.id, section.id, section.route);
  }
});
