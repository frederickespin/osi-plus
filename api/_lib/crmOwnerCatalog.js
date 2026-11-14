import { Prisma } from "@prisma/client";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { issueCrmOwnerRefs, readCrmOwnerRef } from "./crmOwnerRef.js";
import { PERMS } from "./rbac.js";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_SEARCH_LENGTH = 120;
const PUBLIC_CASE_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OWNER_REQUIRED_PERMISSIONS = Object.freeze([
  "pipeline:view",
  "pipeline:update",
  "pipeline:transition",
]);
const NORMALIZED_OWNER_NAME_SQL = Prisma.sql`lower(normalize(regexp_replace(btrim(u."name"), '[[:space:]]+', ' ', 'g'), NFKC))`;

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
    || Object.keys(query).some((key) => !["page", "pageSize", "q", "caseRef"].includes(key))) {
    fail("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  const page = positiveInteger(query.page, 1, 100_000);
  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const search = query.q === undefined ? null : query.q;
  if (search !== null && (typeof search !== "string" || search.length < 1 || search.length > MAX_SEARCH_LENGTH
    || search !== search.trim() || /[\u0000-\u001f\u007f]/.test(search))) {
    fail("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  const caseRef = query.caseRef === undefined ? null : query.caseRef;
  if (caseRef !== null && (typeof caseRef !== "string" || !PUBLIC_CASE_REF.test(caseRef))) fail("CRM_PIPELINE_COMMAND_INVALID", 400);
  return Object.freeze({ page, pageSize, search, caseRef, offset: (page - 1) * pageSize });
}

function commercialPolicy(row) {
  const restrictions = row.operational_restrictions && typeof row.operational_restrictions === "object" && !Array.isArray(row.operational_restrictions)
    ? row.operational_restrictions : {};
  const commercial = restrictions.commercial && typeof restrictions.commercial === "object" && !Array.isArray(restrictions.commercial)
    ? restrictions.commercial : {};
  const maxActiveCases = Number.isSafeInteger(commercial.maxActiveCases) && commercial.maxActiveCases > 0 && commercial.maxActiveCases <= 500
    ? commercial.maxActiveCases : 12;
  const authorizedModes = Array.isArray(commercial.authorizedModes) ? commercial.authorizedModes.filter((value) => ["LOCAL", "EXPORT", "IMPORT"].includes(value)) : [];
  const authorizedServiceTypes = Array.isArray(commercial.authorizedServiceTypes) ? commercial.authorizedServiceTypes.filter((value) => typeof value === "string" && value.length <= 120) : [];
  return Object.freeze({ enabled: commercial.enabled !== false, maxActiveCases, authorizedModes, authorizedServiceTypes });
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
  issueOwnerRefs = issueCrmOwnerRefs,
} = {}) {
  assertCatalogActor(context);
  const tenantId = assertIdentity(context?.tenantId);
  const input = normalizeOwnerCatalogQuery(query);
  const targetCase = input.caseRef ? await prisma.pipelineCase.findFirst({
    where: { tenantId, publicRef: input.caseRef },
    select: { mode: true, serviceType: true },
  }) : null;
  if (input.caseRef && !targetCase) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const deniedPermissions = OWNER_REQUIRED_PERMISSIONS;
  const search = input.search ? `%${input.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null;
  const searchCondition = search === null
    ? Prisma.empty
    : Prisma.sql`AND e."display_name" ILIKE ${search} ESCAPE '\\'`;
  const rows = await prisma.$queryRaw(Prisma.sql`
    WITH eligible AS MATERIALIZED (
      SELECT m."id" AS "membership_id", m."user_id", btrim(u."name") AS "display_name",
        ${NORMALIZED_OWNER_NAME_SQL} AS "normalized_name",
        COALESCE(ep."employment_status"::text, 'ACTIVE') AS "employment_status",
        COALESCE(ep."availability_status"::text, 'AVAILABLE') AS "availability_status",
        COALESCE(ep."operational_restrictions", '{}'::jsonb) AS "operational_restrictions",
        COUNT(c."id") FILTER (WHERE c."status"::text NOT IN ('WON','LOST','OPS_HANDOFF'))::int AS "active_cases"
      FROM "osi"."tenant_memberships" m
      JOIN "osi"."osi_users" u ON u."id" = m."user_id"
      LEFT JOIN "osi"."employee_profiles" ep ON ep."tenant_id" = m."tenant_id" AND ep."membership_id" = m."id" AND ep."user_id" = m."user_id"
      LEFT JOIN "osi"."osi_pipeline_cases" c ON c."tenant_id" = m."tenant_id" AND c."owner_membership_id" = m."id" AND c."owner_user_id" = m."user_id"
      WHERE m."tenant_id" = ${tenantId}
        AND m."status"::text = 'ACTIVE'
        AND m."role"::text = 'V'
        AND lower(u."status") = 'active'
        AND btrim(u."name") <> ''
        AND char_length(btrim(u."name")) <= 191
        AND u."name" !~ '[[:cntrl:]]'
        AND NOT (m."denied_permissions" && ${deniedPermissions}::text[])
      GROUP BY m."id", m."user_id", u."name", ep."employment_status", ep."availability_status", ep."operational_restrictions"
    ), ambiguity AS (
      SELECT EXISTS (
        SELECT 1 FROM eligible GROUP BY "normalized_name" HAVING count(*) > 1 LIMIT 1
      ) AS "ambiguous"
    ), candidates AS (
      SELECT e.*
      FROM eligible e
      WHERE true ${searchCondition}
    )
    SELECT candidates.*,
      ambiguity."ambiguous"
    FROM ambiguity LEFT JOIN candidates ON true
  `);
  if (rows[0]?.ambiguous === true) fail("CRM_PIPELINE_OWNER_CATALOG_AMBIGUOUS", 409);
  const eligibleRows = rows.filter((row) => row.membership_id !== null).map((row) => {
    const policy = commercialPolicy(row);
    const activeCases = Number(row.active_cases || 0);
    return { ...row, ...policy, activeCases, loadPercent: Math.round((activeCases / policy.maxActiveCases) * 100) };
  }).filter((row) => row.enabled && (row.employment_status || "ACTIVE") === "ACTIVE"
    && row.availability_status !== "UNAVAILABLE"
    && row.activeCases < row.maxActiveCases
    && (!targetCase || !row.authorizedModes.length || row.authorizedModes.includes(targetCase.mode))
    && (!targetCase || !row.authorizedServiceTypes.length || row.authorizedServiceTypes.includes(targetCase.serviceType)));
  eligibleRows.sort((left, right) => (left.availability_status === right.availability_status ? 0 : left.availability_status === "AVAILABLE" ? -1 : 1)
    || left.loadPercent - right.loadPercent || left.activeCases - right.activeCases
    || String(left.normalized_name || left.display_name || "").localeCompare(String(right.normalized_name || right.display_name || ""))
    || String(left.membership_id).localeCompare(String(right.membership_id)));
  const total = eligibleRows.length;
  const pageRows = eligibleRows.slice(input.offset, input.offset + input.pageSize);
  const ownerRefs = issueOwnerRefs(pageRows.map((row) => ({ tenantId, membershipId: row.membership_id, userId: row.user_id })), { env, now });
  const data = pageRows.map((row, index) => Object.freeze({
    ownerRef: ownerRefs[index],
    displayName: row.display_name,
    role: "V",
    activeCases: row.activeCases,
    maxActiveCases: row.maxActiveCases,
    loadPercent: row.loadPercent,
    availabilityStatus: row.availability_status,
    recommended: input.offset + index === 0,
  }));
  return Object.freeze({ total, page: input.page, pageSize: input.pageSize, data: Object.freeze(data) });
}

export async function resolveCrmOwnerRefForAssignment(context, ownerRef, {
  prisma,
  env = process.env,
  now = Date.now,
  readOwnerRef = readCrmOwnerRef,
  caseRef = null,
} = {}) {
  assertCatalogActor(context);
  const tenantId = assertIdentity(context?.tenantId);
  const identity = readOwnerRef(ownerRef, { env, now });
  if (identity.tenantId !== tenantId) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const deniedPermissions = OWNER_REQUIRED_PERMISSIONS;
  const targetCase = caseRef ? await prisma.pipelineCase.findFirst({
    where: { tenantId, OR: [{ id: caseRef }, ...(PUBLIC_CASE_REF.test(caseRef) ? [{ publicRef: caseRef }] : [])] },
    select: { mode: true, serviceType: true },
  }) : null;
  if (caseRef && !targetCase) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT m."id", COALESCE(ep."employment_status"::text, 'ACTIVE') AS "employment_status", COALESCE(ep."availability_status"::text, 'AVAILABLE') AS "availability_status",
      COALESCE(ep."operational_restrictions", '{}'::jsonb) AS "operational_restrictions",
      (SELECT COUNT(*)::int FROM "osi"."osi_pipeline_cases" c
       WHERE c."tenant_id" = m."tenant_id" AND c."owner_membership_id" = m."id" AND c."owner_user_id" = m."user_id"
         AND c."status"::text NOT IN ('WON','LOST','OPS_HANDOFF')) AS "active_cases"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id" = m."user_id"
    LEFT JOIN "osi"."employee_profiles" ep ON ep."tenant_id" = m."tenant_id" AND ep."membership_id" = m."id" AND ep."user_id" = m."user_id"
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
  const policy = commercialPolicy(rows[0]);
  const activeCases = Number(rows[0].active_cases || 0);
  if (!policy.enabled || (rows[0].employment_status || "ACTIVE") !== "ACTIVE" || rows[0].availability_status === "UNAVAILABLE" || activeCases >= policy.maxActiveCases
    || (targetCase && policy.authorizedModes.length && !policy.authorizedModes.includes(targetCase.mode))
    || (targetCase && policy.authorizedServiceTypes.length && !policy.authorizedServiceTypes.includes(targetCase.serviceType))) {
    fail("CRM_PIPELINE_OWNER_INELIGIBLE", 409);
  }
  return identity.membershipId;
}

export const CRM_OWNER_CATALOG_MAX_PAGE_SIZE = MAX_PAGE_SIZE;
export const CRM_OWNER_ELIGIBILITY_PERMISSIONS = OWNER_REQUIRED_PERMISSIONS;
