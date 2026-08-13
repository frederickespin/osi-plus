import { Prisma } from "@prisma/client";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { issueCrmOwnerRef, readCrmOwnerRef } from "./crmOwnerRef.js";
import { PERMS } from "./rbac.js";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_SEARCH_LENGTH = 120;
const OWNER_REQUIRED_PERMISSIONS = Object.freeze([
  PERMS.PIPELINE_VIEW,
  PERMS.PIPELINE_UPDATE,
  PERMS.PIPELINE_TRANSITION,
]);

function fail(code, status) {
  throw new CommercialTenancyError(code, status);
}

function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) fail("CRM_PIPELINE_COMMAND_INVALID", 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) fail("CRM_PIPELINE_COMMAND_INVALID", 400);
  return parsed;
}

export function normalizeOwnerCatalogQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)
    || Object.keys(query).some((key) => !["page", "pageSize", "q"].includes(key))) {
    fail("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  const page = positiveInteger(query.page, 1, 100_000);
  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const search = query.q === undefined ? null : query.q;
  if (search !== null && (typeof search !== "string" || search.length < 1 || search.length > MAX_SEARCH_LENGTH
    || search !== search.trim() || /[\u0000-\u001f\u007f]/.test(search))) {
    fail("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  return Object.freeze({ page, pageSize, search, offset: (page - 1) * pageSize });
}

function assertCatalogActor(context) {
  if (context?.role !== "A" || !Array.isArray(context.effectivePermissions)
    || !context.effectivePermissions.includes(PERMS.PIPELINE_ASSIGN)) {
    fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  }
}

function assertIdentity(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 191) fail("CRM_PIPELINE_OWNER_INELIGIBLE", 409);
  return value;
}

export async function listCrmPipelineOwnerOptions(context, query, {
  prisma,
  env = process.env,
  now = Date.now,
  issueOwnerRef = issueCrmOwnerRef,
} = {}) {
  assertCatalogActor(context);
  const tenantId = assertIdentity(context?.tenantId);
  const input = normalizeOwnerCatalogQuery(query);
  const deniedPermissions = OWNER_REQUIRED_PERMISSIONS;
  const ambiguous = await prisma.$queryRaw(Prisma.sql`
    SELECT lower(normalize(btrim(u."name"), NFKC)) AS "normalized_name"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    WHERE m."tenant_id" = ${tenantId}
      AND m."status"::text = 'ACTIVE'
      AND m."role"::text = 'V'
      AND lower(u."status") = 'active'
      AND btrim(u."name") <> ''
      AND char_length(btrim(u."name")) <= 191
      AND u."name" !~ '[[:cntrl:]]'
      AND NOT (m."denied_permissions" && ${deniedPermissions}::text[])
    GROUP BY lower(normalize(btrim(u."name"), NFKC))
    HAVING count(*) > 1
    LIMIT 1
  `);
  if (ambiguous.length > 0) fail("CRM_PIPELINE_OWNER_CATALOG_AMBIGUOUS", 409);

  const search = input.search ? `%${input.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT m."id" AS "membership_id", m."user_id", btrim(u."name") AS "display_name",
      count(*) OVER()::int AS "total"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    WHERE m."tenant_id" = ${tenantId}
      AND m."status"::text = 'ACTIVE'
      AND m."role"::text = 'V'
      AND lower(u."status") = 'active'
      AND btrim(u."name") <> ''
      AND char_length(btrim(u."name")) <= 191
      AND u."name" !~ '[[:cntrl:]]'
      AND NOT (m."denied_permissions" && ${deniedPermissions}::text[])
      AND (${search}::text IS NULL OR normalize(btrim(u."name"), NFKC) ILIKE ${search} ESCAPE '\\')
    ORDER BY lower(normalize(btrim(u."name"), NFKC)), btrim(u."name"), m."id"
    LIMIT ${input.pageSize} OFFSET ${input.offset}
  `);
  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  const data = rows.map((row) => Object.freeze({
    ownerRef: issueOwnerRef({ tenantId, membershipId: row.membership_id, userId: row.user_id }, { env, now }),
    displayName: row.display_name,
    role: "V",
  }));
  return Object.freeze({ total, page: input.page, pageSize: input.pageSize, data: Object.freeze(data) });
}

export async function resolveCrmOwnerRefForAssignment(context, ownerRef, {
  prisma,
  env = process.env,
  now = Date.now,
  readOwnerRef = readCrmOwnerRef,
} = {}) {
  assertCatalogActor(context);
  const tenantId = assertIdentity(context?.tenantId);
  const identity = readOwnerRef(ownerRef, { env, now });
  if (identity.tenantId !== tenantId) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const deniedPermissions = OWNER_REQUIRED_PERMISSIONS;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT m."id"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    WHERE m."tenant_id" = ${tenantId}
      AND m."id" = ${identity.membershipId}
      AND m."user_id" = ${identity.userId}
      AND m."status"::text = 'ACTIVE'
      AND m."role"::text = 'V'
      AND lower(u."status") = 'active'
      AND NOT (m."denied_permissions" && ${deniedPermissions}::text[])
    LIMIT 1
  `);
  if (rows.length !== 1) fail("CRM_PIPELINE_OWNER_INELIGIBLE", 409);
  return identity.membershipId;
}

export const CRM_OWNER_CATALOG_MAX_PAGE_SIZE = MAX_PAGE_SIZE;
export const CRM_OWNER_ELIGIBILITY_PERMISSIONS = OWNER_REQUIRED_PERMISSIONS;
