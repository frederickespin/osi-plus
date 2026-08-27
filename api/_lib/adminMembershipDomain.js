import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { PERMS, permsForRole } from "./rbac.js";

export const ADMIN_MEMBERSHIP_PERMISSIONS = Object.freeze([
  PERMS.MEMBERSHIP_VIEW,
  PERMS.MEMBERSHIP_UPDATE_ROLE,
  PERMS.MEMBERSHIP_UPDATE_PERMISSIONS,
  PERMS.MEMBERSHIP_UPDATE_STATUS,
]);

const ROLES = new Set(["A", "V"]);
const STATUSES = new Set(["ACTIVE", "SUSPENDED", "INACTIVE"]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class AdminMembershipError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "AdminMembershipError";
    this.code = code;
    this.status = status;
  }
}

function requiredText(value, field, max = 191) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  return normalized;
}

export function canonicalMembershipRef(value) {
  const normalized = requiredText(value, "membershipRef", 36);
  if (!UUID_V4.test(normalized)) throw new AdminMembershipError("ADMIN_MEMBERSHIP_NOT_FOUND", 404);
  return normalized;
}

function normalizePermissions(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  const normalized = [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].sort();
  if (normalized.some((permission) => permission.length > 160)) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  return normalized;
}

function effectivePermissions(row) {
  const denied = new Set(Array.isArray(row.denied_permissions) ? row.denied_permissions.map(String) : []);
  return new Set([
    ...permsForRole(row.role),
    ...(Array.isArray(row.granted_permissions) ? row.granted_permissions.map(String) : []),
  ].filter((permission) => !denied.has(permission)));
}

function requirePermission(context, permission) {
  const denied = new Set(context?.deniedPermissions || []);
  const effective = new Set(context?.effectivePermissions || context?.permissions || []);
  if (denied.has(permission) || !effective.has(permission)) {
    throw new AdminMembershipError("ADMIN_MEMBERSHIP_FORBIDDEN", 403);
  }
}

function publicDto(row) {
  return Object.freeze({
    membershipRef: String(row.public_ref),
    name: String(row.user_name),
    email: String(row.user_email),
    role: String(row.role),
    status: String(row.status),
    grantedPermissions: Object.freeze([...(row.granted_permissions || [])].map(String)),
    deniedPermissions: Object.freeze([...(row.denied_permissions || [])].map(String)),
    authorizationVersion: Number(row.authorization_version),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

async function revalidateActor(db, context) {
  const tenantId = requiredText(context?.tenantId, "tenantId");
  const membershipId = requiredText(context?.membershipId, "membershipId");
  const userId = requiredText(context?.userId, "userId");
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT tm."id", tm."user_id", tm."role"::text AS "role", tm."status"::text AS "status",
           tm."granted_permissions", tm."denied_permissions", tm."authorization_version",
           u."status" AS "user_status", t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" tm
    JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
    JOIN "osi"."tenants" t ON t."id"=tm."tenant_id"
    WHERE tm."tenant_id"=${tenantId} AND tm."id"=${membershipId} AND tm."user_id"=${userId}
    FOR SHARE OF tm, u, t
  `);
  const actor = rows[0];
  if (!actor || String(actor.role) !== "A" || String(actor.status) !== "ACTIVE" || String(actor.user_status).toUpperCase() !== "ACTIVE"
    || String(actor.tenant_status) !== "ACTIVE") {
    throw new AdminMembershipError("ADMIN_MEMBERSHIP_FORBIDDEN", 403);
  }
  return { tenantId, membershipId, userId, row: actor, effective: effectivePermissions(actor) };
}

function assertActorPermission(actor, permission) {
  const denied = new Set(actor.row.denied_permissions || []);
  if (denied.has(permission) || !actor.effective.has(permission)) {
    throw new AdminMembershipError("ADMIN_MEMBERSHIP_FORBIDDEN", 403);
  }
}

export async function listTenantMemberships(prisma, context, filters = {}) {
  requirePermission(context, PERMS.MEMBERSHIP_VIEW);
  const actor = await revalidateActor(prisma, context);
  assertActorPermission(actor, PERMS.MEMBERSHIP_VIEW);
  const page = Math.max(1, Math.trunc(Number(filters.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(filters.pageSize) || 20)));
  const search = String(filters.search || "").trim().slice(0, 120);
  const role = filters.role == null || filters.role === "" ? null : String(filters.role).toUpperCase();
  const status = filters.status == null || filters.status === "" ? null : String(filters.status).toUpperCase();
  if (role && !ROLES.has(role)) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  if (status && !STATUSES.has(status)) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  const conditions = [Prisma.sql`tm."tenant_id"=${actor.tenantId}`];
  if (search) conditions.push(Prisma.sql`(u."name" ILIKE ${`%${search}%`} OR u."email" ILIKE ${`%${search}%`})`);
  if (role) conditions.push(Prisma.sql`tm."role"=CAST(${role} AS "osi"."TenantMembershipRole")`);
  if (status) conditions.push(Prisma.sql`tm."status"=CAST(${status} AS "osi"."TenantMembershipStatus")`);
  const where = Prisma.join(conditions, " AND ");
  const totals = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::integer AS "total" FROM "osi"."tenant_memberships" tm
    JOIN "osi"."osi_users" u ON u."id"=tm."user_id" WHERE ${where}
  `);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT tm."public_ref", tm."role"::text AS "role", tm."status"::text AS "status",
           tm."granted_permissions", tm."denied_permissions", tm."authorization_version", tm."updated_at",
           u."name" AS "user_name", u."email" AS "user_email"
    FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
    WHERE ${where}
    ORDER BY u."name" ASC, tm."public_ref" ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  return Object.freeze({ data: Object.freeze(rows.map(publicDto)), total: Number(totals[0]?.total || 0), page, pageSize });
}

export async function getTenantMembership(prisma, context, membershipRef) {
  requirePermission(context, PERMS.MEMBERSHIP_VIEW);
  const ref = canonicalMembershipRef(membershipRef);
  const actor = await revalidateActor(prisma, context);
  assertActorPermission(actor, PERMS.MEMBERSHIP_VIEW);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT tm."public_ref", tm."role"::text AS "role", tm."status"::text AS "status",
           tm."granted_permissions", tm."denied_permissions", tm."authorization_version", tm."updated_at",
           u."name" AS "user_name", u."email" AS "user_email"
    FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
    WHERE tm."tenant_id"=${actor.tenantId} AND tm."public_ref"=CAST(${ref} AS uuid)
    LIMIT 1
  `);
  if (!rows[0]) throw new AdminMembershipError("ADMIN_MEMBERSHIP_NOT_FOUND", 404);
  return publicDto(rows[0]);
}

function operationalAdmin(row) {
  if (String(row.role) !== "A" || String(row.status) !== "ACTIVE" || String(row.user_status).toUpperCase() !== "ACTIVE") return false;
  const granted = new Set(row.granted_permissions || []);
  const denied = new Set(row.denied_permissions || []);
  return ADMIN_MEMBERSHIP_PERMISSIONS.every((permission) => granted.has(permission) && !denied.has(permission));
}

export async function updateTenantMembership(prisma, context, membershipRef, input, { auditWriter = appendCommercialAudit } = {}) {
  const ref = canonicalMembershipRef(membershipRef);
  const requestId = requiredText(input?.requestId, "requestId");
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  const role = input.role === undefined ? undefined : String(input.role).toUpperCase();
  const status = input.status === undefined ? undefined : String(input.status).toUpperCase();
  const granted = normalizePermissions(input.grantedPermissions, "grantedPermissions");
  const denied = normalizePermissions(input.deniedPermissions, "deniedPermissions");
  if (role !== undefined && !ROLES.has(role)) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  if (status !== undefined && !STATUSES.has(status)) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  if (role === undefined && status === undefined && granted === undefined && denied === undefined) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  if (granted && denied && granted.some((permission) => denied.includes(permission))) throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);

  if (role !== undefined) requirePermission(context, PERMS.MEMBERSHIP_UPDATE_ROLE);
  if (status !== undefined) requirePermission(context, PERMS.MEMBERSHIP_UPDATE_STATUS);
  if (granted !== undefined || denied !== undefined) requirePermission(context, PERMS.MEMBERSHIP_UPDATE_PERMISSIONS);

  return prisma.$transaction(async (tx) => {
    const tenantId = requiredText(context?.tenantId, "tenantId");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."tenants" WHERE "id"=${tenantId} FOR UPDATE`);
    const actor = await revalidateActor(tx, context);
    if (role !== undefined) assertActorPermission(actor, PERMS.MEMBERSHIP_UPDATE_ROLE);
    if (status !== undefined) assertActorPermission(actor, PERMS.MEMBERSHIP_UPDATE_STATUS);
    if (granted !== undefined || denied !== undefined) assertActorPermission(actor, PERMS.MEMBERSHIP_UPDATE_PERMISSIONS);

    const targets = await tx.$queryRaw(Prisma.sql`
      SELECT tm."id", tm."public_ref", tm."user_id", tm."role"::text AS "role", tm."status"::text AS "status",
             tm."granted_permissions", tm."denied_permissions", tm."authorization_version", tm."updated_at",
             u."name" AS "user_name", u."email" AS "user_email", u."status" AS "user_status"
      FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
      WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"=CAST(${ref} AS uuid)
      FOR UPDATE OF tm, u
    `);
    const before = targets[0];
    if (!before) throw new AdminMembershipError("ADMIN_MEMBERSHIP_NOT_FOUND", 404);
    if (Number(before.authorization_version) !== expectedVersion) throw new AdminMembershipError("ADMIN_MEMBERSHIP_VERSION_CONFLICT", 409);

    const next = {
      ...before,
      role: role ?? before.role,
      status: status ?? before.status,
      granted_permissions: granted ?? before.granted_permissions,
      denied_permissions: denied ?? before.denied_permissions,
    };
    if (next.granted_permissions.some((permission) => next.denied_permissions.includes(permission))) {
      throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
    }
    const self = String(before.id) === actor.membershipId;
    if (self && (next.role !== "A" || next.status !== "ACTIVE")) {
      throw new AdminMembershipError("ADMIN_MEMBERSHIP_SELF_PROTECTION", 409);
    }

    const others = await tx.$queryRaw(Prisma.sql`
      SELECT COUNT(*)::integer AS "count"
      FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
      WHERE tm."tenant_id"=${tenantId} AND tm."id"<>${before.id}
        AND tm."role"='A' AND tm."status"='ACTIVE' AND UPPER(u."status")='ACTIVE'
        AND tm."granted_permissions" @> ${ADMIN_MEMBERSHIP_PERMISSIONS}::text[]
        AND NOT (tm."denied_permissions" && ${ADMIN_MEMBERSHIP_PERMISSIONS}::text[])
    `);
    const otherAdmins = Number(others[0]?.count || 0);
    const beforeAdmins = otherAdmins + (operationalAdmin(before) ? 1 : 0);
    const afterAdmins = otherAdmins + (operationalAdmin(next) ? 1 : 0);
    if ((beforeAdmins < 2 && afterAdmins < beforeAdmins) || (beforeAdmins >= 2 && afterAdmins < 2)) {
      throw new AdminMembershipError("ADMIN_MEMBERSHIP_CONTINUITY_REQUIRED", 409);
    }

    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."tenant_memberships"
      SET "role"=CAST(${next.role} AS "osi"."TenantMembershipRole"),
          "status"=CAST(${next.status} AS "osi"."TenantMembershipStatus"),
          "granted_permissions"=${next.granted_permissions}, "denied_permissions"=${next.denied_permissions},
          "authorization_version"="authorization_version"+1, "updated_at"=CURRENT_TIMESTAMP
      WHERE "tenant_id"=${tenantId} AND "id"=${before.id} AND "authorization_version"=${expectedVersion}
      RETURNING "public_ref", "role"::text AS "role", "status"::text AS "status",
                "granted_permissions", "denied_permissions", "authorization_version", "updated_at"
    `);
    if (!updated[0]) throw new AdminMembershipError("ADMIN_MEMBERSHIP_VERSION_CONFLICT", 409);
    const after = { ...updated[0], user_name: before.user_name, user_email: before.user_email };

    await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."auth_sessions" SET "status"='REVOKED', "revoked_at"=CURRENT_TIMESTAMP,
             "revocation_reason"='AUTHORIZATION_CHANGED', "updated_at"=CURRENT_TIMESTAMP
      WHERE "tenant_id"=${tenantId} AND "membership_id"=${before.id} AND "status"='ACTIVE'
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."auth_refresh_tokens" rt SET "status"='REVOKED', "revoked_at"=CURRENT_TIMESTAMP
      FROM "osi"."auth_sessions" s WHERE rt."tenant_id"=s."tenant_id" AND rt."session_id"=s."id"
        AND s."tenant_id"=${tenantId} AND s."membership_id"=${before.id} AND rt."status"='ACTIVE'
    `);
    await auditWriter(tx, { tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId }, {
      action: "MEMBERSHIP_AUTHORIZATION_CHANGED",
      entity: "TENANT_MEMBERSHIP",
      entityId: String(before.id),
      beforeJson: publicDto(before),
      afterJson: publicDto(after),
      metadataJson: { changedFields: [role !== undefined && "role", status !== undefined && "status", granted !== undefined && "grantedPermissions", denied !== undefined && "deniedPermissions"].filter(Boolean) },
      source: "V17_ADMIN_TENANT_FIRST",
      requestId,
      correlationId: requestId,
      critical: true,
    });
    return publicDto(after);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3_000, timeout: 10_000 });
}
