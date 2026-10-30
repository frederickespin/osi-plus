import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createAdminUserIdentityCollectionHandler, createAdminUserIdentityDetailHandler, createAdminUserIdentityPhotoHandler,
  createAdminUserEnrollmentCollectionHandler, createAdminUserEnrollmentDetailHandler, createAdminUserEnrollmentActivationHandler,
} from "../api/_lib/adminUserIdentityHttp.js";
import { assertUserIdentityDatabase, requireUserIdentityAccess } from "../api/_lib/adminUserIdentityAccess.js";
import { AdminMembershipError } from "../api/_lib/adminMembershipDomain.js";
import { AdminUserIdentityError } from "../api/_lib/adminUserIdentityContract.js";
import { ADMIN_USER_IDENTITY_BATCH } from "../shared/adminUserIdentity.js";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH } from "../shared/adminMembershipPreview.js";
import { syntheticPng } from "./fixtures/v17-user-identity-photo.mjs";

const results = [];
const check = (name, condition) => { assert.ok(condition, name); results.push({ name, passed: true }); };
const localEnv = { ADMIN_USER_IDENTITY_MODE: "LOCAL_ONLY", ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY" };
const membershipRef = randomUUID(); const enrollmentRef = randomUUID();
const context = { tenantId: "synthetic-tenant", membershipId: "synthetic-actor", userId: "synthetic-user", role: "A" };
const identity = { membershipRef, version: 1, name: "Persona Sintética", email: "person@example.invalid", phone: "+18095550123", documentType: "CEDULA", documentNumber: "00000000001", hasPhoto: false, photoVersion: 0, canEdit: true };
const enrollment = { enrollmentRef, name: "Persona Sintética", email: "new@example.invalid", role: "V", status: "PENDING", createdAt: "2026-10-30T00:00:00Z", expiresAt: "2026-10-31T00:00:00Z" };
const localDependencies = { env: localEnv, prisma: {}, resolveContext: async () => context, checkDatabase: async () => {} };
function request({ method = "GET", url = "/api/admin/user-identities", query, body, origin = "http://localhost:5173", headers = {}, bodyGetter, remoteAddress = "127.0.0.1" } = {}) {
  const req = { method, url, query, socket: { localAddress: "127.0.0.1", remoteAddress }, headers: { host: "localhost:5173", origin, "x-forwarded-proto": "http", ...headers } };
  if (bodyGetter) Object.defineProperty(req, "body", { get: bodyGetter }); else req.body = body;
  return req;
}
function response() {
  const headers = new Map();
  return { statusCode: 200, body: undefined, headers,
    setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, removeHeader(k) { headers.delete(k.toLowerCase()); },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end(body) { this.body = body; return this; } };
}
async function invoke(handler, options) { const res = response(); await handler(request(options), res); return res; }
function isPrivate(res) {
  const vary = String(res.getHeader("vary") || "").toLowerCase();
  return res.getHeader("cache-control") === "private, no-store" && vary.includes("authorization") && vary.includes("origin")
    && res.getHeader("x-content-type-options") === "nosniff" && res.getHeader("referrer-policy") === "no-referrer"
    && !res.getHeader("access-control-allow-origin") && !res.getHeader("access-control-allow-credentials") && !res.getHeader("set-cookie");
}
const jsonHeaders = { "content-type": "application/json" };
const previewEnv = {
  ADMIN_USER_IDENTITY_MODE: "PREVIEW_REHEARSAL", ADMIN_USER_IDENTITY_BATCH,
  ADMIN_TENANT_MEMBERSHIP_MODE: "PREVIEW_REHEARSAL", ADMIN_MEMBERSHIP_PREVIEW_BATCH,
  ADMIN_MEMBERSHIP_PREVIEW_DATABASE: "identity_test_preview", ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: "br-synthetic-only", ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: "SYNTHETIC-19C",
  // Destination-only fixture: this suite injects Prisma and never connects.
  DATABASE_URL: "postgresql://example.invalid/identity_test_preview?schema=osi",
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-administration-identity-19c",
  MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false",
};

for (const [name, factory] of [
  ["directory", createAdminUserIdentityCollectionHandler], ["identity", createAdminUserIdentityDetailHandler], ["photo", createAdminUserIdentityPhotoHandler],
  ["enrollment collection", createAdminUserEnrollmentCollectionHandler], ["enrollment detail", createAdminUserEnrollmentDetailHandler], ["public activation", createAdminUserEnrollmentActivationHandler],
]) {
  let reached = 0;
  const forbidden = async () => { reached += 1; throw new Error("must not be reached"); };
  const handler = factory({ env: { ADMIN_USER_IDENTITY_MODE: "DISABLED" }, prisma: {}, resolveContext: forbidden, checkDatabase: forbidden, list: forbidden, get: forbidden, update: forbidden, issue: forbidden, revoke: forbidden, resolve: forbidden, activate: forbidden });
  const res = await invoke(handler, { method: "POST", bodyGetter: () => { reached += 1; throw new Error("body read while disabled"); } });
  check(`${name} gate blocks before body/auth/database`, res.statusCode === 409 && res.body?.error === "ADMIN_USER_IDENTITY_DISABLED" && reached === 0 && isPrivate(res));
  const head = await invoke(handler, { method: "HEAD" });
  check(`${name} disabled HEAD has no body`, head.statusCode === 409 && head.body === undefined && isPrivate(head));
}
for (const [name, env, req] of [
  ["unknown mode", { ...localEnv, ADMIN_USER_IDENTITY_MODE: "TRUE" }, request()],
  ["production mode", { ...previewEnv, VERCEL_ENV: "production" }, request()],
  ["missing batch", { ...previewEnv, ADMIN_USER_IDENTITY_BATCH: undefined }, request()],
  ["wrong batch", { ...previewEnv, ADMIN_USER_IDENTITY_BATCH: "other" }, request()],
  ["wrong branch", { ...previewEnv, VERCEL_GIT_COMMIT_REF: "main" }, request()],
  ["wrong DB", { ...previewEnv, DATABASE_URL: "postgresql://example.invalid/other?schema=osi" }, request()],
  ["missing memberships mode", { ADMIN_USER_IDENTITY_MODE: "LOCAL_ONLY" }, request()],
  ["local mode in Vercel", { ...localEnv, VERCEL: "1" }, request()],
  ["fake loopback host on a remote connection", localEnv, request({ remoteAddress: "203.0.113.10" })],
]) {
  assert.throws(() => requireUserIdentityAccess(req, env), (error) => error.status === 503, name);
  results.push({ name: `configuration rejects ${name}`, passed: true });
}
check("exact Preview configuration allowed", requireUserIdentityAccess(request(), previewEnv) === "PREVIEW_REHEARSAL");
await assert.rejects(() => assertUserIdentityDatabase({ $queryRaw: async () => [{ identities_exists: true, enrollments_exists: false }] }, "LOCAL_ONLY", localEnv), (error) => error.code === "ADMIN_USER_IDENTITY_SCHEMA_UNAVAILABLE");
results.push({ name: "missing enrollment table fails before serving identity", passed: true });

let seenFilter; let seenRefs; let mutations = 0;
const collection = createAdminUserIdentityCollectionHandler({ ...localDependencies, list: async (_db, ctx, query) => { assert.equal(ctx, context); seenFilter = query; return { data: [{ membershipRef, name: identity.name }], total: 1, page: 1, pageSize: 20, identities: [] }; }, summaries: async (_db, _ctx, refs) => { seenRefs = refs; return [{ membershipRef, name: identity.name, hasPhoto: true }]; } });
const directory = await invoke(collection, { url: "/api/admin/user-identities?search=Persona&role=V&page=1" });
check("directory passes filters and trusted context", directory.statusCode === 200 && seenFilter.search === "Persona" && seenFilter.role === "V" && isPrivate(directory));
check("summary supports explicit public refs", (await invoke(collection, { url: `/api/admin/user-identities?refs=${membershipRef}` })).statusCode === 200 && seenRefs[0] === membershipRef);
for (const url of ["/api/admin/user-identities?tenantId=other", "/api/admin/user-identities?role=V&role=A", `/api/admin/user-identities?refs=${membershipRef}&search=x`]) check("ambiguous or authority query rejected", (await invoke(collection, { url })).statusCode === 400);
check("directory HEAD has no body", (await invoke(collection, { method: "HEAD" })).body === undefined);
const detail = createAdminUserIdentityDetailHandler({ ...localDependencies, get: async (_db, _ctx, ref) => { assert.equal(ref, membershipRef); return identity; }, update: async (_db, _ctx, ref, body) => { mutations += 1; assert.equal(ref, membershipRef); return { ...identity, ...body, version: 2 }; } });
check("identity GET returns the protected detail", (await invoke(detail, { query: { membershipRef } })).body?.identity?.documentNumber === identity.documentNumber);
const updated = await invoke(detail, { method: "PATCH", query: { membershipRef }, headers: jsonHeaders, body: { requestId: randomUUID(), expectedVersion: 1, name: "New company name" } });
check("PATCH returns updated profile with private headers", updated.statusCode === 200 && updated.body?.identity?.version === 2 && mutations === 1 && isPrivate(updated));
for (const [name, options, status] of [
  ["external origin", { origin: "https://untrusted.invalid", body: {} }, 403],
  ["ambiguous origin", { headers: { ...jsonHeaders, origin: ["http://localhost:5173"] }, body: {} }, 403],
  ["non-JSON content type", { headers: { "content-type": "text/plain" }, body: "{}" }, 415],
  ["array JSON", { body: [] }, 400],
  ["malformed JSON", { body: "{" }, 400],
  ["body too large", { body: { name: "x".repeat(384 * 1024) } }, 413],
]) {
  const before = mutations;
  const res = await invoke(detail, { method: "PATCH", query: { membershipRef }, headers: jsonHeaders, ...options });
  check(`PATCH rejects ${name} before domain mutation`, res.statusCode === status && mutations === before && isPrivate(res));
}
check("OPTIONS does not grant credentialed cross-origin access", (await invoke(detail, { method: "OPTIONS" })).statusCode === 405);
let bodyReads = 0;
const unauthenticated = createAdminUserIdentityDetailHandler({ ...localDependencies, resolveContext: async () => { throw new AdminMembershipError("ADMIN_MEMBERSHIP_FORBIDDEN", 403); }, update: async () => { throw new Error("must not mutate"); } });
const denied = await invoke(unauthenticated, { method: "PATCH", bodyGetter: () => { bodyReads += 1; return {}; } });
check("authorization failure precedes reading personal data from body", denied.statusCode === 403 && denied.body?.error === "ADMIN_USER_IDENTITY_FORBIDDEN" && bodyReads === 0 && isPrivate(denied));
const broken = createAdminUserIdentityDetailHandler({ ...localDependencies, get: async () => { throw new Error("secret connection password photo cedula"); } });
const sanitized = await invoke(broken, { query: { membershipRef } });
check("uncontrolled errors never expose exception details", sanitized.statusCode === 503 && sanitized.body?.error === "ADMIN_USER_IDENTITY_UNAVAILABLE" && !JSON.stringify(sanitized.body).includes("secret") && isPrivate(sanitized));
const stale = createAdminUserIdentityDetailHandler({ ...localDependencies, update: async () => { throw new AdminUserIdentityError("ADMIN_USER_IDENTITY_VERSION_CONFLICT", 409); } });
check("optimistic conflict preserves its structured status", (await invoke(stale, { method: "PATCH", headers: jsonHeaders, body: { expectedVersion: 0 }, query: { membershipRef } })).statusCode === 409);

const photo = createAdminUserIdentityPhotoHandler({ ...localDependencies, get: async () => ({ bytes: syntheticPng(), mimeType: "image/png" }) });
const image = await invoke(photo, { query: { membershipRef } });
check("private photo response is bounded PNG with nosniff and sandbox", image.statusCode === 200 && Buffer.isBuffer(image.body) && image.getHeader("content-type") === "image/png" && image.getHeader("content-security-policy") === "default-src 'none'; sandbox" && isPrivate(image));
const photoHead = await invoke(photo, { method: "HEAD", query: { membershipRef } });
check("photo HEAD preserves MIME/length but has no bytes", photoHead.statusCode === 200 && photoHead.body === undefined && Number(photoHead.getHeader("content-length")) > 0 && isPrivate(photoHead));
let activationCalls = 0; let verificationCalls = 0; let activationMode = "NEW_IDENTITY";
const activation = createAdminUserEnrollmentActivationHandler({ ...localDependencies,
  resolve: async () => ({ mode: activationMode, name: enrollment.name, email: enrollment.email, role: "V" }),
  verifyIdentity: (token) => { verificationCalls += 1; if (token !== "synthetic.verified.signature") throw new Error("bad bearer"); return { sub: "recipient", email: enrollment.email }; },
  activate: async (_db, input, actor) => { activationCalls += 1; if (activationMode === "NEW_IDENTITY") assert.equal(actor, null); else assert.equal(actor.sub, "recipient"); return { activated: Boolean(input.token), loginRequired: true }; },
});
const resolved = await invoke(activation, { method: "POST", headers: jsonHeaders, body: { action: "RESOLVE", token: "synthetic-token" } });
check("activation resolution does not create access", resolved.statusCode === 200 && resolved.body?.activation?.mode === "NEW_IDENTITY" && activationCalls === 0);
const activated = await invoke(activation, { method: "POST", headers: { ...jsonHeaders, authorization: "Bearer issuer-is-ignored" }, body: { action: "ACTIVATE", token: "synthetic-token", password: "Recipient-Password-123!" } });
check("new activation ignores issuer session and requires normal login", activated.statusCode === 200 && activated.body?.loginRequired && verificationCalls === 0 && isPrivate(activated));
activationMode = "EXISTING_IDENTITY";
check("existing account activation requires a signed-in recipient", (await invoke(activation, { method: "POST", headers: jsonHeaders, body: { action: "ACTIVATE", token: "synthetic-token" } })).statusCode === 401);
check("existing account activation rejects replacement password", (await invoke(activation, { method: "POST", headers: jsonHeaders, body: { action: "ACTIVATE", token: "synthetic-token", password: "Must-not-reset" } })).statusCode === 400);
const accepted = await invoke(activation, { method: "POST", headers: { ...jsonHeaders, authorization: "Bearer synthetic.verified.signature" }, body: { action: "ACTIVATE", token: "synthetic-token" } });
check("existing identity acceptance receives only verified identity", accepted.statusCode === 200 && accepted.body?.loginRequired && isPrivate(accepted));
for (const [name, body] of [
  ["caller chosen mode", { action: "ACTIVATE", token: "synthetic-token", mode: "NEW_IDENTITY" }],
  ["caller chosen user", { action: "ACTIVATE", token: "synthetic-token", userId: "victim" }],
  ["caller chosen role", { action: "ACTIVATE", token: "synthetic-token", role: "A" }],
  ["unknown action", { action: "LOGIN", token: "synthetic-token" }],
]) check(`activation rejects ${name}`, (await invoke(activation, { method: "POST", headers: jsonHeaders, body })).statusCode === 400);
check("public activation also rejects cross-origin requests", (await invoke(activation, { method: "POST", origin: "https://other.invalid", headers: jsonHeaders, body: { action: "RESOLVE", token: "synthetic-token" } })).statusCode === 403);
check("activation token cannot be passed using GET query", (await invoke(activation, { url: "/api/admin/user-enrollments/activate?token=synthetic-token" })).statusCode === 405);

const enrollments = createAdminUserEnrollmentCollectionHandler({ ...localDependencies, list: async () => [enrollment], issue: async () => ({ enrollment, activationPath: "/activate-user#token=synthetic-once", shownOnce: true }) });
check("enrollment list uses its explicit envelope", (await invoke(enrollments)).body?.enrollments?.[0]?.enrollmentRef === enrollmentRef);
const issued = await invoke(enrollments, { method: "POST", headers: jsonHeaders, body: { requestId: randomUUID(), name: "Synthetic", email: "person@example.invalid", role: "V" } });
check("enrollment returns one-time fragment path privately", issued.statusCode === 201 && issued.body?.shownOnce && issued.body?.activationPath.startsWith("/activate-user#token=") && isPrivate(issued));
const revoke = createAdminUserEnrollmentDetailHandler({ ...localDependencies, revoke: async (_db, _ctx, ref) => ({ ...enrollment, enrollmentRef: ref, status: "REVOKED" }) });
const revoked = await invoke(revoke, { method: "PATCH", query: { enrollmentRef }, headers: jsonHeaders, body: { requestId: randomUUID(), action: "REVOKE" } });
check("revoke uses the public enrollment reference", revoked.statusCode === 200 && revoked.body?.enrollment?.enrollmentRef === enrollmentRef && revoked.body?.enrollment?.status === "REVOKED" && isPrivate(revoked));

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, routes: 6, results }, null, 2)}\n`);
