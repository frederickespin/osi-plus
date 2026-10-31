import { Prisma } from "@prisma/client";
import { fleetFail } from "./adminFleetContract.js";
import { PERMS, permsForRole } from "./rbac.js";

const DRIVER_PERMISSIONS = Object.freeze([
  PERMS.FLEET_DRIVERS_ASSIGN,
  PERMS.FLEET_DRIVERS_REQUEST,
  PERMS.FLEET_DRIVERS_AUTHORIZE,
]);

function permissionSet(values) {
  return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
}

function requireAuthority(role, effective, granted, { write = false, permission = null } = {}) {
  const designatedOperations = role === "B" && DRIVER_PERMISSIONS.some((candidate) => granted.has(candidate) && effective.has(candidate));
  if ((role !== "A" && !designatedOperations) || !effective.has(PERMS.FLEET_VIEW)
    || (write && (role !== "A" || !effective.has(PERMS.FLEET_EDIT)))
    || (permission !== null && !effective.has(permission))) fleetFail("FORBIDDEN", 403);
}

export function authorizeFleetContext(context, options = {}) {
  const denied = permissionSet(context?.deniedPermissions);
  const supplied = permissionSet(context?.effectivePermissions ?? context?.permissions ?? context?.grantedPermissions);
  const effective = new Set([...supplied].filter((permission) => !denied.has(permission)));
  // These permissions are never inherited. Context is a preliminary gate;
  // revalidation below requires a current database grant for an operations actor.
  const granted = context?.grantedPermissions === undefined ? effective : permissionSet(context.grantedPermissions);
  if ((context?.tenantStatus !== undefined && context.tenantStatus !== "ACTIVE")
    || (context?.membershipStatus !== undefined && context.membershipStatus !== "ACTIVE")
    || (context?.userStatus !== undefined && String(context.userStatus).toUpperCase() !== "ACTIVE")) fleetFail("FORBIDDEN", 403);
  requireAuthority(context?.role, effective, granted, options);
}

function contextIdentifier(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 191) fleetFail("FORBIDDEN", 403);
  return value;
}

export async function revalidateFleetActor(tx, context, options = {}) {
  authorizeFleetContext(context, options);
  const tenantId = contextIdentifier(context?.tenantId);
  const membershipId = contextIdentifier(context?.membershipId);
  const userId = contextIdentifier(context?.userId);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id", m."public_ref", m."tenant_id", m."user_id", m."role"::text AS "role", m."status"::text AS "status",
           m."granted_permissions", m."denied_permissions", u."status" AS "user_status", t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    FOR SHARE OF m, u, t
  `);
  const row = rows[0];
  if (rows.length !== 1 || row.id !== membershipId || row.tenant_id !== tenantId || row.user_id !== userId
    || row.status !== "ACTIVE" || String(row.user_status).toUpperCase() !== "ACTIVE" || row.tenant_status !== "ACTIVE") fleetFail("FORBIDDEN", 403);
  const granted = permissionSet(row.granted_permissions);
  const denied = permissionSet(row.denied_permissions);
  const effective = new Set([...permsForRole(row.role), ...granted].filter((permission) => !denied.has(permission)));
  requireAuthority(row.role, effective, granted, options);
  return Object.freeze({ tenantId, membershipId, membershipRef: contextIdentifier(row.public_ref), userId, role: row.role, effective });
}
