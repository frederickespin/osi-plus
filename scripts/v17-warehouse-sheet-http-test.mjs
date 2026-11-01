import assert from "node:assert/strict";
import test from "node:test";
import { createWarehouseSheetHandler } from "../api/_lib/warehouseSheetHttp.js";
import { resolveWarehouseSheetApiMode } from "../api/_lib/warehouseSheetMode.js";

const env = { MATERIALS_INVENTORY_API_MODE: "LOCAL_ONLY", WAREHOUSE_CONFIGURATION_API_MODE: "LOCAL_ONLY", WAREHOUSE_SHEET_API_MODE: "LOCAL_ONLY" };
const reader = { effectivePermissions: ["inventory:stock:view"], deniedPermissions: [] };
const manager = { effectivePermissions: ["inventory:stock:view", "inventory:catalog:manage"], deniedPermissions: [] };
function request(patch = {}) { return { method: "GET", headers: { host: "127.0.0.1:4173" }, rawHeaders: [], socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1", encrypted: false }, ...patch }; }
function response() { const headers = new Map(); return { statusCode: 200, body: null, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, removeHeader(k) { headers.delete(k.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } }; }
async function invoke(options = {}, patch = {}) { const res = response(); await createWarehouseSheetHandler({ env, methods: ["GET", "POST"], resolveContext: async () => manager, execute: ({ context, input, method }) => ({ context, input, method }), ...options })(request(patch), res); return res; }

test("OFF stops all methods before authentication, parsing and database access", async () => {
  let calls = 0;
  for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
    const res = await invoke({ env: { MATERIALS_INVENTORY_API_MODE: "LOCAL_ONLY" }, resolveContext: () => { calls++; }, execute: () => { calls++; } }, { method, body: "invalid" });
    assert.equal(res.statusCode, 409); if (method !== "HEAD") assert.equal(res.body.error, "WAREHOUSE_SHEET_DISABLED");
  }
  assert.equal(calls, 0);
});
test("base20A and20B prerequisites are required before OPTIONS and context", async () => {
  for (const omitted of ["MATERIALS_INVENTORY_API_MODE", "WAREHOUSE_CONFIGURATION_API_MODE"]) {
    const other = { ...env }; delete other[omitted];
    const res = await invoke({ env: other, resolveContext: () => { throw new Error("must not resolve"); } }, { method: "OPTIONS" }); assert.equal(res.statusCode, 409);
  }
});
test("remote local-mode and cross-origin calls fail closed", async () => {
  assert.equal((await invoke({}, { socket: { remoteAddress: "203.0.113.4" } })).statusCode, 503);
  assert.equal((await invoke({}, { method: "POST", headers: { host: "127.0.0.1:4173", origin: "https://other.example" } })).statusCode, 403);
});
test("readers see sheets but cannot query manager identities or write", async () => {
  assert.equal((await invoke({ resolveContext: async () => reader })).statusCode, 200);
  assert.equal((await invoke({ resolveContext: async () => reader, managerOptions: true })).statusCode, 403);
  assert.equal((await invoke({ resolveContext: async () => reader }, { method: "POST", body: "malformed" })).statusCode, 403);
});
test("explicit denial wins before body parsing", async () => {
  for (const denied of manager.effectivePermissions) {
    const res = await invoke({ resolveContext: async () => ({ ...manager, deniedPermissions: [denied] }) }, { method: "POST", body: "malformed" });
    assert.equal(res.statusCode, 403); assert.equal(res.body.error, "WAREHOUSE_SHEET_FORBIDDEN");
  }
});
test("one POST returns200 and passes only the server context under private headers", async () => {
  const res = await invoke({}, { method: "POST", body: { name: "Hoja", tenantId: "untrusted" } });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.data.context, manager);
  assert.equal(res.getHeader("cache-control"), "private, no-store"); assert.equal(res.getHeader("access-control-allow-origin"), undefined); assert.match(String(res.getHeader("vary")), /Authorization/);
  const head = await invoke({}, { method: "HEAD" }); assert.equal(head.statusCode, 200); assert.equal(head.body, null);
});
test("sheet body is bounded to256KiB and no PATCH or DELETE is admitted", async () => {
  const res = await invoke({}, { method: "POST", body: { name: "x".repeat(256 * 1024) } }); assert.equal(res.statusCode, 413);
  for (const method of ["PATCH", "DELETE"]) assert.equal((await invoke({}, { method })).statusCode, 405);
  assert.equal((await invoke({}, { method: "OPTIONS" })).statusCode, 204);
});
test("Preview is exact-branch/batch only; Production and any mismatched prerequisite fail", () => {
  const preview = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview", WAREHOUSE_CONFIGURATION_API_MODE: "PREVIEW_REHEARSAL", WAREHOUSE_CONFIGURATION_API_BATCH: "V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW", WAREHOUSE_SHEET_API_MODE: "PREVIEW_REHEARSAL", WAREHOUSE_SHEET_API_BATCH: "V17-WAREHOUSE-SHEET-20C-PREVIEW", MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" };
  assert.equal(resolveWarehouseSheetApiMode(preview, request()), "PREVIEW_REHEARSAL");
  for (const patch of [{ VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { WAREHOUSE_SHEET_API_BATCH: "wrong" }, { MT01B_TENANT_SWITCH_ENABLED: "true" }, { WAREHOUSE_CONFIGURATION_API_MODE: "DISABLED" }]) assert.throws(() => resolveWarehouseSheetApiMode({ ...preview, ...patch }, request()));
});
