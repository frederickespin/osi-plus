import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";
import { formatWarehouseAddress, warehouseAddressSegments, warehouseAddressSegmentsFromIdentifier } from "../shared/warehouseSheetAddress.js";
import { formatWarehouseDisplayAddress } from "../shared/warehouseLocalityAddress.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({ absWorkingDir: root, stdin: {
  contents: ["api", "sheetDraft", "routeDraft", "routeWorking", "workingSheet", "pendingDraft", "localitiesMode", "locationTree"].map((name) => `export * from "./src/warehouses/${name}.ts";`).join("\n"),
  sourcefile: "warehouse-localities-client-entry.ts", resolveDir: root, loader: "ts",
}, bundle: true, platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent" });
let sequence = 0;
const fresh = () => import(`data:text/javascript;base64,${Buffer.from(`${bundled.outputFiles[0].text}\n// fresh ${sequence++}`).toString("base64")}`);
const client = await fresh();
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
after(() => { globalThis.fetch = originalFetch; if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage); else delete globalThis.sessionStorage; });
const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const address = (segments) => ({ ...segments, label: formatWarehouseAddress(segments) });
function sheet(number = 4, localityNumber) {
  const rootAddress = address(warehouseAddressSegments(null, "WAREHOUSE_ROOT", number));
  const rack = address(warehouseAddressSegmentsFromIdentifier(rootAddress, "RACK", "AA"));
  const level = address(warehouseAddressSegmentsFromIdentifier(rack, "LEVEL", "2"));
  const locations = [["WAREHOUSE_ROOT", null, rootAddress], ["RACK", id(2), rack], ["LEVEL", id(3), level]].map(([kind, parentLocationRef, value], index) => ({
    locationRef: id(index + 2), parentLocationRef, name: `Lugar ${kind}`, code: `HIST-${kind}`, kind, depth: index, path: `HIST/${index}`, status: "ACTIVE", version: 1, configurationVersion: 0, areaUseRef: null,
    address: { ...value, ...(localityNumber === undefined ? {} : { displayLabel: formatWarehouseDisplayAddress(localityNumber, value) }) },
  }));
  return { warehouseRef: id(1), code: "ALM-HISTORICO", name: "Banco sintético", status: "ACTIVE", version: 3, profileVersion: 2, warehouseNumber: number, warehouseLabel: `ALM-${String(number).padStart(2, "0")}`, manager: null, rootLocationRef: id(2), rootAreaUseRef: null, rootConfigurationVersion: 0,
    ...(localityNumber === undefined ? {} : { localityNumber }), locations };
}
const response = (data) => new Response(JSON.stringify({ ok: true, data }), { headers: { "Content-Type": "application/json" } });
const invalid = (error) => error.code === "MATERIALS_RESPONSE_INVALID";
const options = { localitiesEnabled: true };

test("20E requires every dependent gate and the precise preview token", () => {
  const local = { VITE_MATERIALS_INVENTORY_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_SHEET_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_ROUTES_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_LOCALITIES_UI_MODE: "LOCAL_ONLY" };
  const mode = client.resolveWarehouseLocalitiesUiMode;
  assert.equal(mode({}, "localhost"), "DISABLED");
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(mode(local, host), "LOCAL_ONLY");
  for (const field of Object.keys(local)) assert.equal(mode({ ...local, [field]: "DISABLED" }, "localhost"), "DISABLED");
  for (const host of ["example.test", "localhost.example.test"]) assert.equal(mode(local, host), "DISABLED");
  assert.equal(mode({ ...local, VERCEL_ENV: "preview" }, "localhost"), "DISABLED");
  const preview = Object.fromEntries(Object.keys(local).map((key) => [key, "PREVIEW_REHEARSAL"]));
  Object.assign(preview, { VITE_MATERIALS_INVENTORY_UI_BATCH: "V17-MATERIALS-INVENTORY-05A-PREVIEW", VITE_WAREHOUSE_CONFIGURATION_UI_BATCH: "V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW", VITE_WAREHOUSE_SHEET_UI_BATCH: "V17-WAREHOUSE-SHEET-20C-PREVIEW", VITE_WAREHOUSE_ROUTES_UI_BATCH: "V17-WAREHOUSE-ROUTES-20D-PREVIEW", VITE_WAREHOUSE_LOCALITIES_UI_BATCH: "V17-WAREHOUSE-LOCALITIES-20E-PREVIEW", VITE_VERCEL_ENV: "preview", VITE_VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview" });
  assert.equal(mode(preview, "preview.example.test"), "PREVIEW_REHEARSAL");
  for (const field of Object.keys(preview)) assert.equal(mode({ ...preview, [field]: "wrong" }, "preview.example.test"), "DISABLED", field);
});

test("new sheets propose S1 and existing sheets stay unassigned until explicit assignment", () => {
  assert.equal(client.sheetDraftFrom(undefined, undefined, options).localityNumber, 1);
  assert.equal(Object.hasOwn(client.sheetDraftFrom(), "localityNumber"), false);
  for (const value of [undefined, null, 3]) {
    const warehouse = sheet(4, value);
    const draft = client.sheetDraftFrom(warehouse, undefined, options);
    assert.equal(draft.localityNumber, value ?? null);
    const change = client.warehouseSheetChange({ ...draft, localityNumber: 1 }, warehouse);
    assert.equal(change.localityNumber, 1); assert.equal(change.rows.length, 0);
    assert.equal(client.validatePendingWarehouseSheetChange(change).localityNumber, 1);
    assert.equal(client.validatePendingWarehouseSheetChange({ ...change, localityNumber: null }).localityNumber, null);
    for (const bad of [0, -1, 1000, 1.1, "1", undefined, true]) assert.equal(client.validatePendingWarehouseSheetChange({ ...change, localityNumber: bad }), null);
  }
});

test("legacy recovery and working storage preserve absent locality and exact command identity", async () => {
  const data = new Map();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) } });
  const warehouse = sheet();
  const old = client.warehouseSheetChange({ ...client.sheetDraftFrom(warehouse), name: "Nombre corregido" }, warehouse);
  const recovered = client.sheetDraftFrom(warehouse, old, options);
  assert.equal(Object.hasOwn(recovered, "localityNumber"), false);
  assert.deepEqual(client.warehouseSheetChange(recovered, warehouse, old), old);
  assert.equal(client.setWorkingWarehouseSheet(id(50), old), true);
  client.setPendingWarehouseDraft(id(50), { requestId: id(51), change: old });
  const next = await fresh();
  assert.deepEqual(next.getWorkingWarehouseSheet(id(50)), old);
  assert.deepEqual(next.getPendingWarehouseDraft(id(50)), { requestId: id(51), change: old });
  const assigned = { ...old, localityNumber: 999 };
  assert.equal(next.setWorkingWarehouseSheet(id(52), assigned), true);
  assert.deepEqual((await fresh()).getWorkingWarehouseSheet(id(52)), assigned);
});

test("level02 is presentation only and preserves canonical2, existing IDs and legacy20D behavior", () => {
  const warehouse = sheet(4, 1);
  const draft = client.sheetDraftFrom(warehouse, undefined, options);
  const route = client.emptyWarehouseRoute(true); route.RACK = { identifier: "AA", name: "" }; route.LEVEL = { identifier: "02", name: "" };
  const plan = client.planWarehouseRoute(route, draft, warehouse, () => id(99), options);
  assert.equal(plan.valid, true); assert.equal(plan.label, "S1-ALM4-000-00-AA-02-0"); assert.equal(plan.newCount, 0);
  assert.equal(plan.nodes.at(-1).locationRef, id(4));
  const next = client.planWarehouseRoute({ ...route, LEVEL: { identifier: "03", name: "" } }, draft, warehouse, () => id(99), options);
  assert.equal(next.rows[0].identifier, "3"); assert.equal(next.label, "S1-ALM4-000-00-AA-03-0");
  assert.equal(client.warehouseRouteFormats(false).LEVEL.width, 1); assert.equal(client.warehouseRouteFormats(true).LEVEL.width, 2);
  assert.equal(client.warehouseRouteFromLocation(warehouse, id(4), true).LEVEL.identifier, "02");
  assert.equal(client.planWarehouseRoute(route, draft, warehouse).valid, false);
  for (const bad of ["10", "99", "000", "0x", "-1"]) assert.equal(client.planWarehouseRoute({ ...route, LEVEL: { identifier: bad, name: "" } }, draft, warehouse, undefined, options).valid, false);
  const legacyRoute = { ...route, LEVEL: { identifier: "2", name: "" } };
  assert.equal(client.planWarehouseRoute(legacyRoute, draft, warehouse).label, "ALM-04-000-00-AA-2-0");
});

test("GM1 route and new-warehouse previews use agreed format without inventing a warehouse number", () => {
  const warehouse = sheet(2, 1), draft = client.sheetDraftFrom(warehouse, undefined, options), route = client.emptyWarehouseRoute(true);
  Object.assign(route, { ZONE: { identifier: "GM1", name: "" }, AISLE: { identifier: "01", name: "" }, RACK: { identifier: "AB", name: "" }, LEVEL: { identifier: "03", name: "" } });
  let n = 60;
  const plan = client.planWarehouseRoute(route, draft, warehouse, () => id(n++), options);
  assert.equal(plan.label, "S1-ALM2-GM1-01-AB-03-0");
  assert.deepEqual(plan.rows.map((row) => row.identifier), ["GM1", "01", "AB", "3"]);
  const proposed = client.planWarehouseRoute(route, client.sheetDraftFrom(undefined, undefined, options), undefined, () => id(n++), options);
  assert.equal(proposed.label, "S1-ALM?-GM1-01-AB-03-0");
  const labels = client.provisionalSheetLabels(proposed.rows, undefined, { ...options, localityNumber: 1, unknownWarehouse: true });
  assert.equal(labels.get(proposed.rows.at(-1).rowId), proposed.label);
});

test("read responses validate both historical labels and display labels against persisted locality", async () => {
  const api = new client.WarehouseApi("synthetic");
  for (const value of [sheet(), sheet(4, null), sheet(4, 1)]) {
    globalThis.fetch = async () => response({ warehouses: [value] });
    assert.deepEqual(await api.sheets(), [value]);
  }
  const variants = [
    (value) => { value.locations[2].address.displayLabel = "S2-ALM4-000-00-AA-02-0"; },
    (value) => { value.locations[2].address.label = "S1-ALM4-000-00-AA-02-0"; },
    (value) => { value.localityNumber = null; },
    (value) => { value.localityNumber = "1"; },
    (value) => { delete value.localityNumber; },
  ];
  for (const mutate of variants) {
    const value = sheet(4, 1); mutate(value); globalThis.fetch = async () => response({ warehouses: [value] });
    await assert.rejects(api.sheets(), invalid);
  }
});

test("old receipts remain valid, new assignments require confirmation, retries preserve body and hash", async () => {
  const api = new client.WarehouseApi("synthetic"); const warehouse = sheet();
  const old = client.warehouseSheetChange(client.sheetDraftFrom(warehouse), warehouse);
  const sent = []; globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return response({ warehouse, rowResults: [] }); };
  await api.save(old, id(70)); await api.save(client.validatePendingWarehouseSheetChange(old), id(70));
  assert.deepEqual(sent[1], sent[0]); assert.equal(Object.hasOwn(sent[0], "localityNumber"), false);
  const assigned = { ...old, localityNumber: 1 };
  await assert.rejects(api.save(assigned, id(71)), invalid);
  globalThis.fetch = async () => response({ warehouse: sheet(4, 2), rowResults: [] });
  await assert.rejects(api.save(assigned, id(71)), invalid);
  globalThis.fetch = async () => response({ warehouse: sheet(4, 1), rowResults: [] });
  assert.equal((await api.save(assigned, id(71))).warehouse.localityNumber, 1);
});

test("search finds persisted S labels and unassigned localities only in20E", () => {
  const warehouse = sheet(4, 1);
  assert.equal(client.spaceTreeRows([warehouse], "S1-ALM4-000-00-AA-02-0", "", new Set(), options).at(-1).location.locationRef, id(4));
  assert.equal(client.spaceTreeRows([warehouse], "S1-ALM4-000-00-AA-02-0", "", new Set()).length, 0);
  assert.equal(client.spaceTreeRows([sheet(4, null)], "sin asignar", "", new Set(), options).length, 3);
  assert.equal(client.spaceTreeRows([warehouse], "ALM-04-000-00-AA-2-0", "", new Set(), options).at(-1).location.locationRef, id(4));
});
