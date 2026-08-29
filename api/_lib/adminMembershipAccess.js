import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { PERMS } from "./rbac.js";
import {
  V17_PRODUCTION_PILOT_GATES,
  V17_PRODUCTION_PILOT_MODE,
  requireV17ProductionPilotContext,
  resolveV17ProductionPilotActivation,
} from "./v17ProductionPilotGate.js";

export const ADMIN_TENANT_MEMBERSHIP_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PRODUCTION_PILOT: V17_PRODUCTION_PILOT_MODE,
});

export const ADMIN_IDENTITY_INVITATION_MODES = ADMIN_TENANT_MEMBERSHIP_MODES;

const ADMIN_PERMISSIONS = Object.freeze([
  PERMS.MEMBERSHIP_VIEW,
  PERMS.MEMBERSHIP_UPDATE_ROLE,
  PERMS.MEMBERSHIP_UPDATE_PERMISSIONS,
  PERMS.MEMBERSHIP_UPDATE_STATUS,
]);

export class AdminMembershipAccessError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "AdminMembershipAccessError";
    this.code = code;
    this.status = status;
  }
}

function hasVercelMarker(env) {
  return Object.keys(env || {}).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"));
}

export function resolveAdminTenantMembershipMode(env = process.env) {
  const configured = env.ADMIN_TENANT_MEMBERSHIP_MODE;
  if (configured === undefined || configured === ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED) {
    return ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  }
  if (configured === ADMIN_TENANT_MEMBERSHIP_MODES.PRODUCTION_PILOT) {
    try { resolveV17ProductionPilotActivation(env); } catch {
      throw new AdminMembershipAccessError("ADMIN_TENANT_MEMBERSHIP_CONFIGURATION_INVALID", 503);
    }
    return ADMIN_TENANT_MEMBERSHIP_MODES.PRODUCTION_PILOT;
  }
  if (configured !== ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY || hasVercelMarker(env)) {
    throw new AdminMembershipAccessError("ADMIN_TENANT_MEMBERSHIP_CONFIGURATION_INVALID", 503);
  }
  return ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY;
}

export function requireAdminTenantMembershipAccess(req, env = process.env) {
  const mode = resolveAdminTenantMembershipMode(env);
  if (mode === ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED) {
    throw new AdminMembershipAccessError("ADMIN_TENANT_MEMBERSHIPS_DISABLED", 409);
  }
  if (mode === ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY && !isRealLoopbackRequest(req)) {
    throw new AdminMembershipAccessError("ADMIN_TENANT_MEMBERSHIP_CONFIGURATION_INVALID", 503);
  }
  return mode;
}

export function resolveAdminIdentityInvitationMode(env = process.env) {
  const configured = env.ADMIN_IDENTITY_INVITATION_MODE;
  if (configured === undefined || configured === ADMIN_IDENTITY_INVITATION_MODES.DISABLED) {
    return ADMIN_IDENTITY_INVITATION_MODES.DISABLED;
  }
  if (configured === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) {
    try { resolveV17ProductionPilotActivation(env); } catch {
      throw new AdminMembershipAccessError("ADMIN_IDENTITY_INVITATION_CONFIGURATION_INVALID", 503);
    }
    return ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT;
  }
  if (configured !== ADMIN_IDENTITY_INVITATION_MODES.LOCAL_ONLY || hasVercelMarker(env)) {
    throw new AdminMembershipAccessError("ADMIN_IDENTITY_INVITATION_CONFIGURATION_INVALID", 503);
  }
  return ADMIN_IDENTITY_INVITATION_MODES.LOCAL_ONLY;
}

export function requireAdminIdentityInvitationAccess(req, env = process.env) {
  const mode = resolveAdminIdentityInvitationMode(env);
  if (mode === ADMIN_IDENTITY_INVITATION_MODES.DISABLED) {
    throw new AdminMembershipAccessError("ADMIN_IDENTITY_INVITATIONS_DISABLED", 409);
  }
  if (mode === ADMIN_IDENTITY_INVITATION_MODES.LOCAL_ONLY && !isRealLoopbackRequest(req)) {
    throw new AdminMembershipAccessError("ADMIN_IDENTITY_INVITATION_CONFIGURATION_INVALID", 503);
  }
  return mode;
}

export function requireAdminProductionPilotContext(env, context, gate) {
  try {
    return requireV17ProductionPilotContext(
      resolveV17ProductionPilotActivation(env),
      context,
      gate,
      { A: ADMIN_PERMISSIONS },
    );
  } catch {
    throw new AdminMembershipAccessError("ADMIN_PRODUCTION_PILOT_FORBIDDEN", 403);
  }
}

export { V17_PRODUCTION_PILOT_GATES };
