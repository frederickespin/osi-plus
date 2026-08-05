import { Prisma } from "@prisma/client";
import { getBearerToken, verifyAccessToken, verifyMembershipAccessToken, verifyStrictLegacyAccessToken } from "./auth.js";
import { MT01B_AUTH_MODES, Mt01bAuthError, resolveMt01bAuthPolicy } from "./authPolicy.js";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function active(value) {
  return upper(value) === "ACTIVE";
}

function effectivePermissions(granted, denied) {
  const blocked = new Set(Array.isArray(denied) ? denied.map(String) : []);
  return (Array.isArray(granted) ? granted.map(String) : []).filter((permission) => !blocked.has(permission));
}

function contextFromRow(row, authVersion) {
  return {
    authVersion,
    userId: row.user_id,
    membershipId: row.membership_id,
    tenantId: row.tenant_id,
    role: String(row.membership_role),
    authorizationVersion: Number(row.authorization_version),
    grantedPermissions: row.granted_permissions || [],
    deniedPermissions: row.denied_permissions || [],
    permissions: effectivePermissions(row.granted_permissions, row.denied_permissions),
    sessionId: row.session_id || null,
  };
}

async function resolveSingleActiveMembership(prisma, userId) {
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT tm."tenant_id", tm."id" AS "membership_id", tm."user_id", tm."role"::text AS "membership_role",
           tm."authorization_version", tm."granted_permissions", tm."denied_permissions",
           tm."status"::text AS "membership_status", t."status"::text AS "tenant_status", u."status" AS "user_status"
    FROM "osi"."tenant_memberships" tm
    JOIN "osi"."tenants" t ON t."id" = tm."tenant_id"
    JOIN "osi"."osi_users" u ON u."id" = tm."user_id"
    WHERE tm."user_id" = ${userId} AND tm."status" = 'ACTIVE' AND t."status" = 'ACTIVE'
    ORDER BY tm."is_default" DESC, tm."created_at" ASC
    LIMIT 2
  `);
  if (!rows[0] || !active(rows[0].user_status)) {
    throw new Mt01bAuthError("No existe una membresía empresarial activa.", { code: "MT01B_MEMBERSHIP_NOT_FOUND", status: 403 });
  }
  if (rows.length > 1) {
    throw new Mt01bAuthError("El usuario tiene varias membresías activas y requiere intervención administrativa.", {
      code: "MULTIPLE_ACTIVE_MEMBERSHIPS_ADMIN_REQUIRED",
      status: 409,
    });
  }
  return rows[0];
}

async function resolveV2Context(prisma, payload) {
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT s."id" AS "session_id", s."tenant_id", s."membership_id", s."user_id",
           s."status"::text AS "session_status", s."expires_at", s."authorization_version_snapshot",
           tm."role"::text AS "membership_role", tm."authorization_version", tm."granted_permissions", tm."denied_permissions",
           tm."status"::text AS "membership_status", t."status"::text AS "tenant_status", u."status" AS "user_status"
    FROM "osi"."auth_sessions" s
    JOIN "osi"."tenant_memberships" tm
      ON tm."tenant_id" = s."tenant_id" AND tm."id" = s."membership_id" AND tm."user_id" = s."user_id"
    JOIN "osi"."tenants" t ON t."id" = s."tenant_id"
    JOIN "osi"."osi_users" u ON u."id" = s."user_id"
    WHERE s."id" = ${payload.sid} AND s."tenant_id" = ${payload.tenantId}
      AND s."membership_id" = ${payload.membershipId} AND s."user_id" = ${payload.sub}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row || !active(row.session_status) || !active(row.membership_status) || !active(row.tenant_status) || !active(row.user_status) ||
      new Date(row.expires_at) <= new Date() || Number(row.authorization_version) !== Number(payload.authorizationVersion) ||
      Number(row.authorization_version_snapshot) !== Number(payload.authorizationVersion) || String(row.membership_role) !== String(payload.role)) {
    throw new Mt01bAuthError("La sesión o autorización empresarial ya no es válida.", {
      code: "MT01B_AUTHORIZATION_INVALID",
      status: 401,
    });
  }
  return contextFromRow(row, "V2");
}

export async function resolveAuthContext(prisma, req, { env = process.env, now = new Date() } = {}) {
  const token = getBearerToken(req);
  if (!token) throw new Mt01bAuthError("Bearer token requerido.", { code: "MT01B_TOKEN_REQUIRED" });
  const policy = resolveMt01bAuthPolicy(env, now);

  if (policy.mode === MT01B_AUTH_MODES.LEGACY) {
    const payload = verifyAccessToken(token);
    return { authVersion: "LEGACY", userId: payload.sub, role: upper(payload.role), tenantId: null, membershipId: null };
  }

  try {
    const payload = verifyMembershipAccessToken(token);
    return await resolveV2Context(prisma, payload);
  } catch (error) {
    if (error?.code !== "MT01B_TOKEN_INVALID" || policy.mode !== MT01B_AUTH_MODES.HYBRID) throw error;
  }

  if (!policy.legacyTokenAcceptUntil || now >= policy.legacyTokenAcceptUntil) {
    throw new Mt01bAuthError("La ventana de compatibilidad legacy terminó.", { code: "MT01B_LEGACY_WINDOW_CLOSED" });
  }
  const legacy = verifyStrictLegacyAccessToken(token);
  const membership = await resolveSingleActiveMembership(prisma, legacy.sub);
  return contextFromRow(membership, "LEGACY_UPGRADE_REQUIRED");
}

export async function resolveLegacyUpgradeIdentity(prisma, token, { env = process.env, now = new Date() } = {}) {
  const policy = resolveMt01bAuthPolicy(env, now);
  if (policy.mode !== MT01B_AUTH_MODES.HYBRID || !policy.legacyTokenAcceptUntil || now >= policy.legacyTokenAcceptUntil) {
    throw new Mt01bAuthError("La actualización de sesión legacy no está disponible.", { code: "MT01B_LEGACY_UPGRADE_DISABLED", status: 409 });
  }
  const legacy = verifyStrictLegacyAccessToken(token);
  const member = await resolveSingleActiveMembership(prisma, legacy.sub);
  return {
    tenantId: member.tenant_id,
    membershipId: member.membership_id,
    userId: member.user_id,
  };
}
