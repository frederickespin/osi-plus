import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAdminFleetCollectionHandler, createAdminFleetDetailHandler } from "../api/_lib/adminFleetHttp.js";
import { assertAdminFleetDatabase, requireAdminFleetAccess, requireAdminFleetContext } from "../api/_lib/adminFleetAccess.js";
import { AdminFleetError } from "../api/_lib/adminFleetContract.js";
import { AdminMembershipError } from "../api/_lib/adminMembershipDomain.js";
import { ADMIN_FLEET_BATCH } from "../shared/adminFleet.js";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH } from "../shared/adminMembershipPreview.js";

const results = [];
const check = (name, value) => { assert.ok(value, name); results.push({ name, passed: true }); };
const localEnv = { ADMIN_FLEET_MODE: "LOCAL_ONLY", ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY" };
const context = { tenantId: "synthetic-tenant", userId: "synthetic-user", membershipId: "synthetic-member", role: "A", effectivePermissions: ["fleet:view", "fleet:edit"] };
const vehicleRef = "synthetic-legacy-cuid";
const vehicle = { vehicleRef, businessCode: "TR-1", vehicleType: "TRUCK", rowVersion: 1 };
const dependencies = { env: localEnv, prisma: {}, resolveContext: async () => context, checkDatabase: async () => {} };
const previewEnv = {
  ADMIN_FLEET_MODE: "PREVIEW_REHEARSAL", ADMIN_FLEET_BATCH,
  ADMIN_TENANT_MEMBERSHIP_MODE: "PREVIEW_REHEARSAL", ADMIN_MEMBERSHIP_PREVIEW_BATCH,
  ADMIN_MEMBERSHIP_PREVIEW_DATABASE: "v17_consolidated_preview_10b", ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: "br-mute-credit-ahxnvfx0", ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: "V17-CONSOLIDATED-PREVIEW-10B",
  // Destination-only fixture. Prisma is injected; this never connects to a database.
  DATABASE_URL: "postgresql://example.invalid/v17_consolidated_preview_10b?schema=osi",
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-administration-fleet-19d",
  MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false",
};
const previewContext = { ...context, tenantCode: "V17-CONSOLIDATED-PREVIEW-10B", tenant: { code: "V17-CONSOLIDATED-PREVIEW-10B" }, tenantStatus: "ACTIVE", userStatus: "ACTIVE", membershipStatus: "ACTIVE", sessionKind: "LEGACY" };
function request({ method = "GET", url = "/api/admin/fleet/vehicles", query, body, bodyGetter, origin = "http://localhost:5173", headers = {}, remoteAddress = "127.0.0.1" } = {}) {
  const req = { method, url, query, headers: { host: "localhost:5173", origin, "x-forwarded-proto": "http", ...headers }, socket: { localAddress: "127.0.0.1", remoteAddress } };
  if (bodyGetter) Object.defineProperty(req, "body", { get: bodyGetter }); else req.body = body;
  return req;
}
function response() {
  const headers = new Map();
  return { headers, statusCode: 200, body: undefined,
    setHeader(key, value) { headers.set(key.toLowerCase(), value); }, getHeader(key) { return headers.get(key.toLowerCase()); }, removeHeader(key) { headers.delete(key.toLowerCase()); },
    status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, end(value) { this.body = value; return this; } };
}
async function invoke(handler, options) { const res = response(); await handler(request(options), res); return res; }
function isPrivate(res) {
  const vary = String(res.getHeader("vary")).toLowerCase();
  return res.getHeader("cache-control") === "private, no-store" && vary.includes("authorization") && vary.includes("origin")
    && res.getHeader("x-content-type-options") === "nosniff" && res.getHeader("referrer-policy") === "no-referrer"
    && !res.getHeader("access-control-allow-origin") && !res.getHeader("access-control-allow-credentials") && !res.getHeader("set-cookie");
}
for (const factory of [createAdminFleetCollectionHandler, createAdminFleetDetailHandler]) {
  let reached = 0;
  const forbidden = async () => { reached += 1; throw new Error("unreachable"); };
  const handler = factory({ env: {}, prisma: {}, checkDatabase: forbidden, resolveContext: forbidden, list: forbidden, get: forbidden, create: forbidden, update: forbidden });
  const res = await invoke(handler, { method: "POST", bodyGetter: () => { reached += 1; throw new Error("body read"); } });
  check(`${factory.name} disabled before database/auth/body`, res.statusCode === 409 && res.body.error === "ADMIN_FLEET_DISABLED" && reached === 0 && isPrivate(res));
  const head = await invoke(handler, { method: "HEAD" });
  check(`${factory.name} disabled HEAD is empty and private`, head.statusCode === 409 && head.body === undefined && isPrivate(head));
}
for (const [name, overrides] of [
  ["production", { VERCEL_ENV: "production" }], ["unknown branch", { VERCEL_GIT_COMMIT_REF: "main" }], ["legacy identity branch", { VERCEL_GIT_COMMIT_REF: "feature/v17-administration-identity-19c" }],
  ["wrong own batch", { ADMIN_FLEET_BATCH: "other" }], ["missing own batch", { ADMIN_FLEET_BATCH: undefined }], ["wrong membership batch", { ADMIN_MEMBERSHIP_PREVIEW_BATCH: "other" }],
  ["wrong database configuration", { ADMIN_MEMBERSHIP_PREVIEW_DATABASE: "other" }], ["wrong Neon branch configuration", { ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: "br-other" }],
  ["wrong company configuration", { ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: "OTHER" }], ["wrong URL database", { DATABASE_URL: "postgresql://example.invalid/other?schema=osi" }],
  ["missing schema", { DATABASE_URL: "postgresql://example.invalid/v17_consolidated_preview_10b" }],
  ["duplicate schema", { DATABASE_URL: "postgresql://example.invalid/v17_consolidated_preview_10b?schema=osi&schema=osi" }],
  ["fragment", { DATABASE_URL: "postgresql://example.invalid/v17_consolidated_preview_10b?schema=osi#ignored" }],
  ["non-Postgres URL", { DATABASE_URL: "https://example.invalid/v17_consolidated_preview_10b?schema=osi" }],
  ["alternate auth", { MT01B_AUTH_MODE: "MEMBERSHIP_ONLY" }], ["tenant switch", { MT01B_TENANT_SWITCH_ENABLED: "true" }], ["new auth client", { VITE_MT01B2_CLIENT_ENABLED: "true" }],
]) {
  assert.throws(() => requireAdminFleetAccess(request(), { ...previewEnv, ...overrides }), (error) => error.code === "ADMIN_FLEET_CONFIGURATION_INVALID" && error.status === 503);
  results.push({ name: `Preview refuses ${name}`, passed: true });
}
for (const branch of ["feature/v17-administration-fleet-19d", "feature/v17-consolidated-preview"]) check(`only intended branch ${branch} allowed`, requireAdminFleetAccess(request(), { ...previewEnv, VERCEL_GIT_COMMIT_REF: branch }) === "PREVIEW_REHEARSAL");
for (const [name, env, req] of [
  ["unknown mode", { ...localEnv, ADMIN_FLEET_MODE: "TRUE" }, request()], ["missing membership local gate", { ADMIN_FLEET_MODE: "LOCAL_ONLY" }, request()],
  ["Vercel local bypass", { ...localEnv, VERCEL: "0" }, request()], ["Vercel marker even empty", { ...localEnv, VERCEL_ENV: "" }, request()],
  ["spoofed localhost host", localEnv, request({ remoteAddress: "203.0.113.10" })],
]) {
  assert.throws(() => requireAdminFleetAccess(req, env), (error) => error.status === 503);
  results.push({ name: `LOCAL_ONLY refuses ${name}`, passed: true });
}
const databaseIdentity = { database: "v17_consolidated_preview_10b", branch: "br-mute-credit-ahxnvfx0", schema_exists: true, vehicles_exists: true, audit_exists: true };
await assertAdminFleetDatabase({ $queryRaw: async () => [databaseIdentity] }, "PREVIEW_REHEARSAL", previewEnv);
results.push({ name: "Preview validates actual database identity and required tables", passed: true });
for (const overrides of [{ database: "other" }, { branch: "br-other" }, { schema_exists: false }, { vehicles_exists: false }, { audit_exists: false }]) {
  await assert.rejects(() => assertAdminFleetDatabase({ $queryRaw: async () => [{ ...databaseIdentity, ...overrides }] }, "PREVIEW_REHEARSAL", previewEnv), (error) => error.status === 503);
  results.push({ name: `database refuses mismatched ${Object.keys(overrides)[0]}`, passed: true });
}
requireAdminFleetContext(previewEnv, "PREVIEW_REHEARSAL", previewContext);
for (const permission of ["fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize"]) {
  const operationsContext = { ...previewContext, role: "B", effectivePermissions: ["fleet:view", permission], grantedPermissions: ["fleet:view", permission] };
  requireAdminFleetContext(previewEnv, "PREVIEW_REHEARSAL", operationsContext);
  check(`Preview accepts designated operations with ${permission}`, true);
  for (const change of [{ deniedPermissions: [permission] }, { deniedPermissions: ["fleet:view"] }, { grantedPermissions: ["fleet:view"] }]) {
    assert.throws(() => requireAdminFleetContext(previewEnv, "PREVIEW_REHEARSAL", { ...operationsContext, ...change }), (error) => error.code === "ADMIN_FLEET_FORBIDDEN");
    check(`Preview rejects ${Object.keys(change)[0]} for ${permission}`, true);
  }
}
assert.throws(() => requireAdminFleetContext(previewEnv, "PREVIEW_REHEARSAL", { ...previewContext, role: "B" }), (error) => error.code === "ADMIN_FLEET_FORBIDDEN");
check("Preview does not broaden fleet access to undesignated operations", true);
for (const overrides of [{ tenantCode: "OTHER" }, { tenant: { code: "OTHER" } }, { role: "V" }, { userStatus: "INACTIVE" }, { membershipStatus: "SUSPENDED" }, { tenantStatus: "SUSPENDED" }, { sessionKind: "MEMBERSHIP" }]) {
  assert.throws(() => requireAdminFleetContext(previewEnv, "PREVIEW_REHEARSAL", { ...previewContext, ...overrides }), (error) => error.code === "ADMIN_FLEET_FORBIDDEN");
  results.push({ name: `Preview context refuses ${Object.keys(overrides)[0]}`, passed: true });
}
let listQuery; let creates = 0; let updates = 0;
const collection = createAdminFleetCollectionHandler({ ...dependencies,
  list: async (_db, ctx, query) => { assert.equal(ctx, context); listQuery = query; return { data: [vehicle], total: 1, page: 1, pageSize: 20 }; },
  create: async (_db, ctx) => { assert.equal(ctx, context); creates += 1; return { vehicle, created: creates === 1, idempotent: creates !== 1 }; },
});
const listed = await invoke(collection, { url: "/api/admin/fleet/vehicles?search=TR&operationalStatus=AVAILABLE&vehicleType=TRUCK&page=1&pageSize=20" });
check("list passes bounded query keys with trusted context", listed.statusCode === 200 && listed.body.data[0].vehicleRef === vehicleRef && listQuery.search === "TR" && isPrivate(listed));
for (const url of ["/api/admin/fleet/vehicles?tenantId=other", "/api/admin/fleet/vehicles?page=1&page=2"]) check("list rejects unknown or repeated query keys", (await invoke(collection, { url })).statusCode === 400);
const head = await invoke(collection, { method: "HEAD" });
check("list HEAD preserves response privacy without a body", head.statusCode === 200 && head.body === undefined && isPrivate(head));
const jsonHeaders = { "content-type": "application/json" };
const body = { requestId: randomUUID(), businessCode: "TR-1", vehicleType: "TRUCK" };
check("create returns201 for a new vehicle", (await invoke(collection, { method: "POST", headers: jsonHeaders, body })).statusCode === 201);
const replay = await invoke(collection, { method: "POST", headers: jsonHeaders, body });
check("create replay returns200 and idempotent flag", replay.statusCode === 200 && replay.body.idempotent === true && isPrivate(replay));
const detail = createAdminFleetDetailHandler({ ...dependencies, get: async (_db, _ctx, ref) => { assert.equal(ref, vehicleRef); return vehicle; }, update: async (_db, _ctx, ref) => { assert.equal(ref, vehicleRef); updates += 1; return { ...vehicle, rowVersion: 2 }; } });
check("detail uses opaque path reference", (await invoke(detail, { query: { vehicleRef } })).body.vehicle.vehicleRef === vehicleRef);
const patch = { requestId: randomUUID(), expectedVersion: 1, changes: { brand: "Synthetic" } };
const updated = await invoke(detail, { method: "PATCH", query: { vehicleRef }, headers: jsonHeaders, body: patch });
check("PATCH returns the updated DTO privately", updated.statusCode === 200 && updated.body.vehicle.rowVersion === 2 && updates === 1 && isPrivate(updated));
for (const [name, options, status] of [
  ["external origin", { origin: "https://untrusted.invalid" }, 403], ["ambiguous origin", { headers: { ...jsonHeaders, origin: ["http://localhost:5173"] } }, 403],
  ["non-JSON type", { headers: { "content-type": "text/plain" } }, 415], ["malformed JSON", { body: "{" }, 400],
  ["array body", { body: [] }, 400], ["empty object", { body: {} }, 400], ["oversized body", { body: { value: "x".repeat(16384) } }, 413],
  ["authority in query", { url: "/api/admin/fleet/vehicles/id?tenantId=other" }, 400],
]) {
  const before = updates;
  const res = await invoke(detail, { method: "PATCH", query: { vehicleRef }, headers: jsonHeaders, body: patch, ...options });
  check(`PATCH rejects ${name} before mutation`, res.statusCode === status && updates === before && isPrivate(res));
}
for (const method of ["OPTIONS", "DELETE", "PUT", "POST"]) {
  const res = await invoke(detail, { method });
  check(`detail disallows ${method}`, res.statusCode === 405 && res.getHeader("allow") === "GET, HEAD, PATCH" && isPrivate(res));
}
let bodyReads = 0;
const denied = createAdminFleetDetailHandler({ ...dependencies, resolveContext: async () => { throw new AdminMembershipError("ADMIN_MEMBERSHIP_FORBIDDEN", 403); } });
const unauthorized = await invoke(denied, { method: "PATCH", bodyGetter: () => { bodyReads += 1; return patch; } });
check("auth failure precedes reading a mutation body", unauthorized.statusCode === 403 && unauthorized.body.error === "ADMIN_FLEET_FORBIDDEN" && bodyReads === 0 && isPrivate(unauthorized));
const broken = createAdminFleetDetailHandler({ ...dependencies, get: async () => { throw new Error("private database details"); } });
const unavailable = await invoke(broken, { query: { vehicleRef } });
check("unexpected failures are sanitized", unavailable.statusCode === 503 && unavailable.body.error === "ADMIN_FLEET_UNAVAILABLE" && !JSON.stringify(unavailable.body).includes("private database") && isPrivate(unavailable));
const conflict = createAdminFleetDetailHandler({ ...dependencies, update: async () => { throw new AdminFleetError("ADMIN_FLEET_VERSION_CONFLICT", 409); } });
check("version conflict preserves safe code/status", (await invoke(conflict, { method: "PATCH", query: { vehicleRef }, headers: jsonHeaders, body: patch })).body.error === "ADMIN_FLEET_VERSION_CONFLICT");
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
