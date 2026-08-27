export const ADMIN_TENANT_MEMBERSHIP_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
} as const);

export type AdminTenantMembershipMode = typeof ADMIN_TENANT_MEMBERSHIP_MODES[keyof typeof ADMIN_TENANT_MEMBERSHIP_MODES];

export function resolveAdminTenantMembershipMode(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
  hostname = window.location.hostname,
): AdminTenantMembershipMode {
  const value = environment.VITE_ADMIN_TENANT_MEMBERSHIP_MODE;
  if (value === undefined || value === ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED) return ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  if (value !== ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY) return ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  if (Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"))) return ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    ? ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY
    : ADMIN_TENANT_MEMBERSHIP_MODES.DISABLED;
}

export function isAdminTenantMembershipEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) {
  return resolveAdminTenantMembershipMode(environment, hostname) === ADMIN_TENANT_MEMBERSHIP_MODES.LOCAL_ONLY;
}
