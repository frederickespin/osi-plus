import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({
  absWorkingDir: root,
  stdin: {
    contents: [
      'export * from "./src/warehouses/warehouseSections.ts";',
      'export * from "./src/hub/appCatalog.ts";',
      'export * from "./src/hub/hubAccess.ts";',
      'export * from "./src/hub/hubRouteAccess.ts";',
      'export * from "./src/hub/hubAvailability.ts";',
    ].join("\n"),
    resolveDir: root,
    sourcefile: "warehouses-access-entry.ts",
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
  WAREHOUSE_SECTIONS, warehouseSectionFromRoute, availableWarehouseSections, groupWarehouseLaunchers,
  HUB_APPLICATIONS, findHubApplicationByRoute, evaluateHubAccess, evaluateHubRouteAccess,
  visibleHubApplications, availableHubApplications,
} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

const warehouses = HUB_APPLICATIONS.find((application) => application.appId === "warehouses");
const allEnabled = { spaces: true, configuration: true, materials: true, equipment: true };
const permissions = ["inventory:stock:view", "inventory:catalog:view", "assets:instance:view"];
const context = (effective, denied = [], role = "A") => ({ role, effectivePermissions: effective, deniedPermissions: denied, source: effective === null ? "SERVER_VALIDATED_ROLE" : "SERVER_EFFECTIVE_PERMISSIONS" });
const sectionIds = (effective, denied = [], enabled = allEnabled) => availableWarehouseSections(enabled, effective, denied).map((section) => section.id);

test("Almacenes requires an explicit entry permission regardless of role", () => {
  for (const role of ["A", "V", "K", "I", "D", "PA"]) {
    for (const effective of [null, [], ["inventory:catalog:manage"], ["inventory:catalog:view"], ["assets:instance:manage"]]) {
      assert.equal(evaluateHubAccess(warehouses, context(effective, [], role)).allowed, false);
      assert.equal(evaluateHubRouteAccess("/warehouses", context(effective, [], role)).allowed, false);
      assert.deepEqual(sectionIds(effective), []);
    }
  }
});

test("section authorization agrees with deep routes for every grant and deny combination", () => {
  const subset = (mask) => permissions.filter((_, index) => mask & (1 << index));
  for (let grantMask = 0; grantMask < 8; grantMask += 1) {
    for (let denyMask = 0; denyMask < 8; denyMask += 1) {
      const effective = subset(grantMask); const denied = subset(denyMask);
      const can = (permission) => effective.includes(permission) && !denied.includes(permission);
      const expected = {
        spaces: can("inventory:stock:view"),
        configuration: can("inventory:stock:view"),
        materials: can("inventory:catalog:view") && can("inventory:stock:view"),
        equipment: can("assets:instance:view"),
      };
      const actual = sectionIds(effective, denied);
      assert.equal(evaluateHubRouteAccess("/warehouses", context(effective, denied)).allowed, Object.values(expected).some(Boolean));
      for (const section of WAREHOUSE_SECTIONS) {
        const label = `${section.id}: grants=${grantMask}, denies=${denyMask}`;
        assert.equal(actual.includes(section.id), expected[section.id], label);
        assert.equal(evaluateHubRouteAccess(section.route, context(effective, denied)).allowed, expected[section.id], label);
      }
    }
  }
});

test("a catalog denial leaves spaces and independently authorized equipment available", () => {
  assert.deepEqual(sectionIds(permissions, ["inventory:catalog:view"]), ["spaces", "configuration", "equipment"]);
  assert.deepEqual(sectionIds(permissions, ["inventory:stock:view"]), ["equipment"]);
  assert.deepEqual(sectionIds(permissions, ["assets:instance:view"]), ["spaces", "configuration", "materials"]);
});

test("feature availability only narrows authorized sections", () => {
  for (let mask = 0; mask < 16; mask += 1) {
    const enabled = Object.fromEntries(WAREHOUSE_SECTIONS.map((section, index) => [section.id, Boolean(mask & (1 << index))]));
    assert.deepEqual(sectionIds(permissions, [], enabled), WAREHOUSE_SECTIONS.filter((section) => enabled[section.id]).map((section) => section.id));
    assert.deepEqual(sectionIds([], [], enabled), []);
  }
});

test("root and subroutes share one declarative application without adopting legacy routes", () => {
  assert.equal(warehouses.route, "/warehouses");
  assert.equal(warehouses.requiresExplicitPermissions, true);
  assert.equal(warehouses.denyScope, "PERMISSION");
  assert.equal(warehouses.permissionMode, "ANY");
  assert.deepEqual(warehouses.baselineRoles, []);
  assert.deepEqual(warehouses.routeAliases, WAREHOUSE_SECTIONS.map((section) => section.route));
  for (const section of WAREHOUSE_SECTIONS) {
    assert.equal(findHubApplicationByRoute(section.route)?.appId, "warehouses");
    assert.equal(warehouseSectionFromRoute(section.route)?.id, section.id);
  }
  assert.equal(findHubApplicationByRoute("/materials")?.appId, "materials-equipment");
  assert.equal(findHubApplicationByRoute("/assets")?.appId, "tools-equipment");
});

test("legacy material and equipment entry permissions remain unchanged", () => {
  assert.equal(evaluateHubRouteAccess("/materials", context(["inventory:stock:view"])).allowed, false);
  assert.equal(evaluateHubRouteAccess("/materials", context(["inventory:stock:view", "inventory:catalog:view"])).allowed, true);
  assert.equal(evaluateHubRouteAccess("/materials", context(permissions, ["inventory:catalog:view"])).allowed, false);
  assert.equal(evaluateHubRouteAccess("/assets", context(["assets:instance:view"])).allowed, true);
  assert.equal(evaluateHubRouteAccess("/assets", context(permissions, ["assets:instance:view"])).allowed, false);
});

test("similar or unknown routes never resolve to a warehouse section", () => {
  for (const path of ["/warehouses/unknown", "/warehouses/spaces/unknown", "/warehouse", "/warehouses/../materials"]) {
    assert.equal(warehouseSectionFromRoute(path), null);
    assert.equal(findHubApplicationByRoute(path), null);
    assert.equal(evaluateHubRouteAccess(path, context(permissions)).reason, "ROUTE_NOT_REGISTERED");
  }
});

test("grouping removes only enabled consumer launchers while preserving authorized direct routes", () => {
  const authorized = visibleHubApplications(HUB_APPLICATIONS, context(permissions));
  const available = availableHubApplications(authorized, { warehouses: true, "materials-equipment": true, "tools-equipment": true });
  assert.deepEqual(groupWarehouseLaunchers(available, availableWarehouseSections(allEnabled, permissions, [])).map((application) => application.appId), ["warehouses"]);
  assert.deepEqual(groupWarehouseLaunchers(available, availableWarehouseSections({ ...allEnabled, materials: false }, permissions, [])).map((application) => application.appId), ["warehouses", "materials-equipment"]);
  assert.deepEqual(groupWarehouseLaunchers(available, availableWarehouseSections({ ...allEnabled, equipment: false }, permissions, [])).map((application) => application.appId), ["warehouses", "tools-equipment"]);
  const withoutWarehouse = available.filter((application) => application.appId !== "warehouses");
  assert.equal(groupWarehouseLaunchers(withoutWarehouse, WAREHOUSE_SECTIONS), withoutWarehouse);
  assert.equal(evaluateHubRouteAccess("/materials", context(permissions)).allowed, true);
  assert.equal(evaluateHubRouteAccess("/assets", context(permissions)).allowed, true);
});
