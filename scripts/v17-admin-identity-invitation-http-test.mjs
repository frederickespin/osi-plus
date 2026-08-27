import { randomUUID } from "node:crypto";
import {
  createAdminIdentityActivationHandler,
  createAdminIdentityInvitationCollectionHandler,
  createAdminIdentityInvitationDetailHandler,
} from "../api/_lib/adminIdentityInvitationHttp.js";

const localEnv = { ADMIN_IDENTITY_INVITATION_MODE: "LOCAL_ONLY" };
const context = { tenantId: "tenant-test", membershipId: "member-test", userId: "user-test", role: "A" };
const invitationRef = randomUUID();
const invitation = { invitationRef, email: "admin@example.invalid", role: "A", grantedPermissions: [], status: "PENDING", expiresAt: "2026-08-28T00:00:00.000Z", createdAt: "2026-08-27T00:00:00.000Z" };
const results = [];
function check(name, condition) { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
function response() {
  const headers = new Map();
  return { statusCode: 200, body: undefined, ended: false, setHeader(k, v) { headers.set(String(k).toLowerCase(), v); }, getHeader(k) { return headers.get(String(k).toLowerCase()); }, removeHeader(k) { headers.delete(String(k).toLowerCase()); }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; this.ended = true; return this; }, end() { this.ended = true; return this; }, headers };
}
function request({ method = "GET", url = "/api/admin/identity-invitations", query, body, origin = "http://localhost:5173", headers = {}, bodyGetter } = {}) {
  const req = { method, url, query, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" }, headers: { host: "localhost:5173", origin, "x-forwarded-proto": "http", ...headers } };
  if (bodyGetter) Object.defineProperty(req, "body", { get: bodyGetter }); else req.body = body;
  return req;
}
async function invoke(handler, options) { const res = response(); await handler(request(options), res); return res; }
function privateHeaders(result) {
  const vary = String(result.headers.get("vary") || "").toLowerCase();
  return result.headers.get("cache-control") === "private, no-store" && vary.includes("authorization") && vary.includes("origin")
    && !result.headers.has("access-control-allow-origin") && !result.headers.has("access-control-allow-credentials") && !result.headers.has("set-cookie");
}

let authCalls = 0; let bodyReads = 0; let domainCalls = 0;
const disabled = createAdminIdentityInvitationCollectionHandler({ env: { ADMIN_IDENTITY_INVITATION_MODE: "DISABLED" }, resolveContext: async () => { authCalls += 1; return context; }, issue: async () => { domainCalls += 1; } });
const disabledResult = await invoke(disabled, { method: "POST", bodyGetter: () => { bodyReads += 1; throw new Error("body read"); } });
check("gate disabled precedes auth body and database", disabledResult.statusCode === 409 && authCalls === 0 && bodyReads === 0 && domainCalls === 0 && privateHeaders(disabledResult));

const collection = createAdminIdentityInvitationCollectionHandler({ env: localEnv, prisma: {}, resolveContext: async () => context,
  list: async () => [invitation], issue: async (_db, ctx, body) => ({ invitation: { ...invitation, email: body.email.toLowerCase() }, activationPath: "/activate-admin#token=one-time", shownOnce: ctx.tenantId === context.tenantId }) });
const list = await invoke(collection, {});
check("tenant list closed DTO", list.statusCode === 200 && list.body?.invitations?.[0]?.invitationRef === invitationRef && privateHeaders(list));
const issued = await invoke(collection, { method: "POST", headers: { "content-type": "application/json" }, body: { requestId: randomUUID(), email: "ADMIN@EXAMPLE.INVALID" } });
check("issue returns one-time activation path", issued.statusCode === 201 && issued.body?.shownOnce === true && issued.body?.activationPath?.startsWith("/activate-admin#token=") && privateHeaders(issued));
const extra = await invoke(collection, { method: "POST", headers: { "content-type": "application/json" }, body: { requestId: randomUUID(), email: "a@example.invalid", tenantId: "forbidden" } });
check("authority fields rejected", extra.statusCode === 400);
check("external origin rejected", (await invoke(collection, { origin: "https://external.invalid" })).statusCode === 403);
check("OPTIONS never grants CORS", (await invoke(collection, { method: "OPTIONS" })).statusCode === 405);
check("HEAD has no body", (await invoke(collection, { method: "HEAD" })).body === undefined);

const detail = createAdminIdentityInvitationDetailHandler({ env: localEnv, prisma: {}, resolveContext: async () => context, revoke: async (_db, _ctx, ref, body) => ({ ...invitation, invitationRef: ref, status: body.action === "REVOKE" ? "REVOKED" : "PENDING" }) });
const revoked = await invoke(detail, { method: "PATCH", query: { invitationRef }, headers: { "content-type": "application/json" }, body: { requestId: randomUUID(), action: "REVOKE" } });
check("revoke exact public ref", revoked.statusCode === 200 && revoked.body?.invitation?.status === "REVOKED" && privateHeaders(revoked));

let activationBodyReads = 0; let activationCalls = 0;
const activationDisabled = createAdminIdentityActivationHandler({ env: { ADMIN_IDENTITY_INVITATION_MODE: "DISABLED" }, activateNew: async () => { activationCalls += 1; } });
const activationDisabledResult = await invoke(activationDisabled, { method: "POST", bodyGetter: () => { activationBodyReads += 1; throw new Error("body read"); } });
check("public activation gate precedes body and database", activationDisabledResult.statusCode === 409 && activationBodyReads === 0 && activationCalls === 0 && privateHeaders(activationDisabledResult));
const activation = createAdminIdentityActivationHandler({ env: localEnv, prisma: {}, activateNew: async (_db, body) => ({ activated: body.token === "opaque", loginRequired: true }) });
const activated = await invoke(activation, { method: "POST", headers: { "content-type": "application/json" }, body: { token: "opaque", name: "Administradora", password: "Synthetic-Password-1!" } });
check("activation does not auto login", activated.statusCode === 200 && activated.body?.loginRequired === true && !activated.headers.has("set-cookie") && privateHeaders(activated));
const invalid = await invoke(activation, { method: "POST", headers: { "content-type": "application/json" }, body: { token: "bad", name: "Administradora", password: "Synthetic-Password-1!", userId: "forbidden" } });
check("activation input closed and generic", invalid.statusCode === 400 && invalid.body?.error === "ADMIN_IDENTITY_ACTIVATION_INVALID");

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, routes: 3, results }, null, 2)}\n`);
