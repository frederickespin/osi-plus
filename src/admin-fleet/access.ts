export type FleetAccess = Readonly<{
  canView: boolean;
  canEdit: boolean;
  canAssignDrivers: boolean;
  canRequestDrivers: boolean;
  canAuthorizeDrivers: boolean;
}>;

export function resolveFleetAccess(role: string, permissions: readonly string[] | null, denied: readonly string[]): FleetAccess {
  const can = (permission: string) => Boolean(permissions?.includes(permission)) && !denied.includes(permission);
  const designatedOperations = role === "B" && ["fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize"].some(can);
  const canView = (role === "A" || designatedOperations) && can("fleet:view");
  return Object.freeze({
    canView,
    canEdit: canView && role === "A" && can("fleet:edit"),
    canAssignDrivers: canView && can("fleet:drivers:assign"),
    canRequestDrivers: canView && can("fleet:drivers:request"),
    canAuthorizeDrivers: canView && can("fleet:drivers:authorize"),
  });
}
