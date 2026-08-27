import { V17_PRODUCTION_PILOT_MODE, isV17ProductionPilotClientEnvironment } from "../../shared/v17ProductionPilot.js";

export const ADMIN_TENANT_MEMBERSHIP_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PRODUCTION_PILOT: V17_PRODUCTION_PILOT_MODE,
} as const);

export const ADMIN_IDENTITY_INVITATION_MODES = ADMIN_TENANT_MEMBERSHIP_MODES;

export type AdminTenantMembershipMode = typeof ADMIN_TENANT_MEMBERSHIP_MODES[keyof typeof ADMIN_TENANT_MEMBERSHIP_MODES];

export function resolveAdminTenantMembershipMode(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
  hostname = window.location.hostname,
  runtime = {
    hostname,
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  },
): AdminTenantMembershipMode {
  const value = environment.VITE_ADMIN_TENANT_MEMBERSHIP_MODE;
  if (value === undefined || value === ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED) return ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  if (value === ADMIN_TENANT_MEMBERSHIP_MODES.PRODUCTION_PILOT) {
    return isV17ProductionPilotClientEnvironment(runtime)
      ? ADMIN_TENANT_MEMBERSHIP_MODES.PRODUCTION_PILOT
      : ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  }
  if (value !== ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY) return ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  if (Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"))) return ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    ? ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY
    : ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
}

export function isAdminTenantMembershipEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string, runtime?: Readonly<{ hostname?: string; vercelEnvironment?: string | null; gitBranch?: string | null }>) {
  const mode = resolveAdminTenantMembershipMode(environment, hostname, runtime);
  return mode === ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY || mode === ADMIN_TENANT_MEMBERSHIP_MODES.PRODUCTION_PILOT;
}

export function resolveAdminIdentityInvitationMode(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
  hostname = window.location.hostname,
  runtime = {
    hostname,
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  },
): AdminTenantMembershipMode {
  return resolveAdminTenantMembershipMode(
    { ...environment, VITE_ADMIN_TENANT_MEMBERSHIP_MODE: environment.VITE_ADMIN_IDENTITY_INVITATION_MODE },
    hostname,
    runtime,
  );
}

export function isAdminIdentityInvitationEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string, runtime?: Readonly<{ hostname?: string; vercelEnvironment?: string | null; gitBranch?: string | null }>) {
  const mode = resolveAdminIdentityInvitationMode(environment, hostname, runtime);
  return mode === ADMIN_IDENTITY_INVITATION_MODES.LOCAL_ONLY || mode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT;
}
