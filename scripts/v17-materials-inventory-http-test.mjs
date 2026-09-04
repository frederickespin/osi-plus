import assert from "node:assert/strict";
import { createMaterialsHandler, resolveMaterialsApiMode } from "../api/_lib/materialsInventoryHttp.js";
function request({ method = "POST", headers = {}, body = { marker: true }, localAddress = "127.0.0.1", remoteAddress = "127.0.0.1" } = {}) { return { method, headers: { host: "127.0.0.1:4173", ...headers }, rawHeaders: [], body, socket: { localAddress, remoteAddress, encrypted: false } }; }
function response() { const headers = new Map(); return { statusCode: 200, body: null, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, getHeader(name) { return headers.get(name.toLowerCase()); }, removeHeader(name) { headers.delete(name.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }
let auth = 0; let execute = 0;
const disabled = createMaterialsHandler({ env: {}, methods: ["POST"], permission: "inventory:stock:receive", resolveContext: async () => { auth += 1; }, execute: async () => { execute += 1; } });
let res = await invoke(disabled, request()); assert.equal(res.statusCode, 409); assert.equal(res.body.error, "MATERIALS_DISABLED"); assert.equal(auth, 0); assert.equal(execute, 0);
assert.throws(() => resolveMaterialsApiMode({ MATERIALS_INVENTORY_API_MODE: "local_only" }, request()), /MATERIALS_CONFIGURATION_INVALID/);
assert.throws(() => resolveMaterialsApiMode({ MATERIALS_INVENTORY_API_MODE: "LOCAL_ONLY", VERCEL: "0" }, request()), /MATERIALS_CONFIGURATION_INVALID/);
const local = createMaterialsHandler({ env: { MATERIALS_INVENTORY_API_MODE: "LOCAL_ONLY" }, methods: ["POST"], permission: "inventory:stock:receive", prismaClient: { marker: true }, resolveContext: async (_req, options) => { auth += 1; assert.equal(options.prisma.marker, true); return { effectivePermissions: ["inventory:stock:receive"], deniedPermissions: [] }; }, execute: async ({ input }) => { execute += 1; return input; } });
res = await invoke(local, request({ headers: { origin: "https://attacker.invalid", "x-forwarded-proto": "http" } })); assert.equal(res.statusCode, 403); assert.equal(auth, 0);
res = await invoke(local, request({ remoteAddress: "203.0.113.20" })); assert.equal(res.statusCode, 503); assert.equal(auth, 0);
res = await invoke(local, request()); assert.equal(res.statusCode, 201); assert.deepEqual(res.body, { ok: true, data: { marker: true } }); assert.equal(auth, 1); assert.equal(execute, 1); assert.equal(res.getHeader("cache-control"), "private, no-store"); assert.match(String(res.getHeader("vary")), /Authorization/); assert.match(String(res.getHeader("vary")), /Origin/); assert.equal(res.getHeader("access-control-allow-origin"), undefined);
res = await invoke(local, request({ method: "OPTIONS", body: undefined })); assert.equal(res.statusCode, 204); assert.equal(auth, 1);
process.stdout.write(JSON.stringify({ ok: true, assertions: 20, productionApiEnabled: false }) + "\n");
