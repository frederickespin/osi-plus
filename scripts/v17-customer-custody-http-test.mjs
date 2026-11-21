import assert from "node:assert/strict";
import test from "node:test";
import { readActiveArticleCatalog } from "../api/_lib/articleCatalog.js";
import { createCustomerCustodyHandler } from "../api/_lib/customerCustodyHttp.js";

const env = { CUSTOMER_CUSTODY_API_MODE: "PREVIEW_REHEARSAL", CUSTOMER_CUSTODY_API_BATCH: "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/v17-storage-commercial-contract-22a", MT01B_AUTH_MODE: "LEGACY", MT01B_TENANT_SWITCH_ENABLED: "false", VITE_MT01B2_CLIENT_ENABLED: "false" };
function response() { return { code: 200, body: null, headers: {}, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; }, end() { return this; }, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, getHeader(name) { return this.headers[name.toLowerCase()]; }, removeHeader(name) { delete this.headers[name.toLowerCase()]; } }; }
function request(method = "GET") { return { method, headers: {}, socket: {}, query: {}, on() {}, [Symbol.asyncIterator]: async function* () {} }; }
test("custody reads the active tenant article catalog with volume and no fixed weights", async () => {
  const article = { articleRef: "article-1", code: "ART-001", name: "Sofá", aliases: ["Mueble"], defaultVolumeM3: "1.8", defaultWeightKg: "43" };
  const database = { surveyCatalogVersion: {
    async findFirst(args) {
      assert.deepEqual(args.where, { tenantId: "tenant-1", status: "ACTIVE" });
      assert.deepEqual(args.select.articles.where, { status: "ACTIVE" });
      assert.equal(args.select.articles.select.defaultWeightKg, undefined);
      return { version: 3, articles: [article] };
    },
  } };
  assert.deepEqual(await readActiveArticleCatalog(database, "tenant-1"), {
    version: 3, articles: [{ articleRef: "article-1", code: "ART-001", name: "Sofá", aliases: ["Mueble"], defaultVolumeM3: 1.8 }],
  });
  assert.equal(await readActiveArticleCatalog({ surveyCatalogVersion: { findFirst: async () => null } }, "tenant-1"), null);
});
test("denied permission blocks before domain execution", async () => { let calls = 0; const handler = createCustomerCustodyHandler({ env, prismaClient: {}, methods: ["GET"], permission: "customer-custody:view", resolveContext: async () => ({ effectivePermissions: ["customer-custody:view"], deniedPermissions: ["customer-custody:view"] }), execute: async () => { calls += 1; } }); const res = response(); await handler(request(), res); assert.equal(res.code, 403); assert.equal(res.body.error, "CUSTOMER_CUSTODY_FORBIDDEN"); assert.equal(calls, 0); });
test("authorized read reaches domain and remains private", async () => { const handler = createCustomerCustodyHandler({ env, prismaClient: {}, methods: ["GET"], permission: "customer-custody:view", resolveContext: async () => ({ effectivePermissions: ["customer-custody:view"], deniedPermissions: [] }), execute: async () => ["ok"] }); const res = response(); await handler(request(), res); assert.equal(res.code, 200); assert.deepEqual(res.body, { ok: true, data: ["ok"] }); assert.match(res.headers["cache-control"], /no-store/); });
test("commercial authorization accepts either explicit custody or case authority", async () => { const handler = createCustomerCustodyHandler({ env, prismaClient: {}, methods: ["POST"], permission: ["customer-custody:authorize", "services:case:update"], resolveContext: async () => ({ effectivePermissions: ["services:case:update"], deniedPermissions: [] }), normalize: (value) => value, execute: async ({ input }) => input }); const res = response(); const req = request("POST"); req.headers["content-type"] = "application/json"; req[Symbol.asyncIterator] = async function* () { yield Buffer.from('{"authorizationType":"ENTRY"}'); }; await handler(req, res); assert.equal(res.code, 201); assert.deepEqual(res.body, { ok: true, data: { authorizationType: "ENTRY" } }); });
test("unknown methods are rejected without reading a body", async () => { const handler = createCustomerCustodyHandler({ env, prismaClient: {}, methods: ["GET"], permission: "customer-custody:view", resolveContext: async () => { throw new Error("must not authenticate"); }, execute: async () => null }); const res = response(); await handler(request("DELETE"), res); assert.equal(res.code, 405); });
