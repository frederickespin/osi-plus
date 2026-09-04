import assert from "node:assert/strict";
import { createToolsEquipmentHandler, resolveToolsEquipmentApiMode } from "../api/_lib/toolsEquipmentHttp.js";

function request({ method = "POST", headers = {}, body = { marker: true }, localAddress = "127.0.0.1", remoteAddress = "127.0.0.1" } = {}) { return { method, headers: { host: "127.0.0.1:4173", ...headers }, rawHeaders: [], body, socket: { localAddress, remoteAddress, encrypted: false } }; }
function response() { const headers = new Map(); return { statusCode: 200, body: null, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, getHeader(name) { return headers.get(name.toLowerCase()); }, removeHeader(name) { headers.delete(name.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }

let auth = 0; let execute = 0;
const disabled = createToolsEquipmentHandler({ env: {}, methods: ["POST"], permissions: "assets:instance:manage", resolveContext: async () => { auth += 1; }, execute: async () => { execute += 1; } });
let res = await invoke(disabled, request()); assert.equal(res.statusCode, 409); assert.equal(res.body.error, "ASSET_API_DISABLED"); assert.equal(auth, 0); assert.equal(execute, 0);
assert.throws(() => resolveToolsEquipmentApiMode({ TOOLS_EQUIPMENT_API_MODE: "local_only" }, request()), /ASSET_CONFIGURATION_INVALID/);
assert.throws(() => resolveToolsEquipmentApiMode({ TOOLS_EQUIPMENT_API_MODE: "LOCAL_ONLY", VERCEL: "0" }, request()), /ASSET_CONFIGURATION_INVALID/);

const local = createToolsEquipmentHandler({ env: { TOOLS_EQUIPMENT_API_MODE: "LOCAL_ONLY" }, methods: ["POST"], permissions: "assets:instance:manage", prismaClient: { marker: true }, resolveContext: async (_req, options) => { auth += 1; assert.equal(options.prisma.marker, true); return { tenantId: "tenant", membershipId: "membership", userId: "user", effectivePermissions: ["assets:instance:manage"], deniedPermissions: [] }; }, execute: async ({ input }) => { execute += 1; return input; } });
res = await invoke(local, request({ headers: { origin: "https://attacker.invalid", "x-forwarded-proto": "http" } })); assert.equal(res.statusCode, 403); assert.equal(auth, 0);
res = await invoke(local, request({ remoteAddress: "203.0.113.20" })); assert.equal(res.statusCode, 503); assert.equal(auth, 0);
res = await invoke(local, request()); assert.equal(res.statusCode, 201); assert.deepEqual(res.body, { ok: true, data: { marker: true } }); assert.equal(auth, 1); assert.equal(execute, 1); assert.equal(res.getHeader("cache-control"), "private, no-store"); assert.match(String(res.getHeader("vary")), /Authorization/); assert.match(String(res.getHeader("vary")), /Origin/); assert.equal(res.getHeader("access-control-allow-origin"), undefined);

const denied = createToolsEquipmentHandler({ env: { TOOLS_EQUIPMENT_API_MODE: "LOCAL_ONLY" }, methods: ["GET"], permissions: "assets:instance:view", resolveContext: async () => ({ tenantId: "tenant", membershipId: "membership", userId: "user", effectivePermissions: ["assets:instance:view"], deniedPermissions: ["assets:instance:view"] }), execute: async () => { execute += 1; } });
res = await invoke(denied, request({ method: "GET", body: undefined })); assert.equal(res.statusCode, 403); assert.equal(execute, 1);
res = await invoke(local, request({ method: "OPTIONS", body: undefined })); assert.equal(res.statusCode, 204); assert.equal(auth, 1);
process.stdout.write(JSON.stringify({ ok: true, assertions: 22, gateBeforeAuthBodyPrisma: true, productionApiEnabled: false }) + "\n");
