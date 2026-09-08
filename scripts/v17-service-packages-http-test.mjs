import assert from "node:assert/strict";
import { createCrmServicesHandler } from "../api/_lib/crmServicesHttp.js";

function response() { return { statusCode: 200, headers: {}, body: null, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, getHeader(name) { return this.headers[name.toLowerCase()]; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, end(value) { this.body = value ?? null; return this; } }; }
let authCalls = 0; let executeCalls = 0; let bodyReads = 0;
const handler = createCrmServicesHandler({ env: {}, methods: ["POST"], prismaClient: new Proxy({}, { get() { throw new Error("Prisma must not be reached"); } }), resolveContext: async () => { authCalls += 1; }, execute: async () => { executeCalls += 1; } });
const req = { method: "POST", headers: {}, on() { bodyReads += 1; }, socket: { encrypted: false } }; const res = response(); await handler(req, res);
assert.equal(res.statusCode, 409); assert.equal(res.body.error, "CRM_SERVICES_DISABLED"); assert.equal(authCalls, 0); assert.equal(executeCalls, 0); assert.equal(bodyReads, 0); assert.equal(res.getHeader("cache-control"), "private, no-store"); assert.match(res.getHeader("vary"), /Authorization/); assert.match(res.getHeader("vary"), /Origin/); assert.equal(res.getHeader("access-control-allow-origin"), undefined); assert.equal(res.getHeader("set-cookie"), undefined);
process.stdout.write(`${JSON.stringify({ ok: true, disabledBefore: ["auth", "body", "prisma"], status: 409, cors: "private" })}\n`);
