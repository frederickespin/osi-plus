import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { Mt01bAuthError, assertMt01bV2Enabled } from "./authPolicy.js";
import { configureAuthTransaction, controlledAuthPersistenceError, trySessionFamilyLock } from "./authSession.js";

export const MEMBERSHIP_AUTHORIZATION_MANAGE = "tenant:membership:manage";
const ROLES = new Set(["A", "V", "K", "B", "C", "C1", "D", "E", "G", "N", "PA", "PB", "PC", "PD", "PF", "I", "PE"]);
const STATUSES = new Set(["ACTIVE", "SUSPENDED", "INACTIVE"]);

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Mt01bAuthError(`${name} es obligatorio.`, { code: "MT01B_MEMBERSHIP_INPUT_INVALID", status: 400 });
  return normalized;
}

function normalizedPermissions(value, field) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new Mt01bAuthError(`${field} debe ser una lista.`, { code: "MT01B_MEMBERSHIP_INPUT_INVALID", status: 400 });
  const values = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].sort();
  if (values.some((item) => item.length > 160)) throw new Mt01bAuthError(`${field} contiene un permiso inválido.`, { code: "MT01B_MEMBERSHIP_INPUT_INVALID", status: 400 });
  return values;
}

function canManage(context) {
  const denied = new Set(context?.deniedPermissions || []);
  const granted = new Set(context?.permissions || context?.grantedPermissions || []);
  return !denied.has(MEMBERSHIP_AUTHORIZATION_MANAGE) && (String(context?.role) === "A" || granted.has(MEMBERSHIP_AUTHORIZATION_MANAGE));
}

function dto(row) {
  return {
    tenantId: row.tenant_id,
    membershipId: row.id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    grantedPermissions: row.granted_permissions || [],
    deniedPermissions: row.denied_permissions || [],
    authorizationVersion: Number(row.authorization_version),
  };
}

export async function updateMembershipAuthorization(prisma, context, input, {
  env = process.env,
  auditWriter = appendCommercialAudit,
} = {}) {
  const tenantId = required(context?.tenantId, "context.tenantId");
  const actorMembershipId = required(context?.membershipId || context?.actorMembershipId, "context.membershipId");
  const membershipId = required(input?.membershipId, "membershipId");
  const requestId = required(input?.requestId, "requestId");
  const role = input?.role == null ? null : String(input.role).trim().toUpperCase();
  const status = input?.status == null ? null : String(input.status).trim().toUpperCase();
  const granted = normalizedPermissions(input?.grantedPermissions, "grantedPermissions");
  const denied = normalizedPermissions(input?.deniedPermissions, "deniedPermissions");
  if (role != null && !ROLES.has(role)) throw new Mt01bAuthError("Rol empresarial inválido.", { code: "MT01B_MEMBERSHIP_INPUT_INVALID", status: 400 });
  if (status != null && !STATUSES.has(status)) throw new Mt01bAuthError("Estado empresarial inválido.", { code: "MT01B_MEMBERSHIP_INPUT_INVALID", status: 400 });
  if (role == null && status == null && granted == null && denied == null) throw new Mt01bAuthError("No hay cambios de autorización.", { code: "MT01B_MEMBERSHIP_INPUT_INVALID", status: 400 });

  const policy = assertMt01bV2Enabled(env);
  try {
    return await prisma.$transaction(async (tx) => {
    await configureAuthTransaction(tx, policy);
    const actors = await tx.$queryRaw(Prisma.sql`
      SELECT tm."id", tm."user_id", tm."role"::text AS "role", tm."status"::text AS "status",
             tm."granted_permissions", tm."denied_permissions"
      FROM "osi"."tenant_memberships" tm
      WHERE tm."tenant_id" = ${tenantId} AND tm."id" = ${actorMembershipId}
      FOR SHARE
    `);
    if (!actors[0] || actors[0].status !== "ACTIVE" || !canManage({
      role: actors[0].role,
      grantedPermissions: actors[0].granted_permissions,
      deniedPermissions: actors[0].denied_permissions,
    })) throw new Mt01bAuthError("Actor empresarial inactivo o no autorizado.", { code: "MT01B_MEMBERSHIP_FORBIDDEN", status: 403 });

    const initialSessions = await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "osi"."auth_sessions"
      WHERE "tenant_id" = ${tenantId} AND "membership_id" = ${membershipId} AND "status" = 'ACTIVE'
      ORDER BY "id"
    `);
    const lockedSessionIds = new Set();
    for (const session of initialSessions) {
      const acquired = await trySessionFamilyLock(tx, tenantId, session.id);
      if (!acquired) {
        throw new Mt01bAuthError("Una sesión de la membresía está siendo actualizada.", {
          code: "MT01B_SESSION_OPERATION_IN_PROGRESS",
          status: 409,
          recoverable: true,
          retryAfterMs: policy.refreshRetryBaseMs,
        });
      }
      lockedSessionIds.add(session.id);
    }

    const targets = await tx.$queryRaw(Prisma.sql`
      SELECT "id", "tenant_id", "user_id", "role"::text AS "role", "status"::text AS "status",
             "granted_permissions", "denied_permissions", "authorization_version"
      FROM "osi"."tenant_memberships"
      WHERE "tenant_id" = ${tenantId} AND "id" = ${membershipId}
      FOR UPDATE
    `);
    const before = targets[0];
    if (!before) throw new Mt01bAuthError("Membresía no encontrada.", { code: "MT01B_MEMBERSHIP_NOT_FOUND", status: 404 });

    // El FOR UPDATE anterior impide que una creación nueva complete su lectura
    // FOR SHARE de la membresía. Releemos para incluir sesiones que terminaron
    // de crearse justo antes de adquirir ese bloqueo.
    const finalSessions = await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "osi"."auth_sessions"
      WHERE "tenant_id" = ${tenantId} AND "membership_id" = ${membershipId} AND "status" = 'ACTIVE'
      ORDER BY "id"
    `);
    for (const session of finalSessions) {
      if (lockedSessionIds.has(session.id)) continue;
      const acquired = await trySessionFamilyLock(tx, tenantId, session.id);
      if (!acquired) {
        throw new Mt01bAuthError("Una sesión de la membresía está siendo actualizada.", {
          code: "MT01B_SESSION_OPERATION_IN_PROGRESS",
          status: 409,
          recoverable: true,
          retryAfterMs: policy.refreshRetryBaseMs,
        });
      }
    }

    const nextRole = role ?? before.role;
    const nextStatus = status ?? before.status;
    const nextGranted = granted ?? before.granted_permissions;
    const nextDenied = denied ?? before.denied_permissions;
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."tenant_memberships"
      SET "role" = CAST(${nextRole} AS "osi"."TenantMembershipRole"),
          "status" = CAST(${nextStatus} AS "osi"."TenantMembershipStatus"),
          "granted_permissions" = ${nextGranted}, "denied_permissions" = ${nextDenied},
          "authorization_version" = "authorization_version" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "tenant_id" = ${tenantId} AND "id" = ${membershipId}
      RETURNING "id", "tenant_id", "user_id", "role"::text AS "role", "status"::text AS "status",
                "granted_permissions", "denied_permissions", "authorization_version"
    `);
    const after = updated[0];
    await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."auth_sessions"
      SET "status" = 'REVOKED', "revoked_at" = CURRENT_TIMESTAMP,
          "revocation_reason" = 'AUTHORIZATION_CHANGED', "updated_at" = CURRENT_TIMESTAMP
      WHERE "tenant_id" = ${tenantId} AND "membership_id" = ${membershipId} AND "status" = 'ACTIVE'
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "osi"."auth_refresh_tokens" rt
      SET "status" = 'REVOKED', "revoked_at" = CURRENT_TIMESTAMP
      FROM "osi"."auth_sessions" s
      WHERE rt."tenant_id" = s."tenant_id" AND rt."session_id" = s."id"
        AND s."tenant_id" = ${tenantId} AND s."membership_id" = ${membershipId} AND rt."status" = 'ACTIVE'
    `);
    await auditWriter(tx, {
      tenantId,
      actorKind: "MEMBERSHIP",
      actorMembershipId,
    }, {
      action: "MEMBERSHIP_AUTHORIZATION_CHANGED",
      entity: "TENANT_MEMBERSHIP",
      entityId: membershipId,
      beforeJson: dto(before),
      afterJson: dto(after),
      metadataJson: { changedFields: [role != null && "role", status != null && "status", granted != null && "grantedPermissions", denied != null && "deniedPermissions"].filter(Boolean) },
      source: "MT01B_MEMBERSHIP_AUTHORIZATION",
      requestId,
      correlationId: requestId,
      critical: true,
    });
    return dto(after);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: policy.transactionMaxWaitMs,
      timeout: policy.transactionTimeoutMs,
    });
  } catch (error) {
    throw controlledAuthPersistenceError(error, policy);
  }
}
