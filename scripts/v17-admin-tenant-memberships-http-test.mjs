import { randomUUID } from "node:crypto";
import { createAdminMembershipCollectionHandler, createAdminMembershipDetailHandler } from "../api/_lib/adminMembershipHttp.js";
import { AdminMembershipError } from "../api/_lib/adminMembershipDomain.js";
import { ADMIN_IDENTITY_INVITATION_MODES, resolveAdminIdentityInvitationMode } from "../api/_lib/adminMembershipAccess.js";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH } from "../api/_lib/adminMembershipPreview.js";

const localEnv = { ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY" };
const context = { tenantId: "tenant-test", membershipId: "member-actor", userId: "user-actor", role: "A", effectivePermissions: ["membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status"], deniedPermissions: [] };
const ref = randomUUID();
const row = { membershipRef: ref, name: "Persona sintética", email: "masked@example.invalid", role: "A", status: "ACTIVE", grantedPermissions: [...context.effectivePermissions], deniedPermissions: [], authorizationVersion: 1, updatedAt: new Date().toISOString() };
const results = [];
function check(name, condition) { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }

function response() {
  const headers = new Map();
  return { statusCode: 200, body: undefined, ended: false, setHeader(k, v) { headers.set(String(k).toLowerCase(), v); }, getHeader(k) { return headers.get(String(k).toLowerCase()); }, removeHeader(k) { headers.delete(String(k).toLowerCase()); }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; this.ended = true; return this; }, end() { this.ended = true; return this; }, headers };
}

function request({ method = "GET", url = "/api/admin/memberships?page=1", query, body, env = localEnv, origin = "http://localhost:5173", bodyGetter } = {}) {
  const req = { method, url, query, socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" }, headers: { host: "localhost:5173", origin, "x-forwarded-proto": "http", ...(method === "PATCH" ? { "content-type": "application/json" } : {}) } };
  if (bodyGetter) Object.defineProperty(req, "body", { get: bodyGetter }); else req.body = body;
  return { req, env };
}

async function invoke(handler, options) { const res = response(); const input = request(options); await handler(input.req, res); return res; }

const collection = createAdminMembershipCollectionHandler({ env: localEnv, prisma: {}, resolveContext: async () => context, list: async (_db, ctx) => { check("lista recibe tenant server-side", ctx.tenantId === context.tenantId); return { data: [row], total: 1, page: 1, pageSize: 20 }; } });
const ok = await invoke(collection, {});
check("GET lista 200", ok.statusCode === 200 && ok.body?.data?.length === 1);
check("catálogo incluye los 17 roles del modelo", ok.body?.catalog?.roles?.length === 17
  && ["K", "PC", "PE"].every((code) => ok.body.catalog.roles.some((role) => role.code === code))
  && !ok.body.catalog.roles.some((role) => role.code === "RB"));
check("catálogo deriva autoridad de rol A sin concesiones explícitas", !ok.body.catalog.roles.find((role) => role.code === "A").inheritedPermissions.includes("membership:view")
  && !ok.body.catalog.roles.find((role) => role.code === "A").inheritedPermissions.includes("logistics:rules:manage"));
check("catálogo de permisos incluye etiquetas y grupos", ok.body.catalog.permissions.some((permission) => permission.code === "logistics:rules:manage" && permission.label && permission.group)
  && new Set(ok.body.catalog.permissions.map((permission) => permission.code)).size === ok.body.catalog.permissions.length);
check("headers privados", ok.headers.get("cache-control") === "private, no-store" && String(ok.headers.get("vary")).includes("Authorization") && String(ok.headers.get("vary")).includes("Origin"));
check("sin CORS permisivo", !ok.headers.has("access-control-allow-origin") && !ok.headers.has("access-control-allow-credentials"));

const head = await invoke(collection, { method: "HEAD" });
check("HEAD no tiene body", head.statusCode === 200 && head.body === undefined && head.ended);
const optionsResult = await invoke(collection, { method: "OPTIONS" });
check("OPTIONS no concede CORS", optionsResult.statusCode === 405 && !optionsResult.headers.has("access-control-allow-origin"));
const external = await invoke(collection, { origin: "https://external.invalid" });
check("Origin externo rechazado", external.statusCode === 403 && external.body?.error === "ADMIN_MEMBERSHIP_ORIGIN_FORBIDDEN");

let contextCalls = 0; let bodyReads = 0;
const disabled = createAdminMembershipDetailHandler({ env: { ADMIN_TENANT_MEMBERSHIP_MODE: "DISABLED" }, prisma: { sentinel: true }, resolveContext: async () => { contextCalls += 1; return context; }, update: async () => row });
const disabledResult = await invoke(disabled, { method: "PATCH", query: { membershipRef: ref }, bodyGetter: () => { bodyReads += 1; throw new Error("body should not be read"); } });
check("disabled 409 antes de auth/body/Prisma", disabledResult.statusCode === 409 && disabledResult.body?.error === "ADMIN_TENANT_MEMBERSHIPS_DISABLED" && contextCalls === 0 && bodyReads === 0);

for (const value of ["local_only", "LOCAL_ONLY ", " LOCAL_ONLY", '"LOCAL_ONLY"', "\uFEFFLOCAL_ONLY", "LOCAL_ONLY\n", "UNKNOWN"]) {
  const invalid = createAdminMembershipCollectionHandler({ env: { ADMIN_TENANT_MEMBERSHIP_MODE: value }, resolveContext: async () => context, list: async () => ({}) });
  const result = await invoke(invalid, {});
  check(`modo alterado falla cerrado: ${JSON.stringify(value)}`, result.statusCode === 503);
}
const vercelLocal = createAdminMembershipCollectionHandler({ env: { ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY", VERCEL_ENV: "preview" }, resolveContext: async () => context, list: async () => ({}) });
check("Vercel rechaza LOCAL_ONLY", (await invoke(vercelLocal, {})).statusCode === 503);

const detail = createAdminMembershipDetailHandler({ env: localEnv, prisma: {}, resolveContext: async () => context, get: async (_db, _ctx, value) => { if (value !== ref) throw new AdminMembershipError("ADMIN_MEMBERSHIP_NOT_FOUND", 404); return row; }, update: async (_db, _ctx, value, input) => ({ ...row, membershipRef: value, role: input.role, authorizationVersion: 2 }) });
const detailResult = await invoke(detail, { query: { membershipRef: ref } });
check("detalle por publicRef", detailResult.statusCode === 200 && detailResult.body?.membership?.membershipRef === ref);
const patchResult = await invoke(detail, { method: "PATCH", query: { membershipRef: ref }, body: { requestId: randomUUID(), expectedVersion: 1, role: "V" } });
check("PATCH controlado", patchResult.statusCode === 200 && patchResult.body?.membership?.role === "V");
const extra = await invoke(detail, { method: "PATCH", query: { membershipRef: ref }, body: { requestId: randomUUID(), expectedVersion: 1, tenantId: "forbidden" } });
check("campos de autoridad rechazados", extra.statusCode === 400 && extra.body?.error === "ADMIN_MEMBERSHIP_INPUT_INVALID");

const incomplete = createAdminMembershipCollectionHandler({ env: localEnv, prisma: {}, resolveContext: async () => { throw new AdminMembershipError("ADMIN_MEMBERSHIP_FORBIDDEN", 403); }, list: async () => { throw new Error("must not list"); } });
check("contexto incompleto falla cerrado", (await invoke(incomplete, {})).statusCode === 403);

const previewEnv = {
  ADMIN_TENANT_MEMBERSHIP_MODE: "PREVIEW_REHEARSAL",
  ADMIN_MEMBERSHIP_PREVIEW_BATCH,
  ADMIN_MEMBERSHIP_PREVIEW_DATABASE: "admin_preview_test",
  ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: "br-synthetic-admin",
  ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: "ADMIN-PREVIEW-TEST",
  DATABASE_URL: "postgresql://127.0.0.1/admin_preview_test?schema=osi",
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview",
  MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false",
};
const previewContext = {
  ...context, sessionKind: "LEGACY", tenantCode: "ADMIN-PREVIEW-TEST", tenant: { code: "ADMIN-PREVIEW-TEST" },
  tenantStatus: "ACTIVE", membershipStatus: "ACTIVE", userStatus: "ACTIVE",
};
const previewIdentity = { database: "admin_preview_test", branch: "br-synthetic-admin", schema_exists: true };
const previewCalls = { database: 0, context: 0, execute: 0, body: 0 };
function previewHandler({ env = previewEnv, identity = [previewIdentity], actor = previewContext, detailRoute = false } = {}) {
  const config = {
    env,
    prisma: { async $queryRaw() { previewCalls.database += 1; return identity; } },
    resolveContext: async () => { previewCalls.context += 1; return actor; },
    list: async () => { previewCalls.execute += 1; return { data: [row], total: 1, page: 1, pageSize: 20 }; },
    update: async () => { previewCalls.execute += 1; return { ...row, status: "SUSPENDED", authorizationVersion: 2 }; },
    get: async () => { previewCalls.execute += 1; return row; },
  };
  return detailRoute ? createAdminMembershipDetailHandler(config) : createAdminMembershipCollectionHandler(config);
}
const validPreview = await invoke(previewHandler(), {});
check("Preview exacto verifica destino y permite lectura", validPreview.statusCode === 200 && previewCalls.database === 1 && previewCalls.context === 1 && previewCalls.execute === 1);
const featurePreview = await invoke(previewHandler({ env: { ...previewEnv, VERCEL_GIT_COMMIT_REF: "feature/v17-administration-users-roles-19b" } }), {});
check("rama exacta del incremento permite Preview", featurePreview.statusCode === 200);
const previewHead = await invoke(previewHandler(), { method: "HEAD" });
check("Preview HEAD verifica destino y no devuelve cuerpo", previewHead.statusCode === 200 && previewHead.body === undefined);
const previewPatch = await invoke(previewHandler({ detailRoute: true }), { method: "PATCH", query: { membershipRef: ref }, body: { requestId: randomUUID(), expectedVersion: 1, status: "SUSPENDED" } });
check("Preview PATCH llega al dominio después de verificar contexto", previewPatch.statusCode === 200 && previewPatch.body.membership.status === "SUSPENDED");

for (const [name, mutation] of [
  ["Production", { VERCEL_ENV: "production" }],
  ["sin Vercel", { VERCEL: undefined }],
  ["rama ajena", { VERCEL_GIT_COMMIT_REF: "feature/unrelated" }],
  ["rama con sufijo", { VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview-extra" }],
  ["batch incorrecto", { ADMIN_MEMBERSHIP_PREVIEW_BATCH: "OTHER" }],
  ["sin destino de base", { ADMIN_MEMBERSHIP_PREVIEW_DATABASE: undefined }],
  ["sin destino Neon", { ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: undefined }],
  ["sin empresa autorizada", { ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: undefined }],
  ["empresa con espacios", { ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: " ADMIN-PREVIEW-TEST" }],
  ["auth diferente", { MT01B_AUTH_MODE: "MEMBERSHIP_ONLY" }],
  ["cambio empresa habilitado", { MT01B_TENANT_SWITCH_ENABLED: "true" }],
  ["cliente V2 habilitado", { VITE_MT01B2_CLIENT_ENABLED: "true" }],
  ["URL de otra base", { DATABASE_URL: "postgresql://127.0.0.1/other?schema=osi" }],
  ["URL sin schema", { DATABASE_URL: "postgresql://127.0.0.1/admin_preview_test" }],
  ["schema diferente", { DATABASE_URL: "postgresql://127.0.0.1/admin_preview_test?schema=public" }],
  ["schema repetido", { DATABASE_URL: "postgresql://127.0.0.1/admin_preview_test?schema=osi&schema=osi" }],
]) {
  const before = { ...previewCalls };
  const result = await invoke(previewHandler({ env: { ...previewEnv, ...mutation }, detailRoute: true }), {
    method: "PATCH", query: { membershipRef: ref }, bodyGetter: () => { previewCalls.body += 1; throw new Error("body should not be read"); },
  });
  check(`Preview rechaza ${name} antes de DB/auth/body`, result.statusCode === 503
    && result.body?.error === "ADMIN_MEMBERSHIP_PREVIEW_CONFIGURATION_INVALID"
    && JSON.stringify(before) === JSON.stringify(previewCalls));
}

for (const [name, identity] of [
  ["otra base real", [{ ...previewIdentity, database: "other" }]],
  ["otra rama Neon real", [{ ...previewIdentity, branch: "br-other" }]],
  ["schema inexistente", [{ ...previewIdentity, schema_exists: false }]],
  ["identidad ausente", []],
]) {
  const before = { ...previewCalls };
  const result = await invoke(previewHandler({ identity }), {});
  check(`Preview rechaza ${name} antes del contexto y listado`, result.statusCode === 503
    && previewCalls.database === before.database + 1 && previewCalls.context === before.context && previewCalls.execute === before.execute);
}

for (const [name, mutation] of [
  ["empresa ajena", { tenantCode: "OTHER", tenant: { code: "OTHER" } }],
  ["empresa inconsistente", { tenantCode: "ADMIN-PREVIEW-TEST", tenant: { code: "OTHER" } }],
  ["empresa inactiva", { tenantStatus: "INACTIVE" }],
  ["membresía suspendida", { membershipStatus: "SUSPENDED" }],
  ["usuario inactivo", { userStatus: "INACTIVE" }],
  ["rol no administrador", { role: "V" }],
  ["sesión distinta", { sessionKind: "V2" }],
]) {
  const before = { ...previewCalls };
  const result = await invoke(previewHandler({ actor: { ...previewContext, ...mutation }, detailRoute: true }), {
    method: "PATCH", query: { membershipRef: ref }, bodyGetter: () => { previewCalls.body += 1; throw new Error("body should not be read"); },
  });
  check(`Preview rechaza ${name} antes del cuerpo y mutación`, result.statusCode === 403
    && result.body?.error === "ADMIN_MEMBERSHIP_PREVIEW_FORBIDDEN"
    && previewCalls.execute === before.execute && previewCalls.body === before.body);
}

check("modo de invitaciones no incorpora Preview", !Object.hasOwn(ADMIN_IDENTITY_INVITATION_MODES, "PREVIEW_REHEARSAL")
  && resolveAdminIdentityInvitationMode(previewEnv) === "DISABLED");
let invitationRejected = false;
try { resolveAdminIdentityInvitationMode({ ...previewEnv, ADMIN_IDENTITY_INVITATION_MODE: "PREVIEW_REHEARSAL" }); }
catch (error) { invitationRejected = error?.code === "ADMIN_IDENTITY_INVITATION_CONFIGURATION_INVALID"; }
check("solicitar Preview de invitaciones falla cerrado", invitationRejected);

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, routes: 2, results }, null, 2)}\n`);
