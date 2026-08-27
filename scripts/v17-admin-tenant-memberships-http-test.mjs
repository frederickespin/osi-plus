import { randomUUID } from "node:crypto";
import { createAdminMembershipCollectionHandler, createAdminMembershipDetailHandler } from "../api/_lib/adminMembershipHttp.js";
import { AdminMembershipError } from "../api/_lib/adminMembershipDomain.js";

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

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, routes: 2, results }, null, 2)}\n`);
