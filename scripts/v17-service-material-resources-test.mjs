import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { listServiceMaterialResources, normalizeMaterialPoliciesQuery } from "../api/_lib/serviceMaterialResources.js";
import { createCrmServicesHandler } from "../api/_lib/crmServicesHttp.js";
import { executeMaterialPoliciesRequest } from "../api/crm/services/material-policies/index.js";

let checks = 0;
const pass = (name, test) => { test(); checks += 1; process.stdout.write(`PASS ${name}\n`); };
const reject = async (name, run, code) => {
  await assert.rejects(run, (error) => error.code === code);
  checks += 1;
  process.stdout.write(`PASS ${name}\n`);
};
const context = { tenantId: "resources_tenant", membershipId: "resources_editor", userId: "resources_user" };
const VIEW = "services:materials:view";
const MANAGE = "services:materials:manage";
const editor = { id: context.membershipId, user_id: context.userId, role: "V", membership_status: "ACTIVE", user_status: "ACTIVE", tenant_status: "ACTIVE", granted_permissions: [VIEW, MANAGE], denied_permissions: [] };
const resource = (kind, position, overrides = {}) => ({
  tenantId: context.tenantId, status: "ACTIVE", code: `${kind === "MATERIAL" ? "M" : "A"}${String(position).padStart(4, "0")}`,
  name: `${kind === "MATERIAL" ? "Cartón" : "Contenedor"} ${position}`, family: "Embalaje",
  ...(kind === "MATERIAL" ? { materialRef: randomUUID() } : { modelRef: randomUUID() }),
  id: `private_${position}`, stock: 999, amount: 321, acquisitionCost: 777, ...overrides,
});

function database({ materials = [], assets = [], actor = editor, error = null } = {}) {
  const calls = [];
  const read = (kind, data) => async (query) => {
    calls.push({ kind, query });
    assert.equal(query.where.tenantId, context.tenantId);
    assert.equal(query.where.status, "ACTIVE");
    assert.deepEqual(Object.keys(query.select).sort(), ["code", "family", kind === "MATERIAL" ? "materialRef" : "modelRef", "name"].sort());
    assert.ok(query.take > 0 && query.take <= 101);
    const search = query.where.OR?.[0].code.contains.toLocaleLowerCase("es");
    const filtered = data.filter((row) => row.tenantId === query.where.tenantId && row.status === query.where.status
      && (!query.where.code?.gt || row.code > query.where.code.gt)
      && (!search || row.code.toLocaleLowerCase("es").includes(search) || row.name.toLocaleLowerCase("es").includes(search)))
      .sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0).slice(0, query.take);
    return filtered.map((row) => Object.fromEntries(Object.keys(query.select).map((key) => [key, row[key]])));
  };
  return {
    calls,
    async $transaction(work) {
      if (error) throw error;
      return work({
        $executeRawUnsafe: async () => 0,
        $queryRaw: async (query) => {
          assert.deepEqual(query.values, [context.tenantId, context.membershipId, context.userId]);
          assert.match(query.strings.join("?"), /JOIN "osi"\."osi_users"[\s\S]*JOIN "osi"\."tenants"/);
          return actor ? [actor] : [];
        },
        materialCatalogItem: { findMany: read("MATERIAL", materials) },
        assetModel: { findMany: read("ASSET", assets) },
      });
    },
  };
}

pass("consulta de políticas existente no cambia", () => assert.deepEqual(normalizeMaterialPoliciesQuery({}), { view: "policies" }));
for (const query of [{ view: "all" }, { view: ["resources"] }, { view: "resources", tenantId: "foreign" }, { view: "resources", kind: "VEHICLE" }, { view: "resources", search: ["cartón"] }, { view: "resources", cursor: "%%%" }, { view: "resources", search: "x".repeat(101) }]) {
  pass("consulta cerrada rechaza datos fuera del contrato", () => assert.throws(() => normalizeMaterialPoliciesQuery(query), /SERVICE_PACKAGES_QUERY_INVALID/));
}

const materialRows = Array.from({ length: 137 }, (_, index) => resource("MATERIAL", index));
const assetRows = Array.from({ length: 116 }, (_, index) => resource("ASSET", index));
const db = database({ materials: [...materialRows, resource("MATERIAL", 999, { tenantId: "other_tenant" }), resource("MATERIAL", 998, { status: "INACTIVE" })], assets: [...assetRows, resource("ASSET", 999, { tenantId: "other_tenant" }), resource("ASSET", 998, { status: "INACTIVE" })] });
const pages = [];
let cursor;
do {
  const page = await listServiceMaterialResources(context, { view: "resources", ...(cursor ? { cursor } : {}) }, db);
  pages.push(page);
  cursor = page.nextCursor;
} while (cursor);
const all = pages.flatMap((page) => page.items);
pass("paginación completa cruza materiales y activos sin truncar ni duplicar", () => {
  assert.deepEqual(pages.map((page) => page.items.length), [100, 100, 53]);
  assert.equal(all.length, 253);
  assert.equal(new Set(all.map((item) => `${item.kind}:${item.resourceRef}`)).size, 253);
  assert.deepEqual(all.slice(0, 137).map((item) => item.code), materialRows.map((item) => item.code));
  assert.deepEqual(all.slice(137).map((item) => item.code), assetRows.map((item) => item.code));
});
pass("DTO mínimo sin importes, stock ni identidad privada", () => {
  assert.deepEqual(Object.keys(all[0]).sort(), ["code", "family", "kind", "name", "resourceRef"]);
  assert.doesNotMatch(JSON.stringify(all), /private_|other_tenant|tenantId|acquisitionCost|stock|amount/);
});
pass("recursos inactivos y de otras empresas no se incluyen", () => assert.equal(all.some((item) => /099[89]$/.test(item.code)), false));
const search = await listServiceMaterialResources(context, { view: "resources", kind: "ASSET", search: "CONTENEDOR 11" }, db);
pass("búsqueda por nombre insensible a mayúsculas y tipo", () => { assert.equal(search.items.length, 7); assert.ok(search.items.every((item) => item.kind === "ASSET")); });
const codeSearch = await listServiceMaterialResources(context, { view: "resources", search: "m0003" }, db);
pass("búsqueda también encuentra el código", () => assert.equal(codeSearch.items[0].code, "M0003"));
await reject("cursor no sirve para otra búsqueda", () => listServiceMaterialResources(context, { view: "resources", search: "changed", cursor: pages[0].nextCursor }, db), "SERVICE_PACKAGES_QUERY_INVALID");
await reject("cursor no sirve para otro filtro de tipo", () => listServiceMaterialResources(context, { view: "resources", kind: "ASSET", cursor: pages[0].nextCursor }, db), "SERVICE_PACKAGES_QUERY_INVALID");
const empty = await listServiceMaterialResources(context, { view: "resources" }, database());
pass("página vacía termina explícitamente", () => assert.deepEqual(empty, { items: [], nextCursor: null }));
const unicodeSearch = "材".repeat(100);
const unicodeDb = database({ materials: materialRows.map((row) => ({ ...row, name: unicodeSearch })) });
const unicodePage = await listServiceMaterialResources(context, { view: "resources", search: unicodeSearch }, unicodeDb);
const unicodeLast = await listServiceMaterialResources(context, { view: "resources", search: unicodeSearch, cursor: unicodePage.nextCursor }, unicodeDb);
pass("cursor conserva búsquedas Unicode en todas las páginas", () => assert.equal(unicodePage.items.length + unicodeLast.items.length, 137));

for (const actor of [
  { ...editor, granted_permissions: [VIEW] },
  { ...editor, granted_permissions: [MANAGE] },
  { ...editor, denied_permissions: [MANAGE] },
  { ...editor, denied_permissions: [VIEW] },
  { ...editor, role: "J" },
  { ...editor, membership_status: "INACTIVE" },
  { ...editor, user_status: "INACTIVE" },
  { ...editor, tenant_status: "INACTIVE" },
]) {
  const blocked = database({ materials: materialRows, actor });
  await reject("actor actual sin autorización no consulta recursos", () => listServiceMaterialResources(context, { view: "resources" }, blocked), "SERVICE_PACKAGES_PERMISSION_FORBIDDEN");
  assert.equal(blocked.calls.length, 0);
}
await reject("membresía inexistente no se acepta", () => listServiceMaterialResources(context, { view: "resources" }, database({ actor: null })), "SERVICE_PACKAGES_RESOURCE_NOT_FOUND");
const revocable = { ...editor };
const revocationDb = database({ materials: materialRows, actor: revocable });
const beforeRevocation = await listServiceMaterialResources(context, { view: "resources" }, revocationDb);
revocable.denied_permissions = [MANAGE];
await reject("revocación entre páginas se comprueba antes de leer más recursos", () => listServiceMaterialResources(context, { view: "resources", cursor: beforeRevocation.nextCursor }, revocationDb), "SERVICE_PACKAGES_PERMISSION_FORBIDDEN");
await reject("contexto inválido no llega a catálogos", () => listServiceMaterialResources({ ...context, tenantId: undefined }, { view: "resources" }, database()), "SERVICE_PACKAGES_RESOURCE_NOT_FOUND");
await reject("fallo de base no produce catálogo parcial", () => listServiceMaterialResources(context, { view: "resources" }, database({ error: new Error("offline") })), "SERVICE_PACKAGES_DATABASE_UNAVAILABLE");

function request({ method = "GET", query = { view: "resources" }, headers = {} } = {}) {
  return { method, query, headers: { host: "127.0.0.1:4173", ...headers }, rawHeaders: [], socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1", encrypted: false } };
}
function response() {
  const headers = new Map();
  return { statusCode: 200, body: null, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, getHeader(name) { return headers.get(name.toLowerCase()); }, removeHeader(name) { headers.delete(name.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } };
}
let authCalls = 0;
const handler = (env) => createCrmServicesHandler({ env, methods: ["GET", "POST"], prismaClient: db, resolveContext: async () => { authCalls += 1; return context; }, execute: executeMaterialPoliciesRequest });
const local = handler({ CRM_SERVICES_API_MODE: "LOCAL_ONLY" });
let res = response();
await handler({})(request(), res);
pass("gate inactivo bloquea antes de autenticación", () => { assert.equal(res.statusCode, 409); assert.equal(authCalls, 0); });
res = response();
await local(request({ headers: { origin: "https://other.invalid" } }), res);
pass("origen ajeno bloquea antes de autenticación", () => { assert.equal(res.statusCode, 403); assert.equal(authCalls, 0); });
res = response();
await local(request(), res);
pass("ruta real entrega sobre público y headers privados", () => {
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.items.length, 100);
  assert.equal(res.getHeader("cache-control"), "private, no-store");
  assert.match(String(res.getHeader("vary")), /Authorization/);
  assert.match(String(res.getHeader("vary")), /Origin/);
  assert.equal(res.getHeader("access-control-allow-origin"), undefined);
});
res = response();
await local(request({ method: "HEAD" }), res);
pass("HEAD conserva autorización y omite cuerpo", () => { assert.equal(res.statusCode, 200); assert.equal(res.body, null); });
res = response();
await local(request({ query: { view: "resources", tenantId: "other" } }), res);
pass("ruta rechaza selector de otra empresa", () => { assert.equal(res.statusCode, 400); assert.equal(res.body.error, "SERVICE_PACKAGES_QUERY_INVALID"); });
await reject("vista recursos nunca acepta escritura", async () => executeMaterialPoliciesRequest({ req: request({ method: "POST" }), context, prisma: db, method: "POST" }), "SERVICE_PACKAGES_QUERY_INVALID");
process.stdout.write(`${JSON.stringify({ ok: true, checks, resources: all.length, pages: pages.length, syntheticOnly: true })}\n`);
