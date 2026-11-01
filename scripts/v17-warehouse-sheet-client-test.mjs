import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";
import { normalizeWarehouseSheetSave } from "../api/_lib/warehouseSheetContract.js";
import { formatWarehouseAddress, warehouseAddressSegments } from "../shared/warehouseSheetAddress.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({ absWorkingDir: root, stdin: {
  contents: ["api", "sheetDraft", "workingSheet", "pendingDraft", "sheetMode"].map((name) => `export * from "./src/warehouses/${name}.ts";`).join("\n"),
  sourcefile: "warehouse-sheet-client-entry.ts", resolveDir: root, loader: "ts",
}, bundle: true, platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent" });
const source = bundled.outputFiles[0].text;
let instance = 0;
const freshModule = () => import(`data:text/javascript;base64,${Buffer.from(`${source}\n// test instance ${++instance}`).toString("base64")}`);
const client = await freshModule();
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
after(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
});
const uuid = (number) => `a0000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const MEMBER_A = uuid(1); const MEMBER_B = uuid(2); const REQUEST = uuid(3);
const WAREHOUSE = uuid(10); const ROOT = uuid(11); const ZONE = uuid(12); const RACK = uuid(13); const LEGACY = uuid(14);
const MANAGER = uuid(20); const USE = uuid(21); const SECOND_USE = uuid(22);
const address = (segments) => ({ ...segments, label: formatWarehouseAddress(segments) });
const rootAddress = address(warehouseAddressSegments(null, "WAREHOUSE_ROOT", 3));
const zoneAddress = address(warehouseAddressSegments(rootAddress, "ZONE", 1));
const rackAddress = address(warehouseAddressSegments(zoneAddress, "RACK", 1));
function location(locationRef, parentLocationRef, kind, name, value, depth) {
  return { locationRef, parentLocationRef, kind, name, code: `LEGACY-${kind}`, depth, path: `ALM-OLD/${kind}`, status: "ACTIVE", version: 2, configurationVersion: 3, areaUseRef: USE, address: value };
}
function sheet() {
  return { warehouseRef: WAREHOUSE, code: "ALM-OLD", name: "Almacén sintético", status: "ACTIVE", version: 7, profileVersion: 2,
    warehouseNumber: 3, warehouseLabel: "ALM-03", manager: { membershipRef: MANAGER, displayName: "Persona sintética", eligible: true },
    rootLocationRef: ROOT, rootAreaUseRef: USE, rootConfigurationVersion: 4,
    locations: [location(ROOT, null, "WAREHOUSE_ROOT", "Almacén sintético", rootAddress, 0), location(ZONE, ROOT, "ZONE", "Zona principal", zoneAddress, 1),
      location(RACK, ZONE, "RACK", "Estantería existente", rackAddress, 2), location(LEGACY, ROOT, "RECEIVING", "Recepción histórica", null, 1)] };
}
const createRow = (rowId, kind, name, parentRowId = null, parentLocationRef = null) => ({ action: "CREATE", rowId, parentRowId, parentLocationRef, kind, name, areaUseRef: null });
function createChange() {
  return { operation: "WAREHOUSE_SHEET_SAVE", warehouseRef: null, expectedWarehouseVersion: 0, expectedProfileVersion: 0,
    expectedRootConfigurationVersion: 0, name: "Almacén nuevo", managerMembershipRef: MANAGER, rootAreaUseRef: USE,
    rows: [createRow(uuid(101), "ZONE", "Zona nueva"), createRow(uuid(102), "RACK", "Estantería nueva", uuid(101))] };
}
function updateChange() {
  return { ...createChange(), warehouseRef: WAREHOUSE, expectedWarehouseVersion: 7, expectedProfileVersion: 2, expectedRootConfigurationVersion: 4,
    name: "Almacén actualizado", rows: [
      { action: "UPDATE", rowId: uuid(103), locationRef: RACK, expectedVersion: 2, expectedConfigurationVersion: 3, name: "Estantería renombrada", areaUseRef: SECOND_USE },
      createRow(uuid(104), "LEVEL", "Nivel nuevo", null, RACK),
    ] };
}
function savedFor(change) {
  const warehouse = sheet();
  warehouse.name = change.name; warehouse.version = change.expectedWarehouseVersion + 1; warehouse.profileVersion = change.expectedProfileVersion + 1;
  warehouse.rootAreaUseRef = change.rootAreaUseRef;
  if (change.warehouseRef === null) warehouse.locations = [warehouse.locations[0]];
  const mapped = new Map(change.rows.map((row, index) => [row.rowId, row.action === "UPDATE" ? row.locationRef : uuid(300 + index)]));
  for (const row of change.rows) {
    if (row.action === "UPDATE") {
      const existing = warehouse.locations.find((value) => value.locationRef === row.locationRef);
      Object.assign(existing, { name: row.name, areaUseRef: row.areaUseRef, version: row.expectedVersion + 1 });
    } else {
      const parentRef = row.parentRowId ? mapped.get(row.parentRowId) : row.parentLocationRef ?? ROOT;
      const parent = warehouse.locations.find((value) => value.locationRef === parentRef);
      warehouse.locations.push({ ...location(mapped.get(row.rowId), parentRef, row.kind, row.name,
        address(warehouseAddressSegments(parent.address, row.kind, 1)), parent.depth + 1), version: 1, configurationVersion: 0, areaUseRef: row.areaUseRef });
    }
  }
  return { warehouse, rowResults: change.rows.map((row) => ({ rowId: row.rowId, locationRef: mapped.get(row.rowId) })) };
}
const json = (data, status = 200) => new Response(JSON.stringify({ ok: true, data }), { status, headers: { "Content-Type": "application/json" } });
const invalidResponse = (error) => error.code === "MATERIALS_RESPONSE_INVALID" && error.status === 503;
function storageFixture() {
  const items = new Map();
  const storage = { getItem(key) { return items.get(key) ?? null; }, setItem(key, value) { items.set(key, value); }, removeItem(key) { items.delete(key); } };
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  return { items, storage };
}

test("worksheet UI is disabled unless all three gates match the actual environment", () => {
  const mode = client.resolveWarehouseSheetUiMode;
  const local = { VITE_MATERIALS_INVENTORY_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "LOCAL_ONLY", VITE_WAREHOUSE_SHEET_UI_MODE: "LOCAL_ONLY" };
  assert.equal(mode({}, "localhost"), "DISABLED");
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(mode(local, host), "LOCAL_ONLY");
  for (const field of Object.keys(local)) assert.equal(mode({ ...local, [field]: "DISABLED" }, "localhost"), "DISABLED");
  for (const host of ["example.test", "localhost.example.test", "127.0.0.2"]) assert.equal(mode(local, host), "DISABLED");
  assert.equal(mode({ ...local, VERCEL_ENV: "development" }, "localhost"), "DISABLED");
  const preview = { VITE_MATERIALS_INVENTORY_UI_MODE: "PREVIEW_REHEARSAL", VITE_MATERIALS_INVENTORY_UI_BATCH: "V17-MATERIALS-INVENTORY-05A-PREVIEW",
    VITE_WAREHOUSE_CONFIGURATION_UI_MODE: "PREVIEW_REHEARSAL", VITE_WAREHOUSE_CONFIGURATION_UI_BATCH: "V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW",
    VITE_WAREHOUSE_SHEET_UI_MODE: "PREVIEW_REHEARSAL", VITE_WAREHOUSE_SHEET_UI_BATCH: "V17-WAREHOUSE-SHEET-20C-PREVIEW",
    VITE_VERCEL_ENV: "preview", VITE_VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview" };
  assert.equal(mode(preview, "synthetic.vercel.app"), "PREVIEW_REHEARSAL");
  for (const field of Object.keys(preview)) assert.equal(mode({ ...preview, [field]: "wrong" }, "synthetic.vercel.app"), "DISABLED", field);
  assert.equal(mode({ ...preview, VITE_VERCEL_ENV: "production" }, "synthetic.vercel.app"), "DISABLED");
});

test("create and sparse update requests match the backend hash contract and preserve one explicit retry identity", async () => {
  const requests = []; let change;
  globalThis.fetch = async (path, options) => { requests.push({ path, options, body: JSON.parse(options.body) }); return json(savedFor(change)); };
  const api = new client.WarehouseApi("synthetic.token");
  for (change of [createChange(), updateChange()]) {
    assert.deepEqual(await api.save(change, REQUEST), savedFor(change));
    await api.save(change, REQUEST);
    const { path, options, body } = requests.at(-1);
    assert.equal(path, "/api/materials/warehouse-sheets"); assert.equal(options.method, "POST");
    assert.equal(options.credentials, "omit"); assert.equal(options.cache, "no-store"); assert.equal(options.headers.Authorization, "Bearer synthetic.token");
    assert.deepEqual(body, requests.at(-2).body);
    const normalized = normalizeWarehouseSheetSave(body);
    assert.deepEqual(normalized, { ...change, requestId: REQUEST, payloadHash: body.payloadHash });
    for (const key of ["operation", "tenantId", "permissions", "authorization", "code", "label", "warehouseNumber"]) assert.equal(Object.hasOwn(body, key), false);
    for (const row of body.rows) for (const key of ["code", "label", "address", "operationalStatus", "availabilityRule"]) assert.equal(Object.hasOwn(row, key), false);
  }
  assert.equal(requests.length, 4);
});

test("worksheet and manager reads use separate private endpoints and explicit manager pagination", async () => {
  const requests = [];
  const options = { data: [{ membershipRef: MANAGER, displayName: "Persona sintética" }], total: 1, page: 2, pageSize: 25 };
  globalThis.fetch = async (path, init) => { requests.push([path, init]); return json(path.includes("manager-options") ? options : { warehouses: [sheet()] }); };
  const api = new client.WarehouseApi(undefined);
  assert.deepEqual(await api.sheets(), [sheet()]);
  assert.deepEqual(await api.managerOptions(" Encargado % ", 2), options);
  assert.equal(requests.length, 2); assert.equal(requests[0][0], "/api/materials/warehouse-sheets");
  const url = new URL(requests[1][0], "https://synthetic.invalid");
  assert.equal(url.pathname, "/api/materials/warehouse-sheets/manager-options");
  assert.equal(url.searchParams.get("q"), "Encargado %"); assert.equal(url.searchParams.get("page"), "2"); assert.equal(url.searchParams.get("pageSize"), "25");
  for (const [, init] of requests) { assert.equal(init.method, "GET"); assert.equal(Object.hasOwn(init.headers, "Authorization"), false); }
});

test("malformed reads cannot masquerade as empty worksheets or manager options", async () => {
  const brokenAddress = sheet(); brokenAddress.locations[2].address = { label: rackAddress.label };
  for (const data of [null, {}, { warehouses: null }, { warehouses: [{}] }, { warehouses: [{ ...sheet(), manager: {} }] }]) {
    globalThis.fetch = async () => json(data); await assert.rejects(() => new client.WarehouseApi(undefined).sheets(), invalidResponse);
  }
  globalThis.fetch = async () => json({ warehouses: [brokenAddress] });
  await assert.rejects(() => new client.WarehouseApi(undefined).sheets(), invalidResponse);
  for (const data of [null, {}, { data: [], total: "1" }, { data: {}, total: 1 },
    { data: [{}], total: 1, page: 1, pageSize: 25 },
    { data: [{ membershipRef: "invalid", displayName: "Persona" }], total: 1, page: 1, pageSize: 25 },
    { data: [{ membershipRef: MANAGER, displayName: {} }], total: 1, page: 1, pageSize: 25 },
    { data: [], total: -1, page: 1, pageSize: 25 }, { data: [], total: 0, page: 0, pageSize: 25 },
    { data: [], total: 0, page: 1, pageSize: 0 },
  ]) {
    globalThis.fetch = async () => json(data); await assert.rejects(() => new client.WarehouseApi(undefined).managerOptions("", 1), invalidResponse);
  }
});

test("a saved address must contain valid presentation segments before its response can resolve the intent", async () => {
  const change = updateChange();
  for (const value of [{ label: rackAddress.label }, { ...rackAddress, warehouseNumber: 0 },
    { ...rackAddress, rackCode: "A" }, { ...rackAddress, levelNumber: 10 },
    { ...rackAddress, zoneNumber: "001" }]) {
    const saved = savedFor(change); saved.warehouse.locations.find((row) => row.locationRef === RACK).address = value;
    globalThis.fetch = async () => json(saved);
    await assert.rejects(() => new client.WarehouseApi(undefined).save(change, REQUEST), invalidResponse);
  }
});

test("malformed success and mismatched returned rows remain503 with the original pending intent available", async () => {
  storageFixture(); const apiModule = await freshModule(); const change = updateChange(); const intended = { requestId: REQUEST, change };
  apiModule.setPendingWarehouseDraft(MEMBER_A, intended);
  const valid = savedFor(change);
  for (const data of [null, {}, { warehouse: null, rowResults: [] }, { warehouse: valid.warehouse, rowResults: null },
    { ...valid, warehouse: { ...valid.warehouse, warehouseRef: uuid(900) } }, { ...valid, rowResults: [] },
    { ...valid, rowResults: [valid.rowResults[0], valid.rowResults[0]] },
    { ...valid, rowResults: [{ ...valid.rowResults[0], rowId: uuid(900) }, valid.rowResults[1]] },
    { ...valid, rowResults: [{ ...valid.rowResults[0], locationRef: uuid(900) }, valid.rowResults[1]] },
    { ...valid, rowResults: [{ ...valid.rowResults[0], locationRef: ZONE }, valid.rowResults[1]] },
    { ...valid, rowResults: [valid.rowResults[0], { ...valid.rowResults[1], locationRef: valid.rowResults[0].locationRef }] },
  ]) {
    let requests = 0; globalThis.fetch = async () => { requests += 1; return json(data); };
    await assert.rejects(() => new apiModule.WarehouseApi(undefined).save(change, REQUEST), invalidResponse);
    assert.equal(requests, 1); assert.deepEqual(apiModule.getPendingWarehouseDraft(MEMBER_A), intended);
  }
});

test("network and authorization failures do not trigger automatic writes, and abort stops before dispatch", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new TypeError("synthetic connection loss"); };
  await assert.rejects(() => new client.WarehouseApi(undefined).save(createChange(), REQUEST), /synthetic connection loss/);
  assert.equal(requests, 1);
  globalThis.fetch = async () => { requests += 1; return new Response(JSON.stringify({ ok: false, error: "WAREHOUSE_SHEET_FORBIDDEN" }), { status: 403 }); };
  await assert.rejects(() => new client.WarehouseApi(undefined).save(createChange(), REQUEST), (error) => error.code === "WAREHOUSE_SHEET_FORBIDDEN" && error.status === 403);
  assert.equal(requests, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => new client.WarehouseApi(undefined).save(createChange(), REQUEST, controller.signal), { name: "AbortError" });
  assert.equal(requests, 2);
});

test("only post-receipt20C business rejections resolve a recovered command", () => {
  for (const code of ["NOT_FOUND", "LOCATION_NOT_FOUND", "MANAGER_NOT_FOUND", "MANAGER_INELIGIBLE", "USE_NOT_FOUND", "USE_INACTIVE", "VERSION_CONFLICT", "HIERARCHY_INVALID", "ROOT_ROW_INVALID", "RESOURCE_INACTIVE", "ADDRESS_CAPACITY_EXCEEDED", "CODE_CONFLICT", "WRITE_CONFLICT"]) {
    assert.equal(client.isWarehouseRejectionConfirmed(new client.WarehouseApiError(`WAREHOUSE_SHEET_${code}`, 409)), true, code);
  }
  for (const code of ["DISABLED", "CONFIGURATION_INVALID", "FORBIDDEN", "INPUT_INVALID", "PAYLOAD_HASH_MISMATCH", "IDEMPOTENCY_CONFLICT", "UNKNOWN"]) {
    assert.equal(client.isWarehouseRejectionConfirmed(new client.WarehouseApiError(`WAREHOUSE_SHEET_${code}`, 409)), false, code);
  }
  assert.equal(client.isWarehouseRejectionConfirmed(new Error("network")), false);
});

test("stored commands reject authority fields, code overrides, malformed versions and dependency cycles", () => {
  const command = createChange(); const first = command.rows[0];
  const invalid = [
    ...["tenantId", "authorization", "permissions", "code", "warehouseNumber", "requestId"].map((field) => ({ ...command, [field]: "injected" })),
    ...["code", "label", "address", "operationalStatus"].map((field) => ({ ...command, rows: [{ ...first, [field]: "injected" }] })),
    { ...command, expectedWarehouseVersion: 1 }, { ...command, expectedProfileVersion: -1 }, { ...command, managerMembershipRef: "invalid" },
    { ...command, rows: [{ ...first, parentLocationRef: ROOT }] }, { ...command, rows: [first, first] },
    { ...command, rows: [{ ...first, parentRowId: first.rowId }] },
    { ...command, rows: [{ ...first, parentRowId: command.rows[1].rowId }, command.rows[1]] },
    { ...command, rows: [{ ...first, parentRowId: uuid(900) }] },
    { ...command, rows: Array.from({ length: 201 }, (_, index) => ({ ...first, rowId: uuid(1000 + index) })) },
    { ...updateChange(), rows: [updateChange().rows[0], { ...updateChange().rows[0], rowId: uuid(900) }] },
  ];
  for (const value of invalid) {
    assert.equal(client.validatePendingWarehouseSheetChange(value), null);
    assert.equal(client.validateWorkingWarehouseSheetChange(value), null);
  }
  const accepted = client.validatePendingWarehouseSheetChange(command);
  assert.deepEqual(accepted, command); assert.ok(Object.isFrozen(accepted.rows)); assert.ok(Object.isFrozen(accepted.rows[0]));
});

test("editable work may be incomplete but neither stored form admits control characters", () => {
  const unfinished = { ...createChange(), name: "", rows: [createRow(uuid(101), "ZONE", "")] };
  assert.deepEqual(client.validateWorkingWarehouseSheetChange(unfinished), unfinished);
  assert.equal(client.validatePendingWarehouseSheetChange(unfinished), null);
  for (const name of ["Zona\t1", "Zona\u00001", "Zona\u007f1"]) {
    for (const value of [{ ...createChange(), name }, { ...createChange(), rows: [{ ...createChange().rows[0], name }] }]) {
      assert.equal(client.validatePendingWarehouseSheetChange(value), null); assert.equal(client.validateWorkingWarehouseSheetChange(value), null);
    }
  }
});

test("pending and editable caches are membership scoped, detached from caller objects and never replay on reload", async () => {
  const { items } = storageFixture(); const current = await freshModule(); const work = createChange();
  const intended = { requestId: REQUEST, change: updateChange() };
  assert.equal(current.setWorkingWarehouseSheet(MEMBER_A, work), true);
  current.setWorkingWarehouseSheet(MEMBER_B, { ...work, name: "Trabajo de otra membresía" });
  current.setPendingWarehouseDraft(MEMBER_A, intended);
  work.rows[0].name = "Mutación ajena";
  assert.equal(current.getWorkingWarehouseSheet(MEMBER_A).rows[0].name, "Zona nueva");
  let requests = 0; globalThis.fetch = () => { requests += 1; throw new Error("automatic replay forbidden"); };
  const reloaded = await freshModule();
  assert.deepEqual(reloaded.getPendingWarehouseDraft(MEMBER_A), intended);
  assert.equal(reloaded.getPendingWarehouseDraft(MEMBER_B), null);
  assert.equal(reloaded.getWorkingWarehouseSheet(MEMBER_A).name, "Almacén nuevo");
  assert.equal(reloaded.getWorkingWarehouseSheet(MEMBER_B).name, "Trabajo de otra membresía");
  assert.equal(requests, 0); assert.equal(items.size, 3);
  for (const [key, raw] of items) {
    const wrapper = JSON.parse(raw);
    if (key.includes("sheet-working")) { assert.deepEqual(Object.keys(wrapper).sort(), ["change", "version"]); assert.equal(Object.hasOwn(wrapper.change, "requestId"), false); }
  }
  reloaded.clearWorkingWarehouseSheet(MEMBER_A);
  assert.deepEqual(reloaded.getPendingWarehouseDraft(MEMBER_A), intended);
});

test("corrupt working storage cannot resurrect cached work or introduce caller authority", async () => {
  const { items } = storageFixture(); const api = await freshModule();
  const command = createChange(); api.setWorkingWarehouseSheet(MEMBER_A, command); const key = [...items.keys()][0];
  for (const raw of ["{", "null", "[]", "x".repeat(client.SHEET_BYTE_LIMIT + 1), JSON.stringify({ version: 2, change: command }),
    JSON.stringify({ version: 1, change: command, authorization: "injected" }),
    JSON.stringify({ version: 1, change: { ...command, tenantId: "injected" } }),
  ]) {
    items.set(key, raw); assert.equal(api.getWorkingWarehouseSheet(MEMBER_A), null);
    assert.equal((await freshModule()).getWorkingWarehouseSheet(MEMBER_A), null);
  }
  assert.equal(api.setWorkingWarehouseSheet("invalid-member", command), false);
  assert.equal(api.getWorkingWarehouseSheet("invalid-member"), null);
});

test("storage failures preserve newer editable work and tombstones without restoring an obsolete draft", async () => {
  const { storage } = storageFixture(); const api = await freshModule(); const command = createChange();
  api.setWorkingWarehouseSheet(MEMBER_A, command); api.setPendingWarehouseDraft(MEMBER_A, { requestId: REQUEST, change: command });
  storage.setItem = () => { throw new Error("synthetic quota"); }; storage.removeItem = () => { throw new Error("synthetic remove"); };
  api.setWorkingWarehouseSheet(MEMBER_A, { ...command, name: "Trabajo nuevo" });
  api.setPendingWarehouseDraft(MEMBER_A, { requestId: uuid(4), change: { ...command, name: "Intento nuevo" } });
  assert.equal(api.getWorkingWarehouseSheet(MEMBER_A).name, "Trabajo nuevo");
  assert.equal(api.getPendingWarehouseDraft(MEMBER_A).change.name, "Intento nuevo");
  api.clearWorkingWarehouseSheet(MEMBER_A); api.clearPendingWarehouseDraft(MEMBER_A);
  assert.equal(api.getWorkingWarehouseSheet(MEMBER_A), null); assert.equal(api.getPendingWarehouseDraft(MEMBER_A), null);
});

test("unchanged legacy rows stay sparse while edits retain original identities and optimistic versions", () => {
  const baseline = sheet(); const draft = client.sheetDraftFrom(baseline);
  assert.equal(draft.rows.length, 3); assert.equal(client.warehouseSheetChange(draft, baseline).rows.length, 0);
  const old = draft.rows.find((row) => row.existing.locationRef === LEGACY);
  const changed = { ...draft, name: " Cabecera actualizada ", rows: draft.rows.map((row) => row === old ? { ...row, name: " Recepción renombrada " } : row) };
  const command = client.warehouseSheetChange(changed, baseline);
  assert.equal(command.name, "Cabecera actualizada"); assert.equal(command.rows.length, 1);
  assert.deepEqual(command.rows[0], { action: "UPDATE", rowId: old.rowId, locationRef: LEGACY, expectedVersion: 2, expectedConfigurationVersion: 3, name: "Recepción renombrada", areaUseRef: USE });
  assert.equal(command.expectedWarehouseVersion, 7); assert.equal(command.expectedProfileVersion, 2); assert.equal(command.expectedRootConfigurationVersion, 4);
  assert.equal(baseline.locations.find((row) => row.locationRef === LEGACY).code, "LEGACY-RECEIVING");
  assert.equal(client.validatePendingWarehouseSheetChange(command)?.rows.length, 1);
});

test("rehydrating unsent edits retains their expected versions even when a newer sheet has been fetched", () => {
  const recovery = updateChange(); const latest = sheet(); latest.version = 8; latest.profileVersion = 3; latest.rootConfigurationVersion = 5;
  latest.locations.find((row) => row.locationRef === RACK).version = 9;
  const draft = client.sheetDraftFrom(latest, recovery);
  const restored = client.warehouseSheetChange(draft, latest, recovery);
  assert.deepEqual(restored, recovery);
  assert.equal(restored.rows[0].expectedVersion, 2);
});

test("draft validation gives row-specific hierarchy and use errors while retaining inactive prior assignments", () => {
  const baseline = sheet(); const inactive = { useRef: USE, status: "INACTIVE" };
  const draft = client.sheetDraftFrom(baseline);
  assert.equal(client.validateSheetDraft(draft, baseline, [inactive]).valid, true);
  const invalidLevel = { ...client.newSheetRow("", "LEVEL", uuid(101)), name: "Nivel sin estantería", areaUseRef: SECOND_USE };
  const result = client.validateSheetDraft({ ...draft, rows: [...draft.rows, invalidLevel] }, baseline, [inactive]);
  assert.equal(result.valid, false); assert.equal(result.rows[invalidLevel.rowId].length, 2);
  const validLevel = { ...invalidLevel, parentKey: client.existingParentKey(RACK), areaUseRef: "" };
  assert.equal(client.validateSheetDraft({ ...draft, rows: [...draft.rows, validLevel] }, baseline, [inactive]).valid, true);
});

test("generator counts show the actual multiplication and never create omitted zero levels", () => {
  const counts = { ZONE: 0, AISLE: 2, RACK: 3, LEVEL: 4, BIN: 0 };
  const summary = client.sheetGenerationSummary(counts, ["WAREHOUSE_ROOT"]);
  assert.deepEqual(summary, { total: 32, byKind: { AISLE: 2, RACK: 6, LEVEL: 24 }, error: null });
  let next = 1000; const rows = client.generateSheetRows("", counts, () => uuid(next++));
  assert.equal(rows.length, 32);
  for (const [kind, quantity] of Object.entries(summary.byKind)) assert.equal(rows.filter((row) => row.kind === kind).length, quantity);
  assert.equal(rows.some((row) => ["ZONE", "BIN"].includes(row.kind)), false);
  assert.equal(client.validateSheetDraft({ name: "Recorrido", managerMembershipRef: "", rootAreaUseRef: "", rows }, undefined, []).valid, true);
  assert.ok(client.sheetGenerationSummary({ ...counts, LEVEL: 9, BIN: 4 }, ["WAREHOUSE_ROOT"]).error);
  assert.ok(client.sheetGenerationSummary({ ...client.EMPTY_GENERATION, LEVEL: 1 }, ["WAREHOUSE_ROOT"]).error);
  assert.ok(client.sheetGenerationSummary({ ...client.EMPTY_GENERATION, AISLE: 1.5 }, ["WAREHOUSE_ROOT"]).error);
  assert.deepEqual(client.generateSheetRows("", client.EMPTY_GENERATION), []);
});

test("provisional labels respect occupied sibling ordinals and leave legacy branches unlabelled", () => {
  const baseline = sheet(); const draft = client.sheetDraftFrom(baseline);
  const nextRack = { ...client.newSheetRow(client.existingParentKey(ZONE), "RACK", uuid(101)), name: "Estantería nueva" };
  const level = { ...client.newSheetRow(client.newParentKey(nextRack.rowId), "LEVEL", uuid(102)), name: "Nivel nuevo" };
  const belowLegacy = { ...client.newSheetRow(client.existingParentKey(LEGACY), "RACK", uuid(103)), name: "Sin etiqueta prevista" };
  const labels = client.provisionalSheetLabels([...draft.rows, nextRack, level, belowLegacy], baseline);
  assert.equal(labels.get(nextRack.rowId), "ALM-03-001-00-AB-0-0");
  assert.equal(labels.get(level.rowId), "ALM-03-001-00-AB-1-0");
  assert.equal(labels.get(belowLegacy.rowId), null);
  assert.equal(labels.get(draft.rows.find((row) => row.existing.locationRef === LEGACY).rowId), null);
  assert.equal(baseline.locations.find((row) => row.locationRef === RACK).address.label, "ALM-03-001-00-AA-0-0");
});
