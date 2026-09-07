import assert from "node:assert/strict";
import {
  COMMUNICATIONS_PREVIEW_BATCH, COMMUNICATIONS_PREVIEW_DATABASE, COMMUNICATIONS_PREVIEW_NEON_BRANCH,
  communicationsPreviewManifest, createCommunicationsHandler, createTransportDisabledHandler, resolveCommunicationsApiMode,
} from "../api/_lib/communicationsHttp.js";
import { CommercialTenancyError } from "../api/_lib/commercialTenancyWrite.js";

function response() {
  return { statusCode: 200, headers: {}, body: null, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } };
}
const request = (method = "GET", origin) => ({ method, headers: { host: "127.0.0.1:4173", ...(origin ? { origin } : {}) }, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" }, [Symbol.asyncIterator]: async function* () { yield Buffer.from('{"attempt":"body"}'); } });
const localEnv = { COMMUNICATIONS_API_MODE: "LOCAL_ONLY" };
const syntheticUrl = ["post", "gresql://preview@", "example.invalid/", COMMUNICATIONS_PREVIEW_DATABASE, "?schema=osi"].join("");
const previewEnv = () => {
  const manifest = communicationsPreviewManifest();
  return { COMMUNICATIONS_API_MODE: "PREVIEW_REHEARSAL", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview", COMMUNICATIONS_PREVIEW_BATCH, COMMUNICATIONS_PREVIEW_MANIFEST: manifest.raw, COMMUNICATIONS_PREVIEW_MANIFEST_SHA256: manifest.sha256, COMMUNICATIONS_PREVIEW_NEON_BRANCH_ID: COMMUNICATIONS_PREVIEW_NEON_BRANCH, DATABASE_URL: syntheticUrl, DIRECT_URL: syntheticUrl, MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false", CRM_PIPELINE_RUNTIME_MODE: "PREVIEW_REHEARSAL", VITE_OSI_HUB_MODE: "PREVIEW_REHEARSAL", VITE_CRM_PIPELINE_CLIENT_MODE: "PREVIEW_REHEARSAL", VITE_CRM_PIPELINE_READ_MODE: "PREVIEW_REHEARSAL", COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE: "DISABLED", COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE: "DISABLED" };
};
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
const unauthenticated = createCommunicationsHandler({ env: localEnv, prismaClient: {}, methods: ["GET"], permission: "communications:view", resolveContext: async () => { throw new CommercialTenancyError("COMMERCIAL_AUTH_REQUIRED", 401); }, execute: async () => ({}) });
const unauthorized = response(); await unauthenticated(request(), unauthorized);
pass(unauthorized.statusCode === 401 && unauthorized.body.error === "COMMERCIAL_AUTH_REQUIRED", "error canónico de sesión conserva status y código");
const transport = response(); await createTransportDisabledHandler()(request("POST"), transport);
pass(transport.statusCode === 409 && transport.body.error === "COMMUNICATION_TRANSPORT_DISABLED", "transporte siempre desactivado");
pass(!("Access-Control-Allow-Origin" in transport.headers), "transporte sin CORS permisivo");
pass(resolveCommunicationsApiMode(previewEnv(), request()) === "PREVIEW_REHEARSAL", "Preview exacta autorizada");
for (const [name, mutate] of [
  ["branch", (env) => ({ ...env, VERCEL_GIT_COMMIT_REF: "feature/other" })],
  ["production", (env) => ({ ...env, VERCEL_ENV: "production" })],
  ["batch", (env) => ({ ...env, COMMUNICATIONS_PREVIEW_BATCH: `${COMMUNICATIONS_PREVIEW_BATCH} ` })],
  ["manifest", (env) => ({ ...env, COMMUNICATIONS_PREVIEW_MANIFEST_SHA256: "0".repeat(64) })],
  ["database", (env) => ({ ...env, DATABASE_URL: syntheticUrl.replace(COMMUNICATIONS_PREVIEW_DATABASE, "wrong_preview") })],
  ["auth-v2", (env) => ({ ...env, VITE_MT01B2_CLIENT_ENABLED: "true" })],
  ["transport", (env) => ({ ...env, COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE: "ENABLED" })],
  ["webhook", (env) => ({ ...env, COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE: "ENABLED" })],
  ["unknown", (env) => ({ ...env, COMMUNICATIONS_API_MODE: "preview_rehearsal" })],
]) {
  assert.throws(() => resolveCommunicationsApiMode(mutate(previewEnv()), request()), /COMMUNICATIONS_CONFIGURATION_INVALID/, `${name} debe fallar cerrado`); checks += 1;
}
assert.throws(() => resolveCommunicationsApiMode({ COMMUNICATIONS_API_MODE: "LOCAL_ONLY", VERCEL: "1" }, request()), /COMMUNICATIONS_CONFIGURATION_INVALID/); checks += 1;
assert.throws(() => resolveCommunicationsApiMode(localEnv, { ...request(), socket: { localAddress: "10.0.0.2", remoteAddress: "10.0.0.3" } }), /COMMUNICATIONS_CONFIGURATION_INVALID/); checks += 1;
let previewExecuted = 0;
const previewHandler = createCommunicationsHandler({ env: previewEnv(), prismaClient: { $queryRawUnsafe: async () => [{ database: COMMUNICATIONS_PREVIEW_DATABASE, branch: COMMUNICATIONS_PREVIEW_NEON_BRANCH }] }, methods: ["GET"], permission: "communications:view", resolveContext: async () => ({ effectivePermissions: ["communications:view"], deniedPermissions: [] }), execute: async () => { previewExecuted += 1; return {}; } });
const previewResponse = response(); await previewHandler(request(), previewResponse);
pass(previewResponse.statusCode === 200 && previewExecuted === 1, "identidad DB Preview revalidada antes de ejecutar");
const wrongDatabaseHandler = createCommunicationsHandler({ env: previewEnv(), prismaClient: { $queryRawUnsafe: async () => [{ database: COMMUNICATIONS_PREVIEW_DATABASE, branch: "br-wrong" }] }, methods: ["GET"], permission: "communications:view", resolveContext: async () => ({ effectivePermissions: ["communications:view"], deniedPermissions: [] }), execute: async () => { throw new Error("unexpected"); } });
const wrongDatabaseResponse = response(); await wrongDatabaseHandler(request(), wrongDatabaseResponse);
pass(wrongDatabaseResponse.statusCode === 503 && wrongDatabaseResponse.body.error === "COMMUNICATIONS_CONFIGURATION_INVALID", "branch DB real incorrecta falla cerrada");
console.log(`V17-COMMUNICATIONS-HTTP ${checks}/${checks}`);
