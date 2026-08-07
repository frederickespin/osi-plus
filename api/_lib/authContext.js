import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "./db.js";
import {
  getBearerToken,
  isMembershipAccessTokenCandidate,
  verifyAccessToken,
  verifyMembershipAccessToken,
  verifyStrictLegacyAccessToken,
} from "./auth.js";
import { MT01B_AUTH_MODES, Mt01bAuthError, resolveMt01bAuthPolicy } from "./authPolicy.js";
import { permsForRole } from "./rbac.js";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function active(value) {
  return upper(value) === "ACTIVE";
}

function frozenStrings(values) {
  return Object.freeze([...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].sort());
}

function permissionsFor(role, granted, denied) {
  const blocked = new Set((Array.isArray(denied) ? denied : []).map(String));
  return frozenStrings([...permsForRole(role), ...(Array.isArray(granted) ? granted : [])].filter((permission) => !blocked.has(permission)));
}

function immutableContext(value) {
  return Object.freeze(value);
}

function contextFromRow(row) {
  const grantedPermissions = frozenStrings(row.granted_permissions);
  const deniedPermissions = frozenStrings(row.denied_permissions);
  const effectivePermissions = permissionsFor(row.membership_role, grantedPermissions, deniedPermissions);
  return immutableContext({
    authType: "V2",
    authVersion: "V2",
    userId: row.user_id,
    sessionId: row.session_id,
    tenantId: row.tenant_id,
    membershipId: row.membership_id,
    role: upper(row.membership_role),
    effectivePermissions,
    permissions: effectivePermissions,
    grantedPermissions,
    deniedPermissions,
    authorizationVersion: Number(row.authorization_version),
    userStatus: upper(row.user_status),
    membershipStatus: upper(row.membership_status),
    tenantStatus: upper(row.tenant_status),
  });
}

function legacyContext(payload) {
  const role = upper(payload.role);
  const effectivePermissions = frozenStrings(permsForRole(role));
  return immutableContext({
    authType: "LEGACY",
    authVersion: "LEGACY",
    userId: String(payload.sub),
    sessionId: null,
    tenantId: null,
    membershipId: null,
    role,
    effectivePermissions,
    permissions: effectivePermissions,
    grantedPermissions: Object.freeze([]),
    deniedPermissions: Object.freeze([]),
    authorizationVersion: null,
    userStatus: null,
    membershipStatus: null,
    tenantStatus: null,
  });
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

async function resolveV2Context(prisma, payload, now) {
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
  const valid = row && active(row.session_status) && active(row.membership_status) && active(row.tenant_status) &&
    active(row.user_status) && new Date(row.expires_at) > now &&
    Number(row.authorization_version) === Number(payload.authorizationVersion) &&
    Number(row.authorization_version_snapshot) === Number(payload.authorizationVersion) &&
    upper(row.membership_role) === upper(payload.role);
  if (!valid) {
    throw new Mt01bAuthError("La sesión o autorización empresarial ya no es válida.", {
      code: "MT01B_AUTHORIZATION_INVALID",
      status: 401,
    });
  }
  return contextFromRow(row);
}

export async function resolveAuthContext(request, {
  prisma = defaultPrisma,
  env = process.env,
  now = new Date(),
} = {}) {
  const token = getBearerToken(request);
  if (!token) throw new Mt01bAuthError("Bearer token requerido.", { code: "MT01B_TOKEN_REQUIRED", status: 401 });
  const policy = resolveMt01bAuthPolicy(env, now);

  if (policy.mode === MT01B_AUTH_MODES.LEGACY) {
    return legacyContext(verifyAccessToken(token));
  }

  if (isMembershipAccessTokenCandidate(token) || policy.mode === MT01B_AUTH_MODES.MEMBERSHIP_ONLY) {
    return resolveV2Context(prisma, verifyMembershipAccessToken(token), now);
  }

  if (!policy.legacyTokenAcceptUntil || now >= policy.legacyTokenAcceptUntil) {
    throw new Mt01bAuthError("La ventana de compatibilidad legacy terminó.", { code: "MT01B_LEGACY_WINDOW_CLOSED", status: 401 });
  }
  const legacy = verifyStrictLegacyAccessToken(token);
  await resolveSingleActiveMembership(prisma, legacy.sub);
  return legacyContext(legacy);
}

export async function resolveLegacyUpgradeIdentity(prisma, token, { env = process.env, now = new Date() } = {}) {
  const policy = resolveMt01bAuthPolicy(env, now);
  if (policy.mode !== MT01B_AUTH_MODES.HYBRID || !policy.legacyTokenAcceptUntil || now >= policy.legacyTokenAcceptUntil) {
    throw new Mt01bAuthError("La actualización de sesión legacy no está disponible.", { code: "MT01B_LEGACY_UPGRADE_DISABLED", status: 409 });
  }
  const legacy = verifyStrictLegacyAccessToken(token);
  const member = await resolveSingleActiveMembership(prisma, legacy.sub);
  return Object.freeze({
    tenantId: member.tenant_id,
    membershipId: member.membership_id,
    userId: member.user_id,
  });
}
