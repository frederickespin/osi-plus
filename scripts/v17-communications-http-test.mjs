import assert from "node:assert/strict";
import { createCommunicationsHandler, createTransportDisabledHandler } from "../api/_lib/communicationsHttp.js";

function response() {
  return { statusCode: 200, headers: {}, body: null, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } };
}
const request = (method = "GET", origin) => ({ method, headers: { host: "127.0.0.1:4173", ...(origin ? { origin } : {}) }, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" }, [Symbol.asyncIterator]: async function* () { yield Buffer.from('{"attempt":"body"}'); } });
const localEnv = { COMMUNICATIONS_API_MODE: "LOCAL_ONLY" };
let checks = 0;
const pass = (condition, message) => { assert.ok(condition, message); checks += 1; };

let auth = 0; let prisma = 0; let execute = 0;
const handler = createCommunicationsHandler({ env: { COMMUNICATIONS_API_MODE: "DISABLED" }, prismaClient: new Proxy({}, { get() { prisma += 1; } }), methods: ["POST"], permission: "communications:prepare", resolveContext: async () => { auth += 1; }, execute: async () => { execute += 1; } });
const denied = response(); await handler(request("POST"), denied);
pass(denied.statusCode === 409 && denied.body.error === "COMMUNICATIONS_DISABLED", "gate 409 estable");
pass(auth === 0 && prisma === 0 && execute === 0, "gate antes de auth/body/Prisma");
pass(denied.headers["Cache-Control"] === "private, no-store" && String(denied.headers.Vary).includes("Authorization") && String(denied.headers.Vary).includes("Origin"), "headers privados");
const external = createCommunicationsHandler({ env: localEnv, prismaClient: {}, methods: ["GET"], permission: "communications:view", resolveContext: async () => ({ effectivePermissions: ["communications:view"], deniedPermissions: [] }), execute: async () => ({}) });
const cors = response(); await external(request("GET", "https://example.invalid"), cors);
pass(cors.statusCode === 403 && !Object.keys(cors.headers).some((key) => key.toLowerCase() === "access-control-allow-origin"), "origen externo cerrado");
const denyPermission = createCommunicationsHandler({ env: localEnv, prismaClient: {}, methods: ["GET"], permission: "communications:view", resolveContext: async () => ({ effectivePermissions: ["communications:view"], deniedPermissions: ["communications:view"] }), execute: async () => ({}) });
const forbidden = response(); await denyPermission(request(), forbidden);
pass(forbidden.statusCode === 403, "deny prevalece");
const transport = response(); await createTransportDisabledHandler()(request("POST"), transport);
pass(transport.statusCode === 409 && transport.body.error === "COMMUNICATION_TRANSPORT_DISABLED", "transporte siempre desactivado");
pass(!("Access-Control-Allow-Origin" in transport.headers), "transporte sin CORS permisivo");
console.log(`V17-COMMUNICATIONS-HTTP ${checks}/${checks}`);
