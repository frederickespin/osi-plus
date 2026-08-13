import assert from "node:assert/strict";
import { createCipheriv, hkdfSync } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  issueCrmOwnerRef, issueCrmOwnerRefs, readCrmOwnerRef, CRM_OWNER_REF_AUDIENCE, CRM_OWNER_REF_CLOCK_SKEW_SECONDS,
  CRM_OWNER_REF_HKDF_INFO, CRM_OWNER_REF_TTL_SECONDS,
} from "../api/_lib/crmOwnerRef.js";
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
const encoded = (value) => Buffer.from(value).toString("base64url");
function forgedOwnerRef(payload, { secret = SECRET, prefix = "or1", iv = Buffer.alloc(12, 7) } = {}) {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from("osi-plus/crm/pipeline-owner-ref/salt/v1", "utf8"), Buffer.from(CRM_OWNER_REF_HKDF_INFO, "utf8"), 32));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${prefix}.${CRM_OWNER_REF_AUDIENCE}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), "utf8")), cipher.final()]);
  return `${prefix}.${encoded(iv)}.${encoded(ciphertext)}.${encoded(cipher.getAuthTag())}`;
}
function payload(overrides = {}) {
  return { v: 1, aud: CRM_OWNER_REF_AUDIENCE, tenantId: "tenant-a", membershipId: "m", userId: "u", iat: 1_000, exp: 1_300, ...overrides };
}

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

test("secreto ausente, vacío, débil o con representación ambigua falla cerrado", async () => {
  const invalidEnvironments = [
    {}, { JWT_SECRET: "" }, { JWT_SECRET: "short" }, { JWT_SECRET: "dev-insecure-secret" },
    { JWT_SECRET: ` ${SECRET}` }, { JWT_SECRET: `${SECRET}\n` }, { JWT_SECRET: `\ufeff${SECRET}` },
  ];
  for (const env of invalidEnvironments) {
    await rejected(() => Promise.resolve(issueCrmOwnerRef({ tenantId: "tenant-a", membershipId: "m", userId: "u" }, { env })), "CRM_PIPELINE_CONFIGURATION_INVALID", 503);
  }
});

test("payload autenticado rechaza versión, audience, tiempo futuro y claves desconocidas", async () => {
  for (const candidate of [
    payload({ v: 2 }), payload({ aud: "crm:other" }), payload({ iat: 1_031, exp: 1_331 }),
    payload({ exp: 1_301 }), { ...payload(), extra: "forbidden" },
  ]) {
    await rejected(() => Promise.resolve(readCrmOwnerRef(forgedOwnerRef(candidate), { env: ENV, now: () => 1_000_000 })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
  }
});

test("límites temporales aceptan skew exacto y distinguen inválido de expirado", async () => {
  const ref = forgedOwnerRef(payload());
  assert.equal(readCrmOwnerRef(ref, { env: ENV, now: () => (1_000 - CRM_OWNER_REF_CLOCK_SKEW_SECONDS) * 1_000 }).membershipId, "m");
  await rejected(() => Promise.resolve(readCrmOwnerRef(ref, { env: ENV, now: () => (999 - CRM_OWNER_REF_CLOCK_SKEW_SECONDS) * 1_000 })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
  assert.equal(readCrmOwnerRef(ref, { env: ENV, now: () => (1_300 + CRM_OWNER_REF_CLOCK_SKEW_SECONDS) * 1_000 }).membershipId, "m");
  await rejected(() => Promise.resolve(readCrmOwnerRef(ref, { env: ENV, now: () => (1_301 + CRM_OWNER_REF_CLOCK_SKEW_SECONDS) * 1_000 })), "CRM_PIPELINE_OWNER_REF_EXPIRED", 409);
});

test("formato por bytes rechaza segmentos truncados, añadidos, no canónicos y alterados", async () => {
  const ref = issueCrmOwnerRef({ tenantId: "tenant-a", membershipId: "m", userId: "u" }, { env: ENV, now: () => 1_000_000 });
  const [prefix, iv, ciphertext, tag] = ref.split(".");
  const candidates = [
    "", "x".repeat(1_025), `${prefix}.${iv}.${ciphertext}`, `${ref}.extra`,
    `${prefix}.${iv.slice(1)}.${ciphertext}.${tag}`, `${prefix}.${iv}.${ciphertext.slice(1)}.${tag}`,
    `${prefix}.${iv}.${ciphertext}.${tag.slice(1)}`, `${prefix}.${iv}=.${ciphertext}.${tag}`,
    `${prefix}.${iv}.${ciphertext}.${tag.slice(0, -1)}${tag.at(-1) === "A" ? "B" : "A"}`,
  ];
  for (const candidate of candidates) {
    await rejected(() => Promise.resolve(readCrmOwnerRef(candidate, { env: ENV, now: () => 1_000_000 })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
  }
});

test("replay criptográfico es estable y rotar JWT_SECRET invalida referencias previas", async () => {
  const identity = { tenantId: "tenant-a", membershipId: "m", userId: "u" };
  const ref = issueCrmOwnerRef(identity, { env: ENV, now: () => 1_000_000 });
  assert.deepEqual(readCrmOwnerRef(ref, { env: ENV, now: () => 1_000_000 }), readCrmOwnerRef(ref, { env: ENV, now: () => 1_000_000 }));
  const rotated = { ...ENV, JWT_SECRET: `${SECRET}rotated` };
  await rejected(() => Promise.resolve(readCrmOwnerRef(ref, { env: rotated, now: () => 1_000_000 })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
  assert.equal(readCrmOwnerRef(issueCrmOwnerRef(identity, { env: rotated, now: () => 1_000_000 }), { env: rotated, now: () => 1_000_000 }).membershipId, "m");
});

test("tormenta de referencias inválidas queda acotada en tiempo y memoria", async () => {
  const before = process.memoryUsage().heapUsed;
  const started = performance.now();
  for (let index = 0; index < 5_000; index += 1) {
    await rejected(() => Promise.resolve(readCrmOwnerRef(`or1.${"A".repeat(index % 13 + 1)}.bad.bad`, { env: ENV })), "CRM_PIPELINE_OWNER_REF_INVALID", 400);
  }
  const elapsed = performance.now() - started;
  const growth = process.memoryUsage().heapUsed - before;
  assert.ok(elapsed < 1_500, `invalid refs ${elapsed.toFixed(2)}ms`);
  assert.ok(growth < 32 * 1024 * 1024, `heap growth ${growth}`);
});

test("ownerRef expirado tiene contrato 409 exacto", async () => {
  const ref = issueCrmOwnerRef({ tenantId: "tenant-a", membershipId: "m", userId: "u" }, { env: ENV, now: () => 1_000_000 });
  const afterSkew = 1_000_000 + (CRM_OWNER_REF_TTL_SECONDS + 31) * 1_000;
  await rejected(() => Promise.resolve(readCrmOwnerRef(ref, { env: ENV, now: () => afterSkew })), "CRM_PIPELINE_OWNER_REF_EXPIRED", 409);
});

test("catálogo devuelve sólo contrato público en una consulta acotada", async () => {
  let queries = 0;
  const prisma = { async $queryRaw() { queries += 1; return [
    { membership_id: "m-1", user_id: "u-1", display_name: "Ana Vendedora", total: 2, ambiguous: false },
    { membership_id: "m-2", user_id: "u-2", display_name: "Zoë Vendedora", total: 2, ambiguous: false },
  ]; } };
  const result = await listCrmPipelineOwnerOptions(ADMIN, { page: "1", pageSize: "100" }, { prisma, env: ENV, now: () => 1_000_000 });
  assert.equal(queries, 1);
  assert.equal(result.total, 2);
  assert.deepEqual(Object.keys(result.data[0]).sort(), ["displayName", "ownerRef", "role"]);
  assert.equal(JSON.stringify(result).includes("m-1"), false);
  assert.equal(JSON.stringify(result).includes("u-1"), false);
});

test("catálogo ambiguo bloquea todo el tenant antes de paginar", async () => {
  let queries = 0;
  const prisma = { async $queryRaw() { queries += 1; return [{ membership_id: null, user_id: null, display_name: null, total: 0, ambiguous: true }]; } };
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
  const optionsRes = response();
  const corsHandler = createCrmOwnerCatalogHandler({ env: { ...ENV, MT01B_ALLOWED_ORIGINS: "http://localhost:5173" }, prismaClient: {}, resolveContext: async () => ADMIN, listOptions: async () => ({ total: 0, page: 1, pageSize: 25, data: [] }) });
  await corsHandler(request({ method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-method": "GET", "access-control-request-headers": "Authorization" } }), optionsRes);
  assert.equal(optionsRes.statusCode, 204);
  assert.equal(optionsRes.getHeader("access-control-allow-origin"), "http://localhost:5173");
  assert.notEqual(optionsRes.getHeader("access-control-allow-origin"), "*");
});

test("catálogo rechaza paginación y búsqueda abusivas antes de consultar SQL", async () => {
  let queries = 0;
  const prisma = { async $queryRaw() { queries += 1; return []; } };
  const invalidQueries = [
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "100001" },
    { pageSize: "0" }, { pageSize: "101" }, { pageSize: "many" },
    { q: "" }, { q: " spaced " }, { q: "line\nbreak" }, { q: "x".repeat(3 * 1024 * 1024) },
    { unexpected: "value" },
  ];
  for (const query of invalidQueries) {
    await rejected(() => listCrmPipelineOwnerOptions(ADMIN, query, { prisma, env: ENV }), "CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  assert.equal(queries, 0);
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

test("emisión en lote deriva una clave por catálogo y conserva IVs únicos", () => {
  const refs = issueCrmOwnerRefs(Array.from({ length: 100 }, (_, index) => ({ tenantId: "tenant-a", membershipId: `m-${index}`, userId: `u-${index}` })), { env: ENV });
  assert.equal(refs.length, 100);
  assert.equal(new Set(refs.map((ref) => ref.split(".")[1])).size, 100);
  assert.equal(readCrmOwnerRef(refs[99], { env: ENV }).membershipId, "m-99");
});

for (const item of tests) {
  await item.run();
}
process.stdout.write(`${JSON.stringify({ ok: true, assertions: tests.length, results: tests.map((item) => ({ name: item.name, passed: true })) }, null, 2)}\n`);
