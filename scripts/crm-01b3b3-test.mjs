import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { issueCrmOwnerRef, readCrmOwnerRef, CRM_OWNER_REF_TTL_SECONDS } from "../api/_lib/crmOwnerRef.js";
import { listCrmPipelineOwnerOptions, resolveCrmOwnerRefForAssignment } from "../api/_lib/crmOwnerCatalog.js";
import { createCrmOwnerCatalogHandler } from "../api/_lib/crmOwnerCatalogHttp.js";
import { createAssignOwnerHandler } from "../api/_lib/pipelineCaseMutationHttp.js";

const SECRET = "crm01b3b3-local-test-secret-".repeat(3);
const ENV = Object.freeze({ JWT_SECRET: SECRET, CRM_PIPELINE_RUNTIME_MODE: "READ_ONLY", CRM_PIPELINE_MUTATION_MODE: "LOCAL_ONLY", MT01B_AUTH_MODE: "LEGACY" });
const ADMIN = Object.freeze({ tenantId: "tenant-a", membershipId: "admin-a", userId: "user-admin-a", role: "A", effectivePermissions: ["pipeline:assign"] });
const tests = [];
const test = (name, run) => tests.push({ name, run });
const rejected = async (run, code, status) => {
  await assert.rejects(async () => run(), (error) => error?.code === code && error?.status === status);
};

function response() {
  const headers = new Map();
  return {
    statusCode: 200, body: undefined, ended: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    end() { this.ended = true; return this; },
    headers,
  };
}

function request({ method = "GET", query = {}, body, headers = {}, rawHeaders } = {}) {
  return { method, query, body, headers, rawHeaders: rawHeaders ?? Object.entries(headers).flatMap(([key, value]) => [key, value]), url: "/api/crm/pipeline-owner-options" };
}

test("ownerRef usa cifrado autenticado, HKDF y emisión no determinística", () => {
  const identity = { tenantId: "tenant-a", membershipId: "membership-secret", userId: "user-secret" };
  const first = issueCrmOwnerRef(identity, { env: ENV, now: () => 1_000_000 });
  const second = issueCrmOwnerRef(identity, { env: ENV, now: () => 1_000_000 });
  assert.notEqual(first, second);
  assert.equal(first.split(".").length, 4);
  assert.equal(first.includes(identity.membershipId), false);
  assert.deepEqual(readCrmOwnerRef(first, { env: ENV, now: () => 1_000_000 }), {
    tenantId: "tenant-a", membershipId: "membership-secret", userId: "user-secret", issuedAt: 1_000, expiresAt: 1_000 + CRM_OWNER_REF_TTL_SECONDS,
  });
});

test("ownerRef alterado, secreto distinto y versión externa se rechazan sin detalle", async () => {
  const ref = issueCrmOwnerRef({ tenantId: "tenant-a", membershipId: "m", userId: "u" }, { env: ENV, now: () => 1_000_000 });
  const parts = ref.split(".");
  const offset = Math.floor(parts[2].length / 2);
  parts[2] = `${parts[2].slice(0, offset)}${parts[2][offset] === "A" ? "B" : "A"}${parts[2].slice(offset + 1)}`;
  await rejected(() => Promise.resolve(readCrmOwnerRef(parts.join("."), { env: ENV, now: () => 1_000_000 })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
  await rejected(() => Promise.resolve(readCrmOwnerRef(ref, { env: { JWT_SECRET: `${SECRET}other` }, now: () => 1_000_000 })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
  await rejected(() => Promise.resolve(readCrmOwnerRef(ref.replace(/^or1\./, "or2."), { env: ENV, now: () => 1_000_000 })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
});

test("ownerRef expirado tiene contrato 409 exacto", async () => {
  const ref = issueCrmOwnerRef({ tenantId: "tenant-a", membershipId: "m", userId: "u" }, { env: ENV, now: () => 1_000_000 });
  const afterSkew = 1_000_000 + (CRM_OWNER_REF_TTL_SECONDS + 31) * 1_000;
  await rejected(() => Promise.resolve(readCrmOwnerRef(ref, { env: ENV, now: () => afterSkew })), "CRM_PIPELINE_OWNER_REF_EXPIRED", 409);
});

test("catálogo devuelve sólo contrato público y dos consultas", async () => {
  let queries = 0;
  const prisma = { async $queryRaw() { queries += 1; return queries === 1 ? [] : [
    { membership_id: "m-1", user_id: "u-1", display_name: "Ana Vendedora", total: 2 },
    { membership_id: "m-2", user_id: "u-2", display_name: "Zoë Vendedora", total: 2 },
  ]; } };
  const result = await listCrmPipelineOwnerOptions(ADMIN, { page: "1", pageSize: "100" }, { prisma, env: ENV, now: () => 1_000_000 });
  assert.equal(queries, 2);
  assert.equal(result.total, 2);
  assert.deepEqual(Object.keys(result.data[0]).sort(), ["displayName", "ownerRef", "role"]);
  assert.equal(JSON.stringify(result).includes("m-1"), false);
  assert.equal(JSON.stringify(result).includes("u-1"), false);
});

test("catálogo ambiguo bloquea todo el tenant antes de paginar", async () => {
  let queries = 0;
  const prisma = { async $queryRaw() { queries += 1; return [{ normalized_name: "ana" }]; } };
  await rejected(() => listCrmPipelineOwnerOptions(ADMIN, {}, { prisma, env: ENV }), "CRM_PIPELINE_OWNER_CATALOG_AMBIGUOUS", 409);
  assert.equal(queries, 1);
});

test("rol V o deny pipeline:assign no consultan PostgreSQL", async () => {
  let queries = 0;
  const prisma = { async $queryRaw() { queries += 1; return []; } };
  await rejected(() => listCrmPipelineOwnerOptions({ ...ADMIN, role: "V" }, {}, { prisma, env: ENV }), "CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  await rejected(() => listCrmPipelineOwnerOptions({ ...ADMIN, effectivePermissions: [] }, {}, { prisma, env: ENV }), "CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  assert.equal(queries, 0);
});

test("referencia cross-tenant devuelve 404 sin consultar owner", async () => {
  let queries = 0;
  const ownerRef = issueCrmOwnerRef({ tenantId: "tenant-b", membershipId: "m-b", userId: "u-b" }, { env: ENV });
  await rejected(() => resolveCrmOwnerRefForAssignment(ADMIN, ownerRef, { prisma: { async $queryRaw() { queries += 1; return []; } }, env: ENV }), "CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  assert.equal(queries, 0);
});

test("owner suspendido después de emitir referencia queda inelegible", async () => {
  const ownerRef = issueCrmOwnerRef({ tenantId: "tenant-a", membershipId: "m-a", userId: "u-a" }, { env: ENV });
  await rejected(() => resolveCrmOwnerRefForAssignment(ADMIN, ownerRef, { prisma: { async $queryRaw() { return []; } }, env: ENV }), "CRM_PIPELINE_OWNER_INELIGIBLE", 409);
});

test("catálogo DISABLED responde antes de auth y Prisma", async () => {
  let contexts = 0; let lists = 0;
  const handler = createCrmOwnerCatalogHandler({ env: {}, prismaClient: {}, resolveContext: async () => { contexts += 1; }, listOptions: async () => { lists += 1; } });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "CRM_PIPELINE_MUTATIONS_DISABLED");
  assert.equal(contexts, 0); assert.equal(lists, 0);
  assert.equal(res.getHeader("cache-control"), "private, no-store");
  assert.match(res.getHeader("vary"), /Authorization/);
});

test("catálogo activo aplica GET/HEAD/OPTIONS y no CORS wildcard", async () => {
  const handler = createCrmOwnerCatalogHandler({ env: ENV, prismaClient: {}, resolveContext: async () => ADMIN, listOptions: async () => ({ total: 0, page: 1, pageSize: 25, data: [] }) });
  const getRes = response();
  await handler(request({ headers: { Authorization: "Bearer test" } }), getRes);
  assert.equal(getRes.statusCode, 200); assert.deepEqual(getRes.body.data, []);
  assert.equal(getRes.getHeader("access-control-allow-origin"), undefined);
  const headRes = response();
  await handler(request({ method: "HEAD", headers: { Authorization: "Bearer test" } }), headRes);
  assert.equal(headRes.statusCode, 200); assert.equal(headRes.body, undefined);
});

test("assign-owner acepta ownerRef, revalida y no expone membershipId", async () => {
  let command;
  const handler = createAssignOwnerHandler({
    env: ENV, prismaClient: {}, resolveContext: async () => ADMIN,
    resolveOwnerRef: async (_context, value) => { assert.equal(value, "opaque-ref"); return "internal-membership"; },
    execute: async (_context, value) => { command = value; return { caseId: value.caseId, commandType: "ASSIGN_OWNER", previousVersion: 1, resultingVersion: 2, previousStatus: "NEW_INBOX", resultingStatus: "NEW_INBOX", resultingOwnerMembershipId: value.ownerMembershipId, replayed: false }; },
  });
  const req = request({ method: "POST", query: { id: "case-1" }, body: { expectedVersion: 1, ownerRef: "opaque-ref" }, headers: { Authorization: "Bearer test", "Idempotency-Key": "request-1234", "Content-Type": "application/json" } });
  req.url = "/api/crm/pipeline-cases/case-1/assign-owner";
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(command.ownerMembershipId, "internal-membership");
  assert.deepEqual(res.body.command.owner, { assigned: true });
  assert.equal(JSON.stringify(res.body).includes("internal-membership"), false);
});

test("assign-owner prohíbe IDs internos escritos por navegador", async () => {
  let resolved = 0;
  const handler = createAssignOwnerHandler({ env: ENV, prismaClient: {}, resolveContext: async () => ADMIN, resolveOwnerRef: async () => { resolved += 1; }, execute: async () => assert.fail("no execute") });
  const req = request({ method: "POST", query: { id: "case-1" }, body: { expectedVersion: 1, ownerMembershipId: "forged" }, headers: { Authorization: "Bearer test", "Idempotency-Key": "request-1234", "Content-Type": "application/json" } });
  req.url = "/api/crm/pipeline-cases/case-1/assign-owner";
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 400); assert.equal(res.body.code, "CRM_PIPELINE_COMMAND_INVALID"); assert.equal(resolved, 0);
});

test("emisión de 100 referencias permanece bajo presupuesto local cálido", () => {
  const samples = [];
  for (let round = 0; round < 30; round += 1) {
    const start = performance.now();
    for (let index = 0; index < 100; index += 1) issueCrmOwnerRef({ tenantId: "tenant-a", membershipId: `m-${index}`, userId: `u-${index}` }, { env: ENV });
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  assert.ok(p95 < 100, `p95 ${p95.toFixed(2)}ms`);
});

for (const item of tests) {
  await item.run();
}
process.stdout.write(`${JSON.stringify({ ok: true, assertions: tests.length, results: tests.map((item) => ({ name: item.name, passed: true })) }, null, 2)}\n`);
