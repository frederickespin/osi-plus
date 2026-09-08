export type PersonnelPoliciesAccess = Readonly<{
  canViewProfiles: boolean;
  canManageProfiles: boolean;
  canViewCapabilities: boolean;
  canManageCapabilities: boolean;
  canViewPolicies: boolean;
  canManagePolicies: boolean;
  canRequestException: boolean;
  canApproveException: boolean;
  canRespondException: boolean;
  canView: boolean;
}>;

export function resolvePersonnelPoliciesAccess(
  effective: readonly string[] | null | undefined,
  denied: readonly string[] = [],
): PersonnelPoliciesAccess {
  const granted = new Set(effective || []);
  const blocked = new Set(denied);
  const can = (permission: string) =>
    granted.has(permission) && !blocked.has(permission);
  const result = {
    canViewProfiles: can("personnel:profiles:view"),
    canManageProfiles: can("personnel:profiles:manage"),
    canViewCapabilities: can("personnel:capabilities:view"),
    canManageCapabilities: can("personnel:capabilities:manage"),
    canViewPolicies: can("scheduling:policies:view"),
    canManagePolicies: can("scheduling:policies:manage"),
    canRequestException: can("scheduling:exceptions:request"),
    canApproveException: can("scheduling:exceptions:approve"),
    canRespondException: can("scheduling:exceptions:respond"),
  };
  return Object.freeze({
    ...result,
    canView: Object.values(result).some(Boolean),
  });
}
