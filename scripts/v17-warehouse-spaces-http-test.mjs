import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { createMaterialsHandler } from "../api/_lib/materialsInventoryHttp.js";
import { createWarehouse, createWarehouseLocation, updateWarehouse, updateWarehouseLocation } from "../api/_lib/materialsInventoryDomain.js";

function request({ method = "POST", headers = {}, body = {}, query = {} } = {}) { return { method, headers: { host: "127.0.0.1:4173", ...headers }, query, rawHeaders: [], body, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1", encrypted: false } }; }
function response() { const headers = new Map(); return { statusCode: 200, body: null, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, getHeader(name) { return headers.get(name.toLowerCase()); }, removeHeader(name) { headers.delete(name.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }
function handler({ context, execute, methods = ["POST"], env = { MATERIALS_INVENTORY_API_MODE: "LOCAL_ONLY" }, resolveContext } = {}) {
  return createMaterialsHandler({ env, methods, permission: "inventory:stock:view", prismaClient: { $transaction: () => { throw new Error("DATABASE_MUST_NOT_BE_REACHED"); } }, resolveContext: resolveContext ?? (async () => context), execute });
}
const allowed = { effectivePermissions: ["inventory:stock:view", "inventory:catalog:manage"], deniedPermissions: [] };

test("warehouse mutations gate before authentication and body", async () => {
  let calls = 0;
  const res = await invoke(handler({ env: {}, resolveContext: async () => { calls += 1; }, execute: () => { calls += 1; } }), request({ body: "broken" }));
  assert.equal(res.statusCode, 409); assert.equal(res.body.error, "MATERIALS_DISABLED"); assert.equal(calls, 0);
});

test("cross-origin warehouse writes are denied before authentication", async () => {
  let calls = 0;
  const res = await invoke(handler({ resolveContext: async () => { calls += 1; }, execute: () => { calls += 1; } }), request({ headers: { origin: "https://other.example" } }));
  assert.equal(res.statusCode, 403); assert.equal(res.body.error, "MATERIALS_ORIGIN_FORBIDDEN"); assert.equal(calls, 0);
});

test("stock reader and manager are both required, explicit denial wins", async () => {
  for (const execute of [({ context, input, prisma }) => createWarehouse(prisma, context, input), ({ context, input, prisma }) => createWarehouseLocation(prisma, context, input), ({ context, input, prisma }) => updateWarehouse(prisma, context, crypto.randomUUID(), input), ({ context, input, prisma }) => updateWarehouseLocation(prisma, context, crypto.randomUUID(), input)]) {
    for (const context of [{ effectivePermissions: [], deniedPermissions: [] }, { effectivePermissions: ["inventory:stock:view"], deniedPermissions: [] }, { effectivePermissions: ["inventory:catalog:manage"], deniedPermissions: [] }, { ...allowed, deniedPermissions: ["inventory:stock:view"] }, { ...allowed, deniedPermissions: ["inventory:catalog:manage"] }]) {
      const res = await invoke(handler({ context, execute }), request({ body: { invalid: true } }));
      assert.equal(res.statusCode, 403); assert.equal(res.body.error, "MATERIALS_FORBIDDEN");
    }
  }
});

test("warehouse handlers preserve private headers and successful POST/PATCH status", async () => {
  for (const method of ["POST", "PATCH"]) {
    const res = await invoke(handler({ context: allowed, methods: [method], execute: ({ input, method: actual }) => ({ name: input.name, method: actual }) }), request({ method, body: { name: "Principal" } }));
    assert.equal(res.statusCode, method === "POST" ? 201 : 200); assert.deepEqual(res.body.data, { name: "Principal", method });
    assert.equal(res.getHeader("cache-control"), "private, no-store"); assert.match(String(res.getHeader("vary")), /Authorization/); assert.match(String(res.getHeader("vary")), /Origin/); assert.equal(res.getHeader("access-control-allow-origin"), undefined);
  }
});

test("unsupported verbs cannot reach mutation callback", async () => {
  let calls = 0;
  const res = await invoke(handler({ context: allowed, methods: ["PATCH"], execute: () => { calls += 1; } }), request({ method: "DELETE" }));
  assert.equal(res.statusCode, 405); assert.equal(calls, 0);
});

test("automatic POST rejects code injection before any database access", async () => {
  const requestId = crypto.randomUUID(); const payload = { name: "Principal", tenantId: "other-tenant" };
  const res = await invoke(handler({ context: allowed, execute: ({ context, input, prisma }) => createWarehouse(prisma, context, input) }), request({ body: { requestId, payloadHash: canonicalPayloadHash({ operation: "WAREHOUSE_CREATE", requestId, ...payload }), ...payload } }));
  assert.equal(res.statusCode, 400); assert.equal(res.body.error, "MATERIALS_INPUT_INVALID");
});
