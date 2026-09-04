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
import { createAuthorizationContext } from "./authorizationContext.js";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function active(value) {
  return upper(value) === "ACTIVE";
}

function contextFromRow(row) {
  return createAuthorizationContext({
    sessionKind: "V2",
    sessionId: row.session_id,
    user: { id: row.user_id, email: row.user_email, status: row.user_status },
    membership: {
      id: row.membership_id,
      role: row.membership_role,
      status: row.membership_status,
      grantedPermissions: row.granted_permissions,
      deniedPermissions: row.denied_permissions,
      authorizationVersion: row.authorization_version,
    },
    tenant: { id: row.tenant_id, code: row.tenant_code, status: row.tenant_status },
  });
}

export async function resolveLegacyAuthorizationContext(prisma, payload) {
  let rows;
  try {
    rows = await prisma.$queryRaw(Prisma.sql`
      SELECT u."id" AS "user_id", u."email" AS "user_email", u."status" AS "user_status",
             tm."tenant_id", tm."id" AS "membership_id", tm."role"::text AS "membership_role",
             tm."authorization_version", tm."granted_permissions", tm."denied_permissions",
             tm."status"::text AS "membership_status", tm."is_default",
             t."status"::text AS "tenant_status", t."code" AS "tenant_code"
      FROM "osi"."osi_users" u
      LEFT JOIN "osi"."tenant_memberships" tm ON tm."user_id" = u."id"
      LEFT JOIN "osi"."tenants" t ON t."id" = tm."tenant_id"
      WHERE u."id" = ${String(payload.sub)}
      ORDER BY tm."is_default" DESC NULLS LAST, tm."created_at" ASC, tm."id" ASC
      LIMIT 3
    `);
  } catch (cause) {
    throw new Mt01bAuthError("No fue posible revalidar la autorización.", {
      code: "MT01B_AUTH_DATABASE_UNAVAILABLE",
      status: 503,
      cause,
    });
  }

  if (!rows[0] || !active(rows[0].user_status)) {
    throw new Mt01bAuthError("La identidad ya no es válida.", { code: "MT01B_AUTHORIZATION_INVALID", status: 401 });
  }
  const memberships = rows.filter((row) => row.membership_id);
  const defaults = memberships.filter((row) => row.is_default === true);
  if (defaults.length > 1) {
    throw new Mt01bAuthError("La selección empresarial es ambigua.", {
      code: "MULTIPLE_DEFAULT_MEMBERSHIPS_ADMIN_REQUIRED",
      status: 409,
    });
  }
  const activeCandidates = memberships.filter((row) => active(row.membership_status) && active(row.tenant_status));
  const selected = defaults[0] || (activeCandidates.length === 1 ? activeCandidates[0] : null);
  if (!selected) {
    if (activeCandidates.length > 1) {
      throw new Mt01bAuthError("El usuario debe seleccionar una empresa.", {
        code: "MULTIPLE_ACTIVE_MEMBERSHIPS_ADMIN_REQUIRED",
        status: 409,
      });
    }
    throw new Mt01bAuthError("No existe una membresía empresarial seleccionable.", {
      code: "MT01B_MEMBERSHIP_NOT_FOUND",
      status: 403,
    });
  }
  if (!active(selected.membership_status)) {
    throw new Mt01bAuthError("La membresía empresarial está inactiva.", {
      code: "MT01B_MEMBERSHIP_INACTIVE",
      status: 403,
    });
  }
  if (!active(selected.tenant_status)) {
    throw new Mt01bAuthError("La empresa está inactiva.", { code: "MT01B_TENANT_INACTIVE", status: 403 });
  }

  return createAuthorizationContext({
    sessionKind: "LEGACY",
    user: { id: selected.user_id, email: selected.user_email, status: selected.user_status },
    membership: {
      id: selected.membership_id,
      role: selected.membership_role,
      status: selected.membership_status,
      grantedPermissions: selected.granted_permissions,
      deniedPermissions: selected.denied_permissions,
      authorizationVersion: selected.authorization_version,
    },
    tenant: { id: selected.tenant_id, code: selected.tenant_code, status: selected.tenant_status },
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
           tm."status"::text AS "membership_status", t."status"::text AS "tenant_status", t."code" AS "tenant_code",
           u."status" AS "user_status", u."email" AS "user_email"
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
    let legacy;
    try {
      legacy = verifyAccessToken(token);
    } catch (cause) {
      throw new Mt01bAuthError("Token legacy inválido.", { code: "MT01B_TOKEN_INVALID", status: 401, cause });
    }
    return resolveLegacyAuthorizationContext(prisma, legacy);
  }

  if (isMembershipAccessTokenCandidate(token) || policy.mode === MT01B_AUTH_MODES.MEMBERSHIP_ONLY) {
    return resolveV2Context(prisma, verifyMembershipAccessToken(token), now);
  }

  if (!policy.legacyTokenAcceptUntil || now >= policy.legacyTokenAcceptUntil) {
    throw new Mt01bAuthError("La ventana de compatibilidad legacy terminó.", { code: "MT01B_LEGACY_WINDOW_CLOSED", status: 401 });
  }
  const legacy = verifyStrictLegacyAccessToken(token);
  return resolveLegacyAuthorizationContext(prisma, legacy);
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
