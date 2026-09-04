import assert from "node:assert/strict";
import { createCrmServicesHandler } from "../api/_lib/crmServicesHttp.js";

function request({ method = "POST", headers = {}, body = { requestId: "services-http-001" }, localAddress = "127.0.0.1", remoteAddress = "127.0.0.1" } = {}) { return { method, headers: { host: "127.0.0.1:4173", ...headers }, rawHeaders: [], body, socket: { localAddress, remoteAddress, encrypted: false } }; }
function response() { const headers = new Map(); return { statusCode: 200, body: null, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, getHeader(name) { return headers.get(name.toLowerCase()); }, removeHeader(name) { headers.delete(name.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }

let authCalls = 0; let executeCalls = 0;
const disabled = createCrmServicesHandler({ env: {}, methods: ["POST"], resolveContext: async () => { authCalls += 1; }, execute: async () => { executeCalls += 1; } });
let res = await invoke(disabled, request());
assert.equal(res.statusCode, 409); assert.equal(res.body.error, "CRM_SERVICES_DISABLED"); assert.equal(authCalls, 0); assert.equal(executeCalls, 0);
res = await invoke(disabled, request({ method: "OPTIONS", body: undefined })); assert.equal(res.statusCode, 409); assert.equal(authCalls, 0);

const local = { CRM_SERVICES_API_MODE: "LOCAL_ONLY" };
const handler = createCrmServicesHandler({ env: local, methods: ["POST"], prismaClient: { marker: true }, resolveContext: async (_req, options) => { authCalls += 1; assert.equal(options.prisma.marker, true); return { tenantId: "tenant", membershipId: "membership", userId: "user" }; }, execute: async ({ input }) => { executeCalls += 1; return { accepted: input.requestId }; } });
res = await invoke(handler, request({ headers: { origin: "https://attacker.invalid", "x-forwarded-proto": "http" } })); assert.equal(res.statusCode, 403); assert.equal(authCalls, 0);
res = await invoke(handler, request({ remoteAddress: "203.0.113.8" })); assert.equal(res.statusCode, 503); assert.equal(authCalls, 0);
res = await invoke(handler, request()); assert.equal(res.statusCode, 201); assert.deepEqual(res.body, { ok: true, data: { accepted: "services-http-001" } }); assert.equal(authCalls, 1); assert.equal(executeCalls, 1);
assert.equal(res.getHeader("cache-control"), "private, no-store"); assert.match(String(res.getHeader("vary")), /Authorization/); assert.match(String(res.getHeader("vary")), /Origin/); assert.equal(res.getHeader("access-control-allow-origin"), undefined);
res = await invoke(handler, request({ method: "OPTIONS", body: undefined })); assert.equal(res.statusCode, 204); assert.equal(authCalls, 1);
res = await invoke(handler, request({ method: "GET", body: undefined })); assert.equal(res.statusCode, 405); assert.equal(authCalls, 1);
process.stdout.write(`${JSON.stringify({ ok: true, assertions: 18 }, null, 2)}\n`);
