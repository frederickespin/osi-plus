import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({
  absWorkingDir: root,
  entryPoints: ["src/warehouses/pendingDraft.ts"],
  bundle: true, platform: "node", format: "esm", target: "node20", write: false, logLevel: "silent",
});
const source = bundled.outputFiles[0].text;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const originalFetch = globalThis.fetch;
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
  globalThis.fetch = originalFetch;
});
let instance = 0;
async function freshModule() {
  instance += 1;
  return import(`data:text/javascript;base64,${Buffer.from(`${source}\n// instance ${instance}`).toString("base64")}`);
}
function storageFixture() {
  const items = new Map();
  const calls = [];
  const storage = {
    getItem(key) { calls.push(["get", key]); return items.get(key) ?? null; },
    setItem(key, value) { calls.push(["set", key]); items.set(key, value); },
    removeItem(key) { calls.push(["remove", key]); items.delete(key); },
  };
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  return { items, calls, storage };
}
const MEMBER_A = "81111111-1111-4111-8111-111111111111";
const MEMBER_B = "82222222-2222-4222-8222-222222222222";
const REQUEST_A = "83333333-3333-4333-8333-333333333333";
const REQUEST_B = "84444444-4444-4444-8444-444444444444";
const WAREHOUSE = "85555555-5555-4555-8555-555555555555";
const LOCATION = "86666666-6666-4666-8666-666666666666";
const draft = (name = "Almacén sintético", requestId = REQUEST_A) => ({ requestId, change: { operation: "WAREHOUSE_CREATE", name } });

test("one pending intent per membership is isolated, immutable and stores only whitelisted fields", async () => {
  const { items } = storageFixture();
  const api = await freshModule();
  const first = draft(); const second = draft("Patio sintético", REQUEST_B);
  api.setPendingWarehouseDraft(MEMBER_A, first);
  api.setPendingWarehouseDraft(MEMBER_B, second);
  assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_A), first);
  assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_B), second);
  assert.equal(items.size, 2);
  const serialized = [...items.values()].map((value) => JSON.parse(value));
  for (const value of serialized) {
    assert.deepEqual(Object.keys(value).sort(), ["draft", "version"]);
    assert.equal(value.version, 1);
    assert.deepEqual(Object.keys(value.draft).sort(), ["change", "requestId"]);
    assert.deepEqual(Object.keys(value.draft.change).sort(), ["name", "operation"]);
  }
  first.change.name = "Mutación ajena";
  assert.equal(api.getPendingWarehouseDraft(MEMBER_A).change.name, "Almacén sintético");
  assert.equal(Object.isFrozen(api.getPendingWarehouseDraft(MEMBER_A)), true);
  assert.equal(Object.isFrozen(api.getPendingWarehouseDraft(MEMBER_A).change), true);
  api.setPendingWarehouseDraft(MEMBER_A, second);
  assert.equal(items.size, 2);
  assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_A), second);
});

test("fresh module rehydrates exact intent after reload without sending any request", async () => {
  const { items } = storageFixture();
  const previous = await freshModule();
  const intended = { requestId: REQUEST_A, change: { operation: "WAREHOUSE_LOCATION_CREATE", warehouseRef: WAREHOUSE, parentLocationRef: LOCATION, name: "Zona real", kind: "ZONE" } };
  previous.setPendingWarehouseDraft(MEMBER_A, intended);
  let requests = 0;
  globalThis.fetch = () => { requests += 1; throw new Error("Automatic requests are forbidden"); };
  const next = await freshModule();
  assert.deepEqual(next.getPendingWarehouseDraft(MEMBER_A), intended);
  assert.equal(next.getPendingWarehouseDraft(MEMBER_B), null);
  assert.equal(requests, 0);
  assert.equal(items.size, 1);
  globalThis.fetch = originalFetch;
});

test("all command variants survive validation with unchanged request identity and payload", async () => {
  storageFixture();
  const api = await freshModule();
  for (const change of [
    { operation: "WAREHOUSE_CREATE", name: "Almacén real" },
    { operation: "WAREHOUSE_LOCATION_CREATE", warehouseRef: WAREHOUSE, parentLocationRef: LOCATION, name: "Posición real", kind: "BIN" },
    { operation: "WAREHOUSE_UPDATE", warehouseRef: WAREHOUSE, expectedVersion: 7, name: "Nombre actualizado" },
    { operation: "WAREHOUSE_LOCATION_UPDATE", locationRef: LOCATION, expectedVersion: 2, name: "Posición actualizada" },
  ]) {
    const intended = { requestId: REQUEST_A, change };
    api.setPendingWarehouseDraft(MEMBER_A, intended);
    assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_A), intended);
    assert.deepEqual((await freshModule()).getPendingWarehouseDraft(MEMBER_A), intended);
  }
});

test("corrupt or authority-bearing storage is ignored without preserving stale memory", async () => {
  const { items } = storageFixture();
  const api = await freshModule();
  api.setPendingWarehouseDraft(MEMBER_A, draft());
  const key = [...items.keys()][0];
  for (const corrupt of [
    "{", "null", "[]", "x".repeat(4097),
    JSON.stringify({ version: 2, draft: draft() }),
    JSON.stringify({ version: 1, draft: draft(), tenantId: "injected" }),
    JSON.stringify({ version: 1, draft: { ...draft(), authorization: "Bearer injected" } }),
    JSON.stringify({ version: 1, draft: { ...draft(), change: { ...draft().change, permissions: ["inventory:catalog:manage"] } } }),
    JSON.stringify({ version: 1, draft: { ...draft(), change: { ...draft().change, code: "INJECTED" } } }),
    JSON.stringify({ version: 1, draft: { ...draft(), change: { operation: "WAREHOUSE_DELETE", name: "Borrar" } } }),
  ]) {
    items.set(key, corrupt);
    assert.equal(api.getPendingWarehouseDraft(MEMBER_A), null, corrupt.slice(0, 160));
    assert.equal((await freshModule()).getPendingWarehouseDraft(MEMBER_A), null);
  }
});

test("invalid membership, UUIDs, names, versions and structural kinds never persist", async () => {
  const { items, calls } = storageFixture();
  const api = await freshModule();
  for (const membership of ["", "tenant-a", "A1111111-1111-4111-8111-111111111111", "81111111-1111-1111-8111-111111111111", "../other"]) {
    api.setPendingWarehouseDraft(membership, draft());
    assert.equal(api.getPendingWarehouseDraft(membership), null);
    api.clearPendingWarehouseDraft(membership);
  }
  assert.equal(calls.length, 0);
  const locationCreate = { operation: "WAREHOUSE_LOCATION_CREATE", warehouseRef: WAREHOUSE, parentLocationRef: LOCATION, name: "Zona", kind: "ZONE" };
  const update = { operation: "WAREHOUSE_UPDATE", warehouseRef: WAREHOUSE, expectedVersion: 1, name: "Almacén" };
  const invalid = [
    { ...draft(), requestId: "not-a-request" },
    { ...draft(), requestId: "83333333-3333-1333-8333-333333333333" },
    ...["", " ", " Nombre", "Nombre ", "n".repeat(161)].map((name) => ({ requestId: REQUEST_A, change: { operation: "WAREHOUSE_CREATE", name } })),
    ...[0, -1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1].map((expectedVersion) => ({ requestId: REQUEST_A, change: { ...update, expectedVersion } })),
    ...["WAREHOUSE_ROOT", "CLIENT_GOODS", "", "zone"].map((kind) => ({ requestId: REQUEST_A, change: { ...locationCreate, kind } })),
    { requestId: REQUEST_A, change: { ...locationCreate, warehouseRef: "/api/other" } },
    { requestId: REQUEST_A, change: { ...locationCreate, parentLocationRef: "foreign-string" } },
    { requestId: REQUEST_A, change: { ...update, warehouseRef: "invalid" } },
    { requestId: REQUEST_A, change: { operation: "WAREHOUSE_LOCATION_UPDATE", locationRef: "invalid", expectedVersion: 1, name: "Posición" } },
    { requestId: REQUEST_A, change: { ...update, role: "A" } },
  ];
  for (const value of invalid) api.setPendingWarehouseDraft(MEMBER_A, value);
  assert.equal(items.size, 0);
  assert.equal(api.getPendingWarehouseDraft(MEMBER_A), null);
});

test("clear removes only the matching membership and remains clear after reload", async () => {
  storageFixture();
  const api = await freshModule();
  api.setPendingWarehouseDraft(MEMBER_A, draft());
  api.setPendingWarehouseDraft(MEMBER_B, draft("Otro almacén", REQUEST_B));
  api.clearPendingWarehouseDraft(MEMBER_A);
  assert.equal(api.getPendingWarehouseDraft(MEMBER_A), null);
  const reloaded = await freshModule();
  assert.equal(reloaded.getPendingWarehouseDraft(MEMBER_A), null);
  assert.equal(reloaded.getPendingWarehouseDraft(MEMBER_B).requestId, REQUEST_B);
});

test("storage getter or read failures use memory without throwing or leaking another membership", async () => {
  const { storage } = storageFixture();
  const api = await freshModule();
  api.setPendingWarehouseDraft(MEMBER_A, draft());
  storage.getItem = () => { throw new Error("Storage unavailable"); };
  assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_A), draft());
  assert.equal(api.getPendingWarehouseDraft(MEMBER_B), null);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("Storage denied"); } });
  api.setPendingWarehouseDraft(MEMBER_B, draft("Memoria", REQUEST_B));
  assert.equal(api.getPendingWarehouseDraft(MEMBER_B).requestId, REQUEST_B);
  api.clearPendingWarehouseDraft(MEMBER_B);
  assert.equal(api.getPendingWarehouseDraft(MEMBER_B), null);
  assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_A), draft());
});

test("failed writes retain latest intent and failed removal cannot resurrect stale storage", async () => {
  const { storage, items } = storageFixture();
  const api = await freshModule();
  api.setPendingWarehouseDraft(MEMBER_A, draft());
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  const latest = draft("Latest intent", REQUEST_B);
  api.setPendingWarehouseDraft(MEMBER_A, latest);
  assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_A), latest);
  assert.equal(JSON.parse([...items.values()][0]).draft.requestId, REQUEST_A);
  storage.removeItem = () => { throw new Error("Removal unavailable"); };
  api.clearPendingWarehouseDraft(MEMBER_A);
  assert.equal(api.getPendingWarehouseDraft(MEMBER_A), null);
  assert.equal(items.size, 1);
});

test("missing sessionStorage still permits explicit in-memory recovery and clear", async () => {
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: undefined });
  const api = await freshModule();
  api.setPendingWarehouseDraft(MEMBER_A, draft());
  assert.deepEqual(api.getPendingWarehouseDraft(MEMBER_A), draft());
  assert.equal(api.getPendingWarehouseDraft(MEMBER_B), null);
  api.clearPendingWarehouseDraft(MEMBER_A);
  assert.equal(api.getPendingWarehouseDraft(MEMBER_A), null);
});
