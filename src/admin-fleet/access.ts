export type FleetAccess = Readonly<{ canView: boolean; canEdit: boolean }>;

export function resolveFleetAccess(role: string, permissions: readonly string[] | null, denied: readonly string[]): FleetAccess {
  const can = (permission: string) => Boolean(permissions?.includes(permission)) && !denied.includes(permission);
  const canView = role === "A" && can("fleet:view");
  return Object.freeze({ canView, canEdit: canView && can("fleet:edit") });
}
