import { effectivePermissionsFor } from "./rbac.js";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function frozenStrings(values) {
  return Object.freeze([...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].sort());
}

function immutableRecord(value) {
  return Object.freeze({ ...value });
}

/**
 * Única forma interna de AuthorizationContext. Los identificadores contenidos
 * aquí son autoridad server-side y no constituyen un DTO público.
 */
export function createAuthorizationContext({
  sessionKind,
  sessionId = null,
  user,
  membership,
  tenant,
}) {
  const normalizedSessionKind = upper(sessionKind);
  if (!new Set(["LEGACY", "V2"]).has(normalizedSessionKind)) {
    throw new TypeError("sessionKind inválido");
  }
  if (!user?.id || !membership?.id || !tenant?.id) {
    throw new TypeError("AuthorizationContext requiere User, Membership y Tenant");
  }

  const role = upper(membership.role);
  const grantedPermissions = frozenStrings(membership.grantedPermissions);
  const deniedPermissions = frozenStrings(membership.deniedPermissions);
  const effectivePermissions = effectivePermissionsFor(role, grantedPermissions, deniedPermissions);
  const authorizationVersion = Number(membership.authorizationVersion);
  if (!Number.isSafeInteger(authorizationVersion) || authorizationVersion < 1) {
    throw new TypeError("authorizationVersion inválida");
  }

  const frozenUser = immutableRecord({
    id: String(user.id),
    email: String(user.email || ""),
    status: upper(user.status),
  });
  const frozenMembership = Object.freeze({
    id: String(membership.id),
    publicRef: membership.publicRef == null ? null : String(membership.publicRef),
    status: upper(membership.status),
    role,
    grantedPermissions,
    deniedPermissions,
    effectivePermissions,
    authorizationVersion,
  });
  const frozenTenant = immutableRecord({
    id: String(tenant.id),
    code: String(tenant.code || ""),
    name: String(tenant.name || ""),
    status: upper(tenant.status),
  });

  return Object.freeze({
    authType: normalizedSessionKind,
    authVersion: normalizedSessionKind,
    sessionKind: normalizedSessionKind,
    sessionId: sessionId == null ? null : String(sessionId),
    user: frozenUser,
    membership: frozenMembership,
    tenant: frozenTenant,
    userId: frozenUser.id,
    email: frozenUser.email,
    tenantId: frozenTenant.id,
    tenantCode: frozenTenant.code,
    membershipId: frozenMembership.id,
    membershipRef: frozenMembership.publicRef,
    role,
    grantedPermissions,
    deniedPermissions,
    effectivePermissions,
    permissions: effectivePermissions,
    authorizationVersion,
    userStatus: frozenUser.status,
    membershipStatus: frozenMembership.status,
    tenantStatus: frozenTenant.status,
  });
}

export function hasEffectivePermission(context, permission) {
  return Array.isArray(context?.effectivePermissions)
    && context.effectivePermissions.includes(String(permission));
}
