import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createFleetDriverOptionsHandler, createFleetDriversHandler, createFleetPrimaryDriverHandler, createFleetDriverAuthorizationHandler, createFleetDriverDecisionHandler } from "../api/_lib/fleetDriversHttp.js";
import { assertFleetDriversDatabase, requireFleetDriversAccess } from "../api/_lib/fleetDriversAccess.js";
import { FleetDriversError } from "../api/_lib/fleetDriversContract.js";
import { ADMIN_FLEET_BATCH } from "../shared/adminFleet.js";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH } from "../shared/adminMembershipPreview.js";
import { ADMIN_FLEET_DRIVERS_BATCH, FLEET_DRIVERS_MIGRATION_CHECKSUM } from "../shared/adminFleetDrivers.js";

const local = { ADMIN_FLEET_MODE: "LOCAL_ONLY", ADMIN_TENANT_MEMBERSHIP_MODE: "LOCAL_ONLY", ADMIN_FLEET_DRIVERS_MODE: "LOCAL_ONLY" };
const context = { tenantId: "synthetic-tenant", userId: "synthetic-user", membershipId: "synthetic-member", role: "A", effectivePermissions: ["fleet:view", "fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize"] };
const ref = "synthetic-vehicle"; const auth = randomUUID(); const mutation = { vehicleRef: ref, reference: auth, version: 1, idempotent: false };
const factories = [
  { create: createFleetDriverOptionsHandler, method: "GET", methods: "GET, HEAD", query: {}, key: "list", result: { data: [], total: 0, page: 1, pageSize: 20 } },
  { create: createFleetDriversHandler, method: "GET", methods: "GET, HEAD", query: { vehicleRef: ref }, key: "get", result: { vehicle: { vehicleRef: ref }, data: [] } },
  { create: createFleetPrimaryDriverHandler, method: "PUT", methods: "PUT", query: { vehicleRef: ref }, key: "setPrimary", permission: "fleet:drivers:assign", result: mutation },
  { create: createFleetDriverAuthorizationHandler, method: "POST", methods: "POST", query: { vehicleRef: ref }, key: "request", permission: "fleet:drivers:request", result: mutation },
  { create: createFleetDriverDecisionHandler, method: "PATCH", methods: "PATCH", query: { vehicleRef: ref, authorizationRef: auth }, key: "decide", permission: "fleet:drivers:authorize", result: mutation },
];
function req({ method = "GET", query = {}, body = { requestId: randomUUID() }, headers = {}, url = "/api/admin/fleet/drivers/options", remoteAddress = "127.0.0.1", bodyGetter } = {}) {
  const request = { method, query, url, headers: { host: "localhost:5173", origin: "http://localhost:5173", "x-forwarded-proto": "http", "content-type": "application/json", ...headers }, socket: { remoteAddress, localAddress: "127.0.0.1" } };
  if (bodyGetter) Object.defineProperty(request, "body", { get: bodyGetter }); else request.body = body;
  return request;
}
function res() {
  const headers = new Map();
  return { headers, statusCode: 200, body: undefined, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, removeHeader(k) { headers.delete(k.toLowerCase()); }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; }, end(v) { this.body = v; return this; } };
}
async function invoke(handler, input) { const response = res(); await handler(req(input), response); return response; }
function privateResponse(response) {
  assert.equal(response.getHeader("cache-control"), "private, no-store");
  assert.match(String(response.getHeader("vary")), /authorization/iu);
  assert.match(String(response.getHeader("vary")), /origin/iu);
  assert.equal(response.getHeader("x-content-type-options"), "nosniff");
  assert.equal(response.getHeader("referrer-policy"), "no-referrer");
  assert.equal(response.getHeader("access-control-allow-origin"), undefined);
  assert.equal(response.getHeader("set-cookie"), undefined);
}
for (const factory of factories) {
  test(`${factory.create.name}: disabled before auth, schema or body`, async () => {
    let reached = 0; const forbidden = () => { reached++; throw Error("unreachable"); };
    const handler = factory.create({ env: {}, prisma: {}, resolveContext: forbidden, checkDatabase: forbidden, [factory.key]: forbidden });
    const response = await invoke(handler, { method: factory.method, bodyGetter: forbidden });
    assert.equal(response.statusCode, 409); assert.equal(response.body.error, "FLEET_DRIVERS_DISABLED"); assert.equal(reached, 0); privateResponse(response);
    const head = await invoke(handler, { method: "HEAD" }); assert.equal(head.statusCode, 409); assert.equal(head.body, undefined); privateResponse(head);
  });
  test(`${factory.create.name}: private success, same origin and bounded methods`, async () => {
    let called = 0; const handler = factory.create({ env: local, prisma: {}, resolveContext: async () => context, checkDatabase: async () => {}, [factory.key]: async (_db, actor, ...args) => {
      called++; assert.equal(actor, context); if (factory.query.vehicleRef) assert.equal(args[0], ref); if (factory.key === "decide") assert.equal(args[1], auth); return factory.result;
    } });
    const response = await invoke(handler, { method: factory.method, query: factory.query });
    assert.equal(response.statusCode, 200); assert.deepEqual(response.body, { ok: true, ...factory.result }); assert.equal(called, 1); privateResponse(response);
    for (const method of ["OPTIONS", "DELETE", "TRACE"]) {
      const rejected = await invoke(handler, { method }); assert.equal(rejected.statusCode, 405); assert.equal(rejected.getHeader("allow"), factory.methods); privateResponse(rejected);
    }
    for (const origin of ["https://external.invalid", ["http://localhost:5173"]]) assert.equal((await invoke(handler, { method: factory.method, query: factory.query, headers: { origin } })).statusCode, 403);
    for (const suffix of ["?tenantId=other", "?page=1&page=2"]) assert.equal((await invoke(handler, { method: factory.method, query: factory.query, url: `/api/admin/fleet/drivers/options${suffix}` })).statusCode, 400);
    assert.equal(called, 1);
  });
  if (factory.query.vehicleRef) {
    test(`${factory.create.name}: Vercel route metadata stays separate from domain filters`, async () => {
      const filters = factory.key === "get" ? { page: "2", pageSize: "10" } : {};
      const params = new URLSearchParams({ ...factory.query, ...filters });
      const url = `/api/admin/fleet/vehicles/[vehicleRef]/drivers?${params}`;
      const runtimeQuery = Object.fromEntries(params);
      const body = { requestId: randomUUID() };
      let calls = 0;
      const handler = factory.create({ env: local, prisma: {}, resolveContext: async () => context, checkDatabase: async () => {}, [factory.key]: async (_db, actor, ...args) => {
        calls++; assert.equal(actor, context); assert.equal(args[0], ref);
        if (factory.key === "get") assert.deepEqual(args[1], filters);
        else if (factory.key === "decide") { assert.equal(args[1], auth); assert.deepEqual(args[2], body); }
        else assert.deepEqual(args[1], body);
        return factory.result;
      } });
      for (const method of factory.method === "GET" ? ["GET", "HEAD"] : [factory.method]) {
        const response = await invoke(handler, { method, url, query: runtimeQuery, body });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, method === "HEAD" ? undefined : { ok: true, ...factory.result });
        privateResponse(response);
      }
      const successfulCalls = calls;
      let bodyReads = 0;
      const ambiguous = [
        { url: `${url}&tenantId=other` },
        { url: `${url}&vehicleRef=${ref}` },
        { url: `${url}&vehicleRef=other` },
        { query: { ...runtimeQuery, vehicleRef: "different-vehicle" } },
        { query: { ...runtimeQuery, vehicleRef: [ref] } },
        ...(factory.key === "decide" ? [
          { url: `${url}&authorizationRef=${auth}` },
          { query: { ...runtimeQuery, authorizationRef: randomUUID() } },
          { query: { ...runtimeQuery, authorizationRef: [auth] } },
        ] : [{ url: `${url}&authorizationRef=${auth}` }]),
      ];
      for (const input of ambiguous) {
        const response = await invoke(handler, { method: factory.method, url, query: runtimeQuery, bodyGetter: () => { bodyReads++; return body; }, ...input });
        assert.ok([400, 404].includes(response.statusCode)); privateResponse(response);
      }
      assert.equal(calls, successfulCalls); assert.equal(bodyReads, 0);
    });
  } else {
    test("driver options rejects dynamic route metadata", async () => {
      let calls = 0;
      const handler = factory.create({ env: local, prisma: {}, resolveContext: async () => context, checkDatabase: async () => {}, list: async () => { calls++; return factory.result; } });
      for (const key of ["vehicleRef", "authorizationRef"]) {
        const response = await invoke(handler, { url: `/api/admin/fleet/drivers/options?${key}=${ref}`, query: { [key]: ref } });
        assert.equal(response.statusCode, 400); privateResponse(response);
      }
      assert.equal(calls, 0);
    });
  }
  if (factory.permission) {
    test(`${factory.create.name}: actual operation permission precedes body and schema`, async () => {
      let reached = 0; const forbidden = () => { reached++; throw Error("unreachable"); };
      for (const denied of [false, true]) {
        const actor = { ...context, effectivePermissions: denied ? context.effectivePermissions : ["fleet:view", "fleet:edit"], deniedPermissions: denied ? [factory.permission] : [] };
        const handler = factory.create({ env: local, prisma: {}, resolveContext: async () => actor, checkDatabase: forbidden, [factory.key]: forbidden });
        const response = await invoke(handler, { method: factory.method, query: factory.query, bodyGetter: forbidden });
        assert.equal(response.statusCode, 403); assert.equal(response.body.error, "FLEET_DRIVERS_FORBIDDEN"); privateResponse(response);
      }
      assert.equal(reached, 0);
    });
    test(`${factory.create.name}: JSON type, size and body validation precede mutation`, async () => {
      let calls = 0; const handler = factory.create({ env: local, prisma: {}, resolveContext: async () => context, checkDatabase: async () => {}, [factory.key]: async () => { calls++; return mutation; } });
      for (const [input, status] of [[{ body: [] }, 400], [{ body: {} }, 400], [{ body: "{" }, 400], [{ body: { text: "x".repeat(8192) } }, 413], [{ headers: { "content-type": "text/plain" } }, 415]]) {
        const response = await invoke(handler, { method: factory.method, query: factory.query, ...input }); assert.equal(response.statusCode, status); privateResponse(response);
      }
      assert.equal(calls, 0);
    });
  }
}
test("unexpected internals remain private; controlled conflicts preserve status", async () => {
  for (const [error, status, code] of [[new Error("secret database details"), 503, "FLEET_DRIVERS_UNAVAILABLE"], [new FleetDriversError("FLEET_DRIVERS_VERSION_CONFLICT", 409), 409, "FLEET_DRIVERS_VERSION_CONFLICT"]]) {
    const handler = createFleetDriversHandler({ env: local, prisma: {}, resolveContext: async () => context, checkDatabase: async () => {}, get: async () => { throw error; } });
    const response = await invoke(handler, { query: { vehicleRef: ref } }); assert.equal(response.statusCode, status); assert.equal(response.body.error, code); assert.ok(!JSON.stringify(response.body).includes("secret")); privateResponse(response);
  }
});
test("drivers mode requires base fleet gates and is limited to consolidated Preview", () => {
  const preview = { ADMIN_FLEET_MODE: "PREVIEW_REHEARSAL", ADMIN_FLEET_BATCH, ADMIN_FLEET_DRIVERS_MODE: "PREVIEW_REHEARSAL", ADMIN_FLEET_DRIVERS_BATCH,
    ADMIN_TENANT_MEMBERSHIP_MODE: "PREVIEW_REHEARSAL", ADMIN_MEMBERSHIP_PREVIEW_BATCH, ADMIN_MEMBERSHIP_PREVIEW_DATABASE: "v17_consolidated_preview_10b", ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID: "br-mute-credit-ahxnvfx0", ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE: "V17-CONSOLIDATED-PREVIEW-10B",
    DATABASE_URL: "postgresql://example.invalid/v17_consolidated_preview_10b?schema=osi", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-consolidated-preview", MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" };
  assert.equal(requireFleetDriversAccess(req(), local), "LOCAL_ONLY"); assert.equal(requireFleetDriversAccess(req(), preview), "PREVIEW_REHEARSAL");
  for (const overrides of [{ ADMIN_FLEET_DRIVERS_BATCH: "wrong" }, { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "feature/v17-administration-fleet-19d" }, { ADMIN_FLEET_DRIVERS_MODE: "LOCAL_ONLY" }, { ADMIN_FLEET_MODE: "DISABLED" }]) assert.throws(() => requireFleetDriversAccess(req(), { ...preview, ...overrides }));
  assert.throws(() => requireFleetDriversAccess(req({ remoteAddress: "203.0.113.10" }), local));
});
test("schema gate requires both relations and exact applied migration checksum", async () => {
  const base = { database: "osi_db01n_ci", branch: null, schema_exists: true, vehicles_exists: true, audit_exists: true };
  const tables = { primary_exists: true, authorizations_exists: true, approvals_exists: true, identities_exists: true, history_exists: true };
  const history = { checksum: FLEET_DRIVERS_MIGRATION_CHECKSUM, finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 };
  for (const override of [{ primary_exists: false }, { authorizations_exists: false }, { history_exists: false }]) {
    let calls = 0; await assert.rejects(() => assertFleetDriversDatabase({ $queryRaw: async () => ++calls === 1 ? [base] : [{ ...tables, ...override }] }, "LOCAL_ONLY", local), (error) => error.code === "FLEET_DRIVERS_SCHEMA_UNAVAILABLE");
  }
  for (const override of [{ checksum: "wrong" }, { finished_at: null }, { rolled_back_at: new Date() }, { applied_steps_count: 0 }]) {
    let calls = 0; await assert.rejects(() => assertFleetDriversDatabase({ $queryRaw: async () => ++calls === 1 ? [base] : calls === 2 ? [tables] : [{ ...history, ...override }] }, "LOCAL_ONLY", local), (error) => error.code === "FLEET_DRIVERS_SCHEMA_UNAVAILABLE");
  }
  let calls = 0; await assertFleetDriversDatabase({ $queryRaw: async () => ++calls === 1 ? [base] : calls === 2 ? [tables] : [history] }, "LOCAL_ONLY", local);
});
