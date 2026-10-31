import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { PERMS, permsForRole } from "./rbac.js";
import { CrmServicesError } from "./crmServicesContract.js";

const PAGE_SIZE = 100;
const KINDS = Object.freeze(["MATERIAL", "ASSET"]);
const fail = (code = "SERVICE_PACKAGES_QUERY_INVALID", status = 400) => { throw new CrmServicesError(code, status); };
const scalar = (value, maximum) => {
  if (typeof value !== "string" || value.length > maximum || value !== value.trim()) fail();
  return value;
};

function readCursor(value, kind, search) {
  if (value === undefined) return null;
  const text = scalar(value, 2048);
  if (!/^[A-Za-z0-9_-]+$/.test(text)) fail();
  let cursor;
  try {
    const bytes = Buffer.from(text, "base64url");
    if (bytes.toString("base64url") !== text) fail();
    cursor = JSON.parse(bytes.toString("utf8"));
  } catch { fail(); }
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)
      || Object.keys(cursor).sort().join(",") !== "code,filter,kind,search,v"
      || cursor.v !== 1 || !KINDS.includes(cursor.kind)
      || (kind !== null && cursor.kind !== kind)
      || cursor.filter !== kind || cursor.search !== search
      || typeof cursor.code !== "string" || !cursor.code || cursor.code.length > 64) fail();
  return Object.freeze({ kind: cursor.kind, code: cursor.code });
}

export function normalizeMaterialPoliciesQuery(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  const keys = Object.keys(raw);
  if (!keys.length) return Object.freeze({ view: "policies" });
  if (keys.some((key) => !["view", "kind", "search", "cursor"].includes(key)) || raw.view !== "resources") fail();
  const kind = raw.kind === undefined ? null : scalar(raw.kind, 8);
  if (kind !== null && !KINDS.includes(kind)) fail();
  const search = raw.search === undefined ? "" : scalar(raw.search, 100);
  return Object.freeze({ view: "resources", kind, search, cursor: readCursor(raw.cursor, kind, search) });
}

async function policyEditor(tx, context) {
  for (const key of ["tenantId", "membershipId", "userId"]) {
    if (typeof context?.[key] !== "string" || !context[key] || context[key].length > 191) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
  }
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."user_id",m."role"::text AS role,m."status"::text AS membership_status,
      m."granted_permissions",m."denied_permissions",u."status" AS user_status,t."status"::text AS tenant_status
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${context.tenantId} AND m."id"=${context.membershipId} AND m."user_id"=${context.userId}
    LIMIT 1 FOR SHARE OF m,u,t`);
  const row = rows[0];
  if (!row) fail("SERVICE_PACKAGES_RESOURCE_NOT_FOUND", 404);
  const role = String(row.role || "").toUpperCase();
  const denied = new Set((row.denied_permissions || []).map(String));
  const effective = new Set([...permsForRole(role), ...(row.granted_permissions || []).map(String)].filter((permission) => !denied.has(permission)));
  if (!["A", "V"].includes(role) || String(row.user_status).toUpperCase() !== "ACTIVE"
      || row.membership_status !== "ACTIVE" || row.tenant_status !== "ACTIVE"
      || ![PERMS.SERVICES_MATERIALS_VIEW, PERMS.SERVICES_MATERIALS_MANAGE].every((permission) => effective.has(permission))) {
    fail("SERVICE_PACKAGES_PERMISSION_FORBIDDEN", 403);
  }
  return Object.freeze({ tenantId: context.tenantId });
}

function publicResource(kind, row) {
  return Object.freeze({ kind, resourceRef: kind === "MATERIAL" ? row.materialRef : row.modelRef, code: row.code, name: row.name, family: row.family });
}

// This lookup belongs to the policy editor. It exposes no inventory, cost, instance,
// supplier or private database identity and does not require access to those modules.
export async function listServiceMaterialResources(context, rawQuery, database = prisma) {
  const query = normalizeMaterialPoliciesQuery(rawQuery);
  if (query.view !== "resources") fail();
  try {
    return await database.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='250ms'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
      const who = await policyEditor(tx, context);
      const kinds = query.kind === null ? KINDS : [query.kind];
      const firstKind = query.cursor ? kinds.indexOf(query.cursor.kind) : 0;
      const items = [];
      for (const kind of kinds.slice(firstKind)) {
        const where = {
          tenantId: who.tenantId,
          status: "ACTIVE",
          ...(query.cursor?.kind === kind ? { code: { gt: query.cursor.code } } : {}),
          ...(query.search ? { OR: [{ code: { contains: query.search, mode: "insensitive" } }, { name: { contains: query.search, mode: "insensitive" } }] } : {}),
        };
        const select = { ...(kind === "MATERIAL" ? { materialRef: true } : { modelRef: true }), code: true, name: true, family: true };
        const rows = await (kind === "MATERIAL" ? tx.materialCatalogItem : tx.assetModel).findMany({ where, select, orderBy: { code: "asc" }, take: PAGE_SIZE + 1 - items.length });
        items.push(...rows.map((row) => publicResource(kind, row)));
        if (items.length > PAGE_SIZE) break;
      }
      const page = items.slice(0, PAGE_SIZE);
      const last = page.at(-1);
      const nextCursor = items.length > PAGE_SIZE
        ? Buffer.from(JSON.stringify({ v: 1, kind: last.kind, code: last.code, filter: query.kind, search: query.search }), "utf8").toString("base64url")
        : null;
      return Object.freeze({ items: Object.freeze(page), nextCursor });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof CrmServicesError) throw error;
    throw new CrmServicesError("SERVICE_PACKAGES_DATABASE_UNAVAILABLE", 503, { cause: error });
  }
}
