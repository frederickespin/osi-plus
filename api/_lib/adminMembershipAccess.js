import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";

export const ADMIN_TENANT_MEMBERSHIP_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
});

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
  if (!isRealLoopbackRequest(req)) {
    throw new AdminMembershipAccessError("ADMIN_TENANT_MEMBERSHIP_CONFIGURATION_INVALID", 503);
  }
  return mode;
}
