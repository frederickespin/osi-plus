import assert from "node:assert/strict";
import test from "node:test";
import { createWarehouseConfigurationHandler } from "../api/_lib/warehouseConfigurationHttp.js";
import { warehouseConfigurationFail } from "../api/_lib/warehouseConfigurationContract.js";

function request({ method = "GET", headers = {}, body, remoteAddress = "127.0.0.1" } = {}) { return { method, headers: { host: "127.0.0.1:4173", ...headers }, rawHeaders: [], body, socket: { localAddress: "127.0.0.1", remoteAddress, encrypted: false } }; }
function response() { const headers = new Map(); return { statusCode: 200, body: null, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, getHeader(name) { return headers.get(name.toLowerCase()); }, removeHeader(name) { headers.delete(name.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }
const env = { MATERIALS_INVENTORY_API_MODE: "LOCAL_ONLY", WAREHOUSE_CONFIGURATION_API_MODE: "LOCAL_ONLY" };
const reader = { effectivePermissions: ["inventory:stock:view"], deniedPermissions: [] };
const manager = { effectivePermissions: ["inventory:stock:view", "inventory:catalog:manage"], deniedPermissions: [] };

test("configuration OFF short-circuits before authentication, body and database", async () => {
  let calls = 0;
  for (const method of ["GET", "HEAD", "POST", "PATCH", "OPTIONS"]) {
    const handler = createWarehouseConfigurationHandler({ env: { MATERIALS_INVENTORY_API_MODE: "LOCAL_ONLY" }, methods: ["GET", "POST", "PATCH"], resolveContext: () => { calls += 1; }, execute: () => { calls += 1; } });
    const res = await invoke(handler, request({ method, body: "malformed" }));
    assert.equal(res.statusCode, 409); if (method !== "HEAD") assert.equal(res.body.error, "WAREHOUSE_CONFIGURATION_DISABLED");
    assert.equal(res.getHeader("cache-control"), "private, no-store");
  }
  assert.equal(calls, 0);
});

test("base Materials gate remains mandatory even when configuration is enabled", async () => {
  let calls = 0;
  const handler = createWarehouseConfigurationHandler({ env: { WAREHOUSE_CONFIGURATION_API_MODE: "LOCAL_ONLY" }, methods: ["GET"], resolveContext: () => { calls += 1; }, execute: () => { calls += 1; } });
  const res = await invoke(handler, request()); assert.equal(res.statusCode, 409); assert.equal(res.body.error, "MATERIALS_DISABLED"); assert.equal(calls, 0);
});

test("remote local-mode and cross-origin requests fail before authentication", async () => {
  let calls = 0;
  const handler = createWarehouseConfigurationHandler({ env, methods: ["GET", "PATCH"], resolveContext: () => { calls += 1; }, execute: () => { calls += 1; } });
  const remote = await invoke(handler, request({ remoteAddress: "203.0.113.5" })); assert.equal(remote.statusCode, 503);
  const cross = await invoke(handler, request({ method: "PATCH", headers: { origin: "https://other.example" } })); assert.equal(cross.statusCode, 403); assert.equal(calls, 0);
});

test("readers can GET and HEAD but cannot mutate without both explicit permissions", async () => {
  let executed = 0;
  const handler = createWarehouseConfigurationHandler({ env, methods: ["GET", "POST", "PATCH"], resolveContext: async () => reader, execute: ({ method }) => { executed += 1; return { method }; } });
  let res = await invoke(handler, request()); assert.equal(res.statusCode, 200); assert.equal(res.body.data.method, "GET");
  res = await invoke(handler, request({ method: "HEAD" })); assert.equal(res.statusCode, 200); assert.equal(res.body, null);
  for (const method of ["POST", "PATCH"]) { res = await invoke(handler, request({ method, body: "malformed" })); assert.equal(res.statusCode, 403); assert.equal(res.body.error, "WAREHOUSE_CONFIGURATION_FORBIDDEN"); }
  assert.equal(executed, 2);
});

test("denials and manage-only grants fail before body parsing", async () => {
  let executed = 0;
  for (const context of [{ effectivePermissions: ["inventory:catalog:manage"], deniedPermissions: [] }, { ...manager, deniedPermissions: ["inventory:stock:view"] }, { ...manager, deniedPermissions: ["inventory:catalog:manage"] }]) {
    const handler = createWarehouseConfigurationHandler({ env, methods: ["PATCH"], resolveContext: async () => context, execute: () => { executed += 1; } });
    const res = await invoke(handler, request({ method: "PATCH", body: "malformed" })); assert.equal(res.statusCode, 403); assert.equal(res.body.error, "WAREHOUSE_CONFIGURATION_FORBIDDEN");
  }
  assert.equal(executed, 0);
});

test("successful mutations preserve private headers, method and server context", async () => {
  for (const method of ["POST", "PATCH"]) {
    const handler = createWarehouseConfigurationHandler({ env, methods: [method], prismaClient: { fixture: true }, resolveContext: async (_req, options) => { assert.equal(options.prisma.fixture, true); return manager; }, execute: ({ context, input, method: actual }) => { assert.equal(context, manager); return { input, actual }; } });
    const res = await invoke(handler, request({ method, body: { name: "Área" } }));
    assert.equal(res.statusCode, method === "POST" ? 201 : 200); assert.deepEqual(res.body.data, { input: { name: "Área" }, actual: method });
    assert.equal(res.getHeader("cache-control"), "private, no-store"); assert.match(String(res.getHeader("vary")), /Authorization/); assert.match(String(res.getHeader("vary")), /Origin/); assert.equal(res.getHeader("access-control-allow-origin"), undefined);
  }
});

test("DELETE is unavailable and OPTIONS never invokes a mutation", async () => {
  let calls = 0;
  const handler = createWarehouseConfigurationHandler({ env, methods: ["PATCH"], resolveContext: () => { calls += 1; }, execute: () => { calls += 1; } });
  assert.equal((await invoke(handler, request({ method: "DELETE" }))).statusCode, 405);
  assert.equal((await invoke(handler, request({ method: "OPTIONS" }))).statusCode, 204); assert.equal(calls, 0);
});

test("domain conflict survives HTTP without leaking database details", async () => {
  const handler = createWarehouseConfigurationHandler({ env, methods: ["PATCH"], resolveContext: async () => manager, execute: () => warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE", 409) });
  const res = await invoke(handler, request({ method: "PATCH", body: { marker: true } }));
  assert.equal(res.statusCode, 409); assert.deepEqual(res.body, { ok: false, error: "WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE" });
});
