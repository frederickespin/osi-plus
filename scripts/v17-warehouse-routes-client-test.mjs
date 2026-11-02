import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";
import { normalizeWarehouseSheetSave } from "../api/_lib/warehouseSheetContract.js";
import { formatWarehouseAddress, warehouseAddressSegments, warehouseAddressSegmentsFromIdentifier } from "../shared/warehouseSheetAddress.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({ absWorkingDir: root, stdin: {
  contents: ["api", "sheetDraft", "routeDraft", "routeWorking", "workingSheet", "pendingDraft", "routesMode"].map((name) => `export * from "./src/warehouses/${name}.ts";`).join("\n"),
  sourcefile: "warehouse-routes-client-entry.ts", resolveDir: root, loader: "ts",
}, bundle: true, platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent" });
const source = bundled.outputFiles[0].text;
let instance = 0;
const freshModule = () => import(`data:text/javascript;base64,${Buffer.from(`${source}\n// instance ${++instance}`).toString("base64")}`);
const client = await freshModule();
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
after(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
});
const uuid = (number) => `a0000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const MEMBER = uuid(1); const OTHER_MEMBER = uuid(2); const REQUEST = uuid(3);
const WAREHOUSE = uuid(10); const ROOT = uuid(11); const ZONE = uuid(12); const RACK = uuid(13); const USE = uuid(20);
let sequence = 1000;
const nextId = () => uuid(++sequence);
const address = (segments) => ({ ...segments, label: formatWarehouseAddress(segments) });
const rootAddress = address(warehouseAddressSegments(null, "WAREHOUSE_ROOT", 1));
const zoneAddress = address(warehouseAddressSegmentsFromIdentifier(rootAddress, "ZONE", "TRD"));
const rackAddress = address(warehouseAddressSegmentsFromIdentifier(zoneAddress, "RACK", "AA"));
function location(locationRef, parentLocationRef, kind, name, value, depth = 1) {
  return { locationRef, parentLocationRef, kind, name, code: `HIST-${kind}`, depth, path: `HIST/${kind}`, status: "ACTIVE", version: 2, configurationVersion: 3, areaUseRef: USE, address: value };
}
function sheet(populated = false) {
  return { warehouseRef: WAREHOUSE, code: "ALM-HIST", name: "Almacén 1", status: "ACTIVE", version: 7, profileVersion: 2,
    warehouseNumber: 1, warehouseLabel: "ALM-01", manager: null, rootLocationRef: ROOT, rootAreaUseRef: USE, rootConfigurationVersion: 4,
    locations: [location(ROOT, null, "WAREHOUSE_ROOT", "Almacén 1", rootAddress, 0), ...(populated ? [
      location(ZONE, ROOT, "ZONE", "Zona de traslados", zoneAddress, 1), location(RACK, ZONE, "RACK", "Estantería principal", rackAddress, 2),
    ] : [])] };
}
function route(values = {}) {
  const draft = client.emptyWarehouseRoute();
  for (const [kind, input] of Object.entries(values)) draft[kind] = typeof input === "string" ? { identifier: input, name: "" } : input;
  return draft;
}
const withRows = (draft, rows) => ({ ...draft, rows: [...draft.rows, ...rows] });
const plan = (value, draft, warehouse) => client.planWarehouseRoute(value, draft ?? client.sheetDraftFrom(warehouse), warehouse, nextId);
function intended(warehouse = sheet(), value = route({ ZONE: "TRD", RACK: "AA" })) {
  const draft = client.sheetDraftFrom(warehouse);
  return client.warehouseSheetChange(withRows(draft, plan(value, draft, warehouse).rows), warehouse);
}
function savedFor(change, initial = sheet()) {
  const warehouse = structuredClone(initial);
  warehouse.name = change.name; warehouse.version = change.expectedWarehouseVersion + 1; warehouse.profileVersion = change.expectedProfileVersion + 1;
  warehouse.rootAreaUseRef = change.rootAreaUseRef;
  const mapped = new Map(change.rows.map((row, index) => [row.rowId, row.action === "UPDATE" ? row.locationRef : uuid(3000 + index)]));
  for (const row of change.rows) {
    if (row.action === "UPDATE") Object.assign(warehouse.locations.find((value) => value.locationRef === row.locationRef), { name: row.name, areaUseRef: row.areaUseRef, version: row.expectedVersion + 1 });
    else {
      const parentRef = row.parentRowId ? mapped.get(row.parentRowId) : row.parentLocationRef ?? ROOT;
      const parent = warehouse.locations.find((value) => value.locationRef === parentRef);
      const value = row.identifier === undefined ? warehouseAddressSegments(parent.address, row.kind, 1) : warehouseAddressSegmentsFromIdentifier(parent.address, row.kind, row.identifier);
      warehouse.locations.push({ ...location(mapped.get(row.rowId), parentRef, row.kind, row.name, address(value), parent.depth + 1), version: 1, configurationVersion: 0, areaUseRef: row.areaUseRef });
    }
  }
  return { warehouse, rowResults: change.rows.map((row) => ({ rowId: row.rowId, locationRef: mapped.get(row.rowId) })) };
}
const json = (data) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
const invalidResponse = (error) => error.code === "MATERIALS_RESPONSE_INVALID" && error.status === 503;
function storageFixture() {
  const items = new Map();
  const storage = { getItem(key) { return items.get(key) ?? null; }, setItem(key, value) { items.set(key, value); }, removeItem(key) { items.delete(key); } };
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  return { items, storage };
}

test("routes UI requires the dedicated20D gate and the existing worksheet/base gates", () => {
  const local = { VITE_MATERIALS_INVENTORY_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_SHEET_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_ROUTES_UI_MODE: "LOCAL_ONLY" };
  const mode = client.resolveWarehouseRoutesUiMode;
  assert.equal(mode({}, "localhost"), "DISABLED");
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(mode(local, host), "LOCAL_ONLY");
  for (const field of Object.keys(local)) assert.equal(mode({ ...local, [field]: "DISABLED" }, "localhost"), "DISABLED");
  for (const host of ["example.test", "localhost.example.test"]) assert.equal(mode(local, host), "DISABLED");
  assert.equal(mode({ ...local, VERCEL_ENV: "development" }, "localhost"), "DISABLED");
  const preview = { VITE_MATERIALS_INVENTORY_UI_MODE: "PREVIEW_REHEARSAL", VITE_MATERIALS_INVENTORY_UI_BATCH: "V17-MATERIALS-INVENTORY-05A-PREVIEW",
    VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "PREVIEW_REHEARSAL", VITE_WAREHOUSE_CONFIGURATION_UI_BATCH: "V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW",
    VITE_WAREHOUSE_SHEET_UI_MODE: "PREVIEW_REHEARSAL", VITE_WAREHOUSE_SHEET_UI_BATCH: "V17-WAREHOUSE-SHEET-20C-PREVIEW",
    VITE_WAREHOUSE_ROUTES_UI_MODE: "PREVIEW_REHEARSAL", VITE_WAREHOUSE_ROUTES_UI_BATCH: "V17-WAREHOUSE-ROUTES-20D-PREVIEW",
    VITE_VERCEL_ENV: "preview", VITE_VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview" };
  assert.equal(mode(preview, "synthetic.vercel.app"), "PREVIEW_REHEARSAL");
  for (const field of Object.keys(preview)) assert.equal(mode({ ...preview, [field]: "wrong" }, "synthetic.vercel.app"), "DISABLED", field);
  assert.equal(mode({ ...preview, VITE_VERCEL_ENV: "production" }, "synthetic.vercel.app"), "DISABLED");
});

test("the reference route TRD /00 /AA /0 /0 has two new places and one existing warehouse", () => {
  const result = plan(route({ ZONE: "TRD", RACK: "AA" }), undefined, sheet());
  assert.equal(result.valid, true); assert.equal(result.label, "ALM-01-TRD-00-AA-0-0");
  assert.equal(result.newCount, 2); assert.equal(result.existingCount, 1); assert.equal(result.stagedCount, 0);
  assert.deepEqual(result.rows.map((row) => [row.kind, row.identifier, row.name]), [["ZONE", "TRD", "Zona TRD"], ["RACK", "AA", "Estantería AA"]]);
  assert.equal(result.rows[0].parentKey, ""); assert.equal(result.rows[1].parentKey, client.newParentKey(result.rows[0].rowId));
  assert.deepEqual(result.nodes.map((node) => node.kind), ["WAREHOUSE_ROOT", "ZONE", "RACK"]);
});

test("numeric identifiers pad while alphanumeric zone characters and lengths remain fixed", () => {
  for (const [raw, expected] of [["1", "001"], [" 1 ", "001"], ["trd", "TRD"], ["a01", "A01"], ["00a", "00A"]]) {
    const result = plan(route({ ZONE: raw, AISLE: "1", RACK: "az", LEVEL: "9", BIN: "4" }), undefined, sheet());
    assert.equal(result.valid, true, raw);
    assert.deepEqual(result.rows.map((row) => row.identifier), [expected, "01", "AZ", "9", "4"]);
    assert.equal(result.label, `ALM-01-${expected}-01-AZ-9-4`);
  }
});

test("every zero or blank omits that level without creating a physical node", () => {
  for (const zero of ["", "0", "00", "000"]) {
    const result = plan(route({ ZONE: zero, AISLE: zero, RACK: "AA", LEVEL: zero, BIN: zero }), undefined, sheet());
    assert.equal(result.valid, true); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].parentKey, "");
    assert.equal(result.label, "ALM-01-000-00-AA-0-0");
  }
  const empty = plan(route(), undefined, sheet());
  assert.equal(empty.activeCount, 0); assert.equal(empty.rows.length, 0); assert.equal(empty.label, "ALM-01-000-00-00-0-0");
});

test("invalid segment formats and a level without a rack cannot be added", () => {
  for (const [kind, value] of [["ZONE", "TR"], ["ZONE", "A_1"], ["ZONE", "1000"], ["AISLE", "A1"], ["AISLE", "100"], ["RACK", "A"], ["RACK", "A1"], ["LEVEL", "10"], ["BIN", "5"]]) {
    const result = plan(route({ [kind]: value }), undefined, sheet());
    assert.equal(result.valid, false, `${kind} ${value}`); assert.ok(result.errors[kind]); assert.equal(result.label, null);
  }
  assert.equal(plan(route({ LEVEL: "1" }), undefined, sheet()).valid, false);
});

test("saved prefixes are reused by parent, kind and identifier, retaining their identity and use", () => {
  const warehouse = sheet(true); const draft = client.sheetDraftFrom(warehouse);
  const complete = plan(route({ ZONE: "TRD", RACK: "AA" }), draft, warehouse);
  assert.equal(complete.rows.length, 0); assert.equal(complete.existingCount, 3);
  assert.equal(complete.nodes.at(-1).locationRef, RACK); assert.equal(complete.nodes.at(-1).status, "existing");
  const extension = plan(route({ ZONE: "TRD", RACK: "AB" }), draft, warehouse);
  assert.equal(extension.rows.length, 1); assert.equal(extension.rows[0].parentKey, client.existingParentKey(ZONE));
  const unchanged = client.warehouseSheetChange(draft, warehouse);
  assert.deepEqual(unchanged.rows, []); assert.equal(draft.rows.find((row) => row.existing.locationRef === ZONE).areaUseRef, USE);
});

test("already staged explicit prefixes and destinations are reused without duplicate CREATE rows", () => {
  const warehouse = sheet(); const draft = client.sheetDraftFrom(warehouse); const value = route({ ZONE: "TRD", RACK: "AA" });
  const first = plan(value, draft, warehouse); const staged = withRows(draft, first.rows);
  const repeated = plan(value, staged, warehouse);
  assert.equal(repeated.rows.length, 0); assert.equal(repeated.stagedCount, 2); assert.equal(repeated.nodes.at(-1).rowId, first.rows[1].rowId);
  const second = plan(route({ ZONE: "TRD", RACK: "AB" }), staged, warehouse);
  assert.equal(second.rows.length, 1); assert.equal(second.stagedCount, 1); assert.equal(second.rows[0].parentKey, client.newParentKey(first.rows[0].rowId));
});

test("one warehouse can mix a direct rack and an aisle/rack branch with the same rack token", () => {
  const warehouse = sheet(); let draft = client.sheetDraftFrom(warehouse);
  draft = withRows(draft, plan(route({ ZONE: "TRD", RACK: "AA" }), draft, warehouse).rows);
  const branch = plan(route({ ZONE: "TRD", AISLE: "01", RACK: "AA", LEVEL: "2", BIN: "4" }), draft, warehouse);
  assert.equal(branch.valid, true); assert.equal(branch.stagedCount, 1); assert.equal(branch.rows.length, 4);
  assert.equal(branch.label, "ALM-01-TRD-01-AA-2-4");
  assert.notEqual(branch.rows.find((row) => row.kind === "RACK").parentKey, draft.rows.find((row) => row.kind === "RACK").parentKey);
  draft = withRows(draft, branch.rows);
  assert.equal(plan(route({ ZONE: "TRD", RACK: "AA" }), draft, warehouse).rows.length, 0);
});

test("an optional name preserves reused nodes and a conflicting name is explicit", () => {
  const warehouse = sheet(true); let draft = client.sheetDraftFrom(warehouse);
  assert.equal(plan(route({ ZONE: { identifier: "TRD", name: "Otro nombre" }, RACK: "AA" }), draft, warehouse).valid, false);
  assert.equal(plan(route({ ZONE: { identifier: "TRD", name: "Zona de traslados" } }), draft, warehouse).valid, true);
  draft = { ...draft, rows: draft.rows.map((row) => row.existing.locationRef === ZONE ? { ...row, name: "Nombre editado en hoja" } : row) };
  const reused = plan(route({ ZONE: "TRD", RACK: "AA" }), draft, warehouse);
  assert.equal(reused.nodes[1].name, "Nombre editado en hoja"); assert.equal(reused.rows.length, 0);
  const fresh = sheet(); const created = plan(route({ ZONE: { identifier: "TRD", name: "Zona personalizada" } }), undefined, fresh);
  assert.match(plan(route({ ZONE: { identifier: "TRD", name: "Otro" } }), withRows(client.sheetDraftFrom(fresh), created.rows), fresh).errors.ZONE, /Ya existe/);
});

test("automatic draft numbers and legacy-looking names or codes are never treated as confirmed identifiers", () => {
  const warehouse = sheet();
  warehouse.locations.push({ ...location(uuid(30), ROOT, "ZONE", "Zona TRD", null), code: "ALM-01-TRD-00-00-0-0" });
  let draft = client.sheetDraftFrom(warehouse);
  draft = withRows(draft, [{ ...client.newSheetRow("", "ZONE", nextId()), name: "Zona 001" }]);
  const named = plan(route({ ZONE: "TRD" }), draft, warehouse);
  assert.equal(named.newCount, 1); assert.equal(named.existingCount, 1);
  const numbered = plan(route({ ZONE: "001" }), draft, warehouse);
  assert.equal(numbered.newCount, 1); assert.equal(numbered.stagedCount, 0);
  const labels = client.provisionalSheetLabels([...draft.rows, ...numbered.rows], warehouse);
  assert.equal(labels.get(draft.rows.at(-1).rowId), "ALM-01-002-00-00-0-0");
  assert.equal(labels.get(numbered.rows[0].rowId), "ALM-01-001-00-00-0-0");
});

test("explicit sibling tokens reserve space before automatic rows, including alphanumeric zones", () => {
  const warehouse = sheet(); const automatic = { ...client.newSheetRow("", "RACK", nextId()), name: "Rack automático" };
  const explicit = { ...client.newSheetRow("", "RACK", nextId()), name: "Rack AA", identifier: "AA" };
  const autoZone = { ...client.newSheetRow("", "ZONE", nextId()), name: "Zona automática" };
  const alpha = { ...client.newSheetRow("", "ZONE", nextId()), name: "Zona TRD", identifier: "TRD" };
  const numeric = { ...client.newSheetRow("", "ZONE", nextId()), name: "Zona 001", identifier: "001" };
  const labels = client.provisionalSheetLabels([automatic, autoZone, alpha, numeric, explicit], warehouse);
  assert.equal(labels.get(automatic.rowId), "ALM-01-000-00-AB-0-0");
  assert.equal(labels.get(explicit.rowId), "ALM-01-000-00-AA-0-0");
  assert.equal(labels.get(autoZone.rowId), "ALM-01-002-00-00-0-0");
  assert.equal(labels.get(alpha.rowId), "ALM-01-TRD-00-00-0-0");
});

test("unknown warehouse numbers stay visibly provisional and zero-marked paths remain branch-specific", () => {
  const draft = { ...client.sheetDraftFrom(), name: "Almacén pendiente" };
  const result = plan(route({ ZONE: "TRD", RACK: "AA" }), draft);
  assert.equal(result.label, "ALM-??-TRD-00-AA-0-0");
  assert.equal(result.nodes[0].status, "newWarehouse");
  assert.equal(client.provisionalSheetLabels(result.rows, undefined, { unknownWarehouse: true }).get(result.rows[1].rowId), result.label);
  const unassigned = { ...sheet(), warehouseNumber: null, warehouseLabel: null, locations: [ { ...sheet().locations[0], address: null } ] };
  assert.equal(plan(route({ RACK: "AA" }), undefined, unassigned).label, "ALM-??-000-00-AA-0-0");
});

test("inactive warehouse/root/parents block expansion while existing routes remain available to inspect", () => {
  for (const inactive of ["warehouse", "root", "zone"]) {
    const warehouse = sheet(true);
    if (inactive === "warehouse") warehouse.status = "INACTIVE";
    else warehouse.locations.find((row) => row.locationRef === (inactive === "root" ? ROOT : ZONE)).status = "INACTIVE";
    const extension = plan(route({ ZONE: "TRD", RACK: "AB" }), undefined, warehouse);
    assert.equal(extension.valid, false); assert.match(extension.error, /inactiva/);
    const existing = plan(route({ ZONE: "TRD", RACK: "AA" }), undefined, warehouse);
    assert.equal(existing.valid, true); assert.equal(existing.rows.length, 0);
  }
});

test("ambiguous explicit siblings and the worksheet change limit prevent adding a route", () => {
  const warehouse = sheet(); let draft = client.sheetDraftFrom(warehouse);
  const first = plan(route({ ZONE: "TRD" }), draft, warehouse).rows[0];
  draft = withRows(draft, [first, { ...first, rowId: nextId() }]);
  assert.equal(plan(route({ ZONE: "TRD" }), draft, warehouse).valid, false);
  assert.equal(client.validateSheetDraft(draft, warehouse, []).valid, false);
  draft = withRows(client.sheetDraftFrom(warehouse), Array.from({ length: 199 }, () => ({ ...client.newSheetRow("", "ZONE", nextId()), name: "Zona automática" })));
  assert.match(plan(route({ ZONE: "TRD", RACK: "AA" }), draft, warehouse).error, /200/);
});

test("working and pending validators preserve absent20C identifiers and accept canonical20D CREATE identifiers only", () => {
  const command = intended(); const first = command.rows[0];
  assert.deepEqual(client.validatePendingWarehouseSheetChange(command), command);
  const legacy = { ...command, rows: command.rows.map(({ identifier: _identifier, ...row }) => row) };
  assert.deepEqual(client.validatePendingWarehouseSheetChange(legacy), legacy);
  assert.equal(Object.hasOwn(client.validateWorkingWarehouseSheetChange(legacy).rows[0], "identifier"), false);
  for (const identifier of [null, undefined, "trd", "1", "000", "A_1", "TRDD"]) {
    assert.equal(client.validatePendingWarehouseSheetChange({ ...command, rows: [{ ...first, identifier }] }), null);
  }
  const update = { action: "UPDATE", rowId: nextId(), locationRef: ZONE, expectedVersion: 2, expectedConfigurationVersion: 3, name: "Zona", areaUseRef: null, identifier: "TRD" };
  assert.equal(client.validateWorkingWarehouseSheetChange({ ...command, rows: [update] }), null);
  const restored = client.sheetDraftFrom(sheet(), command);
  assert.deepEqual(client.warehouseSheetChange(restored, sheet(), command), command);
});

test("auxiliary input survives reload by membership and warehouse, without requests or authoritative fields", async () => {
  const { items } = storageFixture(); const current = await freshModule();
  const first = route({ ZONE: "tr", RACK: "AA" }); const second = route({ ZONE: "A01" });
  assert.equal(current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, first), true);
  assert.equal(current.setWorkingWarehouseRoute(MEMBER, uuid(40), second), true);
  assert.equal(current.setWorkingWarehouseRoute(OTHER_MEMBER, WAREHOUSE, route({ ZONE: "00A" })), true);
  first.RACK.name = "Changed after saving";
  let requests = 0; globalThis.fetch = () => { requests += 1; throw new Error("No automatic request"); };
  const reloaded = await freshModule();
  assert.equal(reloaded.getWorkingWarehouseRoute(MEMBER, WAREHOUSE).ZONE.identifier, "tr");
  assert.equal(reloaded.getWorkingWarehouseRoute(MEMBER, WAREHOUSE).RACK.name, "");
  assert.equal(reloaded.getWorkingWarehouseRoute(MEMBER, uuid(40)).ZONE.identifier, "A01");
  assert.equal(reloaded.getWorkingWarehouseRoute(OTHER_MEMBER, WAREHOUSE).ZONE.identifier, "00A");
  assert.equal(reloaded.getWorkingWarehouseRoute(MEMBER, null), null); assert.equal(requests, 0);
  for (const raw of items.values()) {
    const wrapper = JSON.parse(raw); assert.deepEqual(Object.keys(wrapper).sort(), ["route", "version"]);
    assert.equal(JSON.stringify(wrapper).includes("requestId"), false);
  }
});

test("auxiliary storage rejects metadata, corrupt wrappers and oversized fields instead of restoring cached authority", async () => {
  const { items } = storageFixture(); const current = await freshModule(); const value = route({ ZONE: "TRD" });
  assert.equal(current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, { ...value, requestId: REQUEST }), false);
  assert.equal(current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, { ...value, ZONE: { ...value.ZONE, locationRef: ZONE } }), false);
  for (const bad of [{ ...value, ZONE: { identifier: "A".repeat(17), name: "" } }, { ...value, ZONE: { identifier: "TRD", name: "x".repeat(161) } }, { ...value, ZONE: { identifier: "T\nD", name: "" } }]) assert.equal(current.validateWorkingWarehouseRoute(bad), null);
  current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, value); const key = [...items.keys()][0];
  for (const raw of ["{", "null", "[]", "x".repeat(9000), JSON.stringify({ version: 2, route: value }), JSON.stringify({ version: 1, route: value, requestId: REQUEST })]) {
    items.set(key, raw); assert.equal(current.getWorkingWarehouseRoute(MEMBER, WAREHOUSE), null);
  }
});

test("storage failures retain the newest auxiliary draft and discard tombstones", async () => {
  const { storage } = storageFixture(); const current = await freshModule();
  current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, route({ ZONE: "001" }));
  storage.setItem = () => { throw new Error("blocked"); }; storage.removeItem = () => { throw new Error("blocked"); };
  assert.equal(current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, route({ ZONE: "TRD" })), true);
  assert.equal(current.getWorkingWarehouseRoute(MEMBER, WAREHOUSE).ZONE.identifier, "TRD");
  current.clearWorkingWarehouseRoute(MEMBER, WAREHOUSE);
  assert.equal(current.getWorkingWarehouseRoute(MEMBER, WAREHOUSE), null);
});

test("clearing a worksheet removes its route helper but preserves another warehouse and any pending retry", async () => {
  storageFixture(); const current = await freshModule(); const command = intended();
  current.setWorkingWarehouseSheet(MEMBER, command);
  current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, route({ ZONE: "TRD" }));
  current.setWorkingWarehouseRoute(MEMBER, uuid(40), route({ ZONE: "A01" }));
  const pending = { requestId: REQUEST, change: command }; current.setPendingWarehouseDraft(MEMBER, pending);
  current.clearWorkingWarehouseSheet(MEMBER);
  assert.equal(current.getWorkingWarehouseRoute(MEMBER, WAREHOUSE), null);
  assert.equal(current.getWorkingWarehouseRoute(MEMBER, uuid(40)).ZONE.identifier, "A01");
  assert.deepEqual(current.getPendingWarehouseDraft(MEMBER), pending);
});

test("lost responses retain exact20D request bytes and helper edits cannot change a recovered retry", async () => {
  const { items } = storageFixture(); const current = await freshModule(); const command = intended();
  const pending = { requestId: REQUEST, change: command }; current.setPendingWarehouseDraft(MEMBER, pending);
  const pendingKey = [...items.keys()].find((key) => key.includes("pending")); const original = items.get(pendingKey);
  current.setWorkingWarehouseRoute(MEMBER, WAREHOUSE, route({ ZONE: "A01", RACK: "AZ" }));
  assert.equal(items.get(pendingKey), original);
  const reloaded = await freshModule(); const recovered = reloaded.getPendingWarehouseDraft(MEMBER);
  const sent = []; globalThis.fetch = async (_path, init) => { sent.push(init.body); if (sent.length === 1) throw new Error("lost response"); return json(savedFor(command)); };
  const api = new reloaded.WarehouseApi("synthetic.token");
  await assert.rejects(() => api.save(recovered.change, recovered.requestId), /lost response/);
  assert.deepEqual(await api.save(recovered.change, recovered.requestId), savedFor(command));
  assert.equal(sent[0], sent[1]);
  const body = JSON.parse(sent[0]); assert.deepEqual(normalizeWarehouseSheetSave(body), { ...command, requestId: REQUEST, payloadHash: body.payloadHash });
  assert.equal(body.rows[0].identifier, "TRD"); assert.equal(body.rows[1].identifier, "AA");
});

test("a successful explicit receipt must match its identifier, parent, kind, name and use", async () => {
  const command = intended(); const correct = savedFor(command);
  globalThis.fetch = async () => json(correct);
  assert.deepEqual(await new client.WarehouseApi().save(command, REQUEST), correct);
  const corruptions = [
    (value) => { value.warehouse.locations.at(-1).address = address(warehouseAddressSegmentsFromIdentifier(zoneAddress, "RACK", "AB")); },
    (value) => { value.warehouse.locations.at(-1).parentLocationRef = ROOT; },
    (value) => { value.warehouse.locations.at(-1).kind = "AISLE"; },
    (value) => { value.warehouse.locations.at(-1).name = "Different"; },
    (value) => { value.warehouse.locations.at(-1).areaUseRef = USE; },
    (value) => { value.rowResults[1].locationRef = value.rowResults[0].locationRef; },
  ];
  for (const corrupt of corruptions) {
    const value = structuredClone(correct); corrupt(value); globalThis.fetch = async () => json(value);
    await assert.rejects(() => new client.WarehouseApi().save(command, REQUEST), invalidResponse);
  }
});

test("an ensured existing destination is an acceptable receipt only when all explicit intent fields agree", async () => {
  const warehouse = sheet(true); const rowId = nextId();
  const command = { ...intended(sheet()), rows: [{ action: "CREATE", rowId, parentRowId: null, parentLocationRef: null, kind: "ZONE", identifier: "TRD", name: "Zona de traslados", areaUseRef: USE }] };
  const saved = { warehouse, rowResults: [{ rowId, locationRef: ZONE }] };
  globalThis.fetch = async () => json(saved);
  assert.deepEqual(await new client.WarehouseApi().save(command, REQUEST), saved);
  globalThis.fetch = async () => json({ warehouse, rowResults: [{ rowId, locationRef: RACK }] });
  await assert.rejects(() => new client.WarehouseApi().save(command, REQUEST), invalidResponse);
});

test("both legacy numeric addresses and20D alphanumeric addresses are accepted, malformed zone metadata is not", async () => {
  const numeric = sheet(); numeric.locations.push(location(ZONE, ROOT, "ZONE", "Zona 001", address(warehouseAddressSegments(rootAddress, "ZONE", 1))));
  for (const warehouse of [numeric, sheet(true)]) {
    globalThis.fetch = async () => json({ warehouses: [warehouse] });
    assert.deepEqual(await new client.WarehouseApi().sheets(), [warehouse]);
  }
  for (const zoneCode of ["trd", "001", "T", "A_1"]) {
    const warehouse = sheet(true); warehouse.locations[1].address.zoneCode = zoneCode;
    globalThis.fetch = async () => json({ warehouses: [warehouse] });
    await assert.rejects(() => new client.WarehouseApi().sheets(), invalidResponse);
  }
});

test("only post-receipt route conflicts resolve an uncertain request; rollout gates retain it", () => {
  for (const code of ["WAREHOUSE_ROUTES_REUSE_CONFLICT", "WAREHOUSE_ROUTES_DUPLICATE_TARGET", "WAREHOUSE_ROUTES_IDENTIFIER_CONFLICT"]) {
    const error = new client.WarehouseApiError(code, 409); assert.equal(client.isWarehouseRejectionConfirmed(error), true); assert.notEqual(client.warehouseErrorText(error), code);
  }
  for (const code of ["WAREHOUSE_ROUTES_DISABLED", "WAREHOUSE_ROUTES_CONFIGURATION_INVALID"]) assert.equal(client.isWarehouseRejectionConfirmed(new client.WarehouseApiError(code, 409)), false);
});
