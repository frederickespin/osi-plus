import assert from "node:assert/strict";
import { createQuoteHandler, resolveQuoteApiMode } from "../api/_lib/quoteHttp.js";

function req(method = "POST", body = { marker: true }, headers = {}) { return { method, body, headers: { host: "127.0.0.1", ...headers }, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" } }; }
function res() { return { statusCode: 0, headers: {}, payload: null, setHeader(key, value) { this.headers[key] = value; }, getHeader(key) { return this.headers[key]; }, status(value) { this.statusCode = value; return this; }, json(value) { this.payload = value; return this; }, end(value) { this.payload = value ?? null; return this; } }; }

let auth = 0; let execute = 0; let assertions = 0;
const disabled = createQuoteHandler({ env: {}, methods: ["POST"], permission: "quote:create", resolveContext: async () => { auth += 1; }, execute: async () => { execute += 1; } });
const disabledRes = res(); await disabled(req(), disabledRes); assert.equal(disabledRes.statusCode, 409); assert.equal(auth, 0); assert.equal(execute, 0); assertions += 3;
assert.equal(disabledRes.headers["Cache-Control"], "private, no-store"); assert.match(disabledRes.headers.Vary, /Authorization/); assert.match(disabledRes.headers.Vary, /Origin/); assertions += 3;
const local = createQuoteHandler({ env: { QUOTE_ENGINE_API_MODE: "LOCAL_ONLY" }, methods: ["POST"], permission: "quote:create", resolveContext: async () => { auth += 1; return { tenantId: "t", membershipId: "m", userId: "u", effectivePermissions: ["quote:create"], deniedPermissions: [] }; }, execute: async ({ input }) => { execute += 1; return input; } });
const localRes = res(); await local(req(), localRes); assert.equal(localRes.statusCode, 200); assert.deepEqual(localRes.payload.data, { marker: true }); assertions += 2;
const deny = createQuoteHandler({ env: { QUOTE_ENGINE_API_MODE: "LOCAL_ONLY" }, methods: ["GET"], permission: "quote:view", resolveContext: async () => ({ tenantId: "t", membershipId: "m", userId: "u", effectivePermissions: ["quote:view"], deniedPermissions: ["quote:view"] }), execute: async () => { execute += 1; } });
const denyRes = res(); await deny(req("GET"), denyRes); assert.equal(denyRes.statusCode, 403); assertions += 1;
const crossOrigin = res(); await local(req("POST", {}, { origin: "https://example.invalid", "x-forwarded-proto": "http" }), crossOrigin); assert.equal(crossOrigin.statusCode, 403); assertions += 1;
assert.throws(() => resolveQuoteApiMode({ QUOTE_ENGINE_API_MODE: "LOCAL_ONLY", VERCEL: "1" }, req()), /QUOTE_CONFIGURATION_INVALID/); assertions += 1;
assert.throws(() => resolveQuoteApiMode({ QUOTE_ENGINE_API_MODE: "PRODUCTION" }, req()), /QUOTE_CONFIGURATION_INVALID/); assertions += 1;
const preview = { QUOTE_ENGINE_API_MODE: "PREVIEW_REHEARSAL", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-quote", QUOTE_ENGINE_API_BATCH: "V17-QUOTE-09A-PREVIEW", MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" };
assert.equal(resolveQuoteApiMode(preview, req()), "PREVIEW_REHEARSAL"); assertions += 1;
console.log(`V17-QUOTE-09A HTTP: ${assertions}/${assertions}`);
