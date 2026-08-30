import { createHash, randomUUID } from "node:crypto";
import {
  createAdminIdentityActivationHandler,
  createAdminIdentityInvitationCollectionHandler,
  createAdminIdentityInvitationDetailHandler,
} from "../api/_lib/adminIdentityInvitationHttp.js";
import {
  V17_PRODUCTION_PILOT_BATCH,
  V17_PRODUCTION_PILOT_GATES,
} from "../api/_lib/v17ProductionPilotGate.js";

const localEnv = { ADMIN_IDENTITY_INVITATION_MODE: "LOCAL_ONLY" };
const context = { tenantId: "tenant-test", membershipId: "member-test", userId: "user-test", role: "A" };
const invitationRef = randomUUID();
const invitation = { invitationRef, email: "admin@example.invalid", role: "A", grantedPermissions: [], status: "PENDING", expiresAt: "2026-08-28T00:00:00.000Z", createdAt: "2026-08-27T00:00:00.000Z" };
const adminPermissions = ["membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status"];
const productionContext = {
  tenantId: "tenant-test", tenantCode: "PILOT-TENANT", membershipId: "member-test", userId: "user-test", role: "A",
  userStatus: "ACTIVE", membershipStatus: "ACTIVE", tenantStatus: "ACTIVE", effectivePermissions: adminPermissions, deniedPermissions: [],
};
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function productionEnvironment(adminEmail = "corporate-admin@example.invalid") {
  const manifest = canonical({ batch: V17_PRODUCTION_PILOT_BATCH, tenants: [{ code: "PILOT-TENANT", gates: [V17_PRODUCTION_PILOT_GATES.ADMIN_IDENTITY_INVITATIONS] }], version: 1 });
  return {
    VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false",
    COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
    COMMERCIAL_TENANCY_MUTATION_MODE: "DISABLED", COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V1",
    V17_PRODUCTION_PILOT_ACTIVATION_BATCH: V17_PRODUCTION_PILOT_BATCH,
    V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST: manifest,
    V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST_SHA256: createHash("sha256").update(manifest, "utf8").digest("hex"),
    V17_PRODUCTION_PILOT_ADMIN_EMAIL: adminEmail,
    ADMIN_IDENTITY_INVITATION_MODE: "PRODUCTION_PILOT",
  };
}
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

let productionAuthCalls = 0; let productionIssueCalls = 0; let productionInput;
const productionCollection = createAdminIdentityInvitationCollectionHandler({
  env: productionEnvironment(), prisma: {},
  resolveContext: async () => { productionAuthCalls += 1; return productionContext; },
  list: async () => [{ ...invitation, email: "corporate-admin@example.invalid" }],
  issue: async (_db, _ctx, body) => {
    productionIssueCalls += 1; productionInput = body;
    return { invitation: { ...invitation, email: body.email }, activationPath: "/activate-admin#token=one-time", shownOnce: true };
  },
});
const injectedEmail = await invoke(productionCollection, { method: "POST", headers: { "content-type": "application/json" }, body: { requestId: randomUUID(), email: "injected@example.invalid" } });
check("Production Pilot rejects injected email before auth or Prisma", injectedEmail.statusCode === 400 && productionAuthCalls === 0 && productionIssueCalls === 0 && privateHeaders(injectedEmail));
const corporateIssued = await invoke(productionCollection, { method: "POST", headers: { "content-type": "application/json" }, body: { requestId: randomUUID() } });
check("Production Pilot derives recipient only on server", corporateIssued.statusCode === 201 && productionAuthCalls === 1 && productionIssueCalls === 1
  && productionInput?.email === "corporate-admin@example.invalid" && !Object.hasOwn(corporateIssued.body?.invitation || {}, "email")
  && !JSON.stringify(corporateIssued.body).includes("corporate-admin@example.invalid") && privateHeaders(corporateIssued));
const corporateList = await invoke(productionCollection, {});
check("Production Pilot list never publishes recipient", corporateList.statusCode === 200 && !Object.hasOwn(corporateList.body?.invitations?.[0] || {}, "email")
  && !JSON.stringify(corporateList.body).includes("corporate-admin@example.invalid") && privateHeaders(corporateList));
for (const [name, env] of [
  ["missing", { ...productionEnvironment(), V17_PRODUCTION_PILOT_ADMIN_EMAIL: undefined }],
  ["invalid", productionEnvironment("invalid-recipient")],
]) {
  let auth = 0; let domain = 0;
  const handler = createAdminIdentityInvitationCollectionHandler({ env, prisma: {}, resolveContext: async () => { auth += 1; return productionContext; }, issue: async () => { domain += 1; } });
  const result = await invoke(handler, { method: "POST", headers: { "content-type": "application/json" }, body: { requestId: randomUUID() } });
  check(`Production Pilot ${name} recipient fails closed before auth or Prisma`, result.statusCode === 503 && auth === 0 && domain === 0 && privateHeaders(result));
}

const detail = createAdminIdentityInvitationDetailHandler({ env: localEnv, prisma: {}, resolveContext: async () => context, revoke: async (_db, _ctx, ref, body) => ({ ...invitation, invitationRef: ref, status: body.action === "REVOKE" ? "REVOKED" : "PENDING" }) });
const revoked = await invoke(detail, { method: "PATCH", query: { invitationRef }, headers: { "content-type": "application/json" }, body: { requestId: randomUUID(), action: "REVOKE" } });
check("revoke exact public ref", revoked.statusCode === 200 && revoked.body?.invitation?.status === "REVOKED" && privateHeaders(revoked));
const productionDetail = createAdminIdentityInvitationDetailHandler({ env: productionEnvironment(), prisma: {}, resolveContext: async () => productionContext,
  revoke: async (_db, _ctx, ref) => ({ ...invitation, invitationRef: ref, email: "corporate-admin@example.invalid", status: "REVOKED" }) });
const corporateRevoked = await invoke(productionDetail, { method: "PATCH", query: { invitationRef }, headers: { "content-type": "application/json" }, body: { requestId: randomUUID(), action: "REVOKE" } });
check("Production Pilot revoke response never publishes recipient", corporateRevoked.statusCode === 200 && !Object.hasOwn(corporateRevoked.body?.invitation || {}, "email")
  && !JSON.stringify(corporateRevoked.body).includes("corporate-admin@example.invalid") && privateHeaders(corporateRevoked));

let activationBodyReads = 0; let activationCalls = 0; let resolutionCalls = 0;
const activationDisabled = createAdminIdentityActivationHandler({ env: { ADMIN_IDENTITY_INVITATION_MODE: "DISABLED" }, resolveActivation: async () => { resolutionCalls += 1; }, activateNew: async () => { activationCalls += 1; } });
const activationDisabledResult = await invoke(activationDisabled, { method: "POST", bodyGetter: () => { activationBodyReads += 1; throw new Error("body read"); } });
check("public activation gate precedes body and database", activationDisabledResult.statusCode === 409 && activationBodyReads === 0 && activationCalls === 0 && resolutionCalls === 0 && privateHeaders(activationDisabledResult));
let selectedMode = "NEW_IDENTITY";
const activation = createAdminIdentityActivationHandler({ env: localEnv, prisma: {},
  resolveActivation: async (_db, body) => { resolutionCalls += 1; return { mode: selectedMode, tenantCode: "LOCAL" }; },
  activateNew: async (_db, body) => { activationCalls += 1; return { activated: body.token === "opaque", loginRequired: true }; },
  acceptExisting: async (_db, body, identity) => ({ activated: body.token === "opaque" && identity.sub === "existing-user", loginRequired: true }),
});
const resolvedNew = await invoke(activation, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer issuer-must-not-select-mode" }, body: { action: "RESOLVE", token: "opaque" } });
check("server resolves new identity independent of ambient bearer", resolvedNew.statusCode === 200 && resolvedNew.body?.mode === "NEW_IDENTITY");
const activated = await invoke(activation, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer issuer-must-be-ignored" }, body: { action: "ACTIVATE", token: "opaque", name: "Administradora", password: "Synthetic-Password-1!" } });
check("new activation does not use ambient session or auto login", activated.statusCode === 200 && activated.body?.loginRequired === true && activationCalls === 1 && !activated.headers.has("set-cookie") && privateHeaders(activated));
selectedMode = "EXISTING_IDENTITY";
const missingBearer = await invoke(activation, { method: "POST", headers: { "content-type": "application/json" }, body: { action: "ACTIVATE", token: "opaque" } });
check("existing identity requires matching LEGACY bearer", missingBearer.statusCode === 400 && missingBearer.body?.error === "ADMIN_IDENTITY_ACTIVATION_INVALID");
const invalid = await invoke(activation, { method: "POST", headers: { "content-type": "application/json" }, body: { action: "ACTIVATE", token: "bad", name: "Administradora", password: "Synthetic-Password-1!", userId: "forbidden" } });
check("activation input closed and generic", invalid.statusCode === 400 && invalid.body?.error === "ADMIN_IDENTITY_ACTIVATION_INVALID");

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, routes: 3, results }, null, 2)}\n`);
