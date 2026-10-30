import type { AdminMembership, AdminMembershipCatalog, AdminMembershipChanges } from "./adminApi";

export type MembershipPermissionOverride = "INHERIT" | "ALLOW" | "DENY";

function sameSet(left: readonly string[], right: readonly string[]) {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((item) => b.has(item));
}

export function buildMembershipChanges(
  selected: AdminMembership,
  draft: AdminMembership,
  can: (permission: string) => boolean,
): AdminMembershipChanges {
  const changes: { role?: AdminMembership["role"]; status?: AdminMembership["status"]; grantedPermissions?: readonly string[]; deniedPermissions?: readonly string[] } = {};
  if (can("membership:update:role") && selected.role !== draft.role) changes.role = draft.role;
  if (can("membership:update:status") && selected.status !== draft.status) changes.status = draft.status;
  if (can("membership:update:permissions")) {
    if (!sameSet(selected.grantedPermissions, draft.grantedPermissions)) changes.grantedPermissions = [...draft.grantedPermissions].sort();
    if (!sameSet(selected.deniedPermissions, draft.deniedPermissions)) changes.deniedPermissions = [...draft.deniedPermissions].sort();
  }
  return Object.freeze(changes);
}

export function setMembershipPermissionOverride(draft: AdminMembership, code: string, value: MembershipPermissionOverride): AdminMembership {
  const granted = new Set(draft.grantedPermissions);
  const denied = new Set(draft.deniedPermissions);
  granted.delete(code);
  denied.delete(code);
  if (value === "ALLOW") granted.add(code);
  if (value === "DENY") denied.add(code);
  return { ...draft, grantedPermissions: [...granted].sort(), deniedPermissions: [...denied].sort() };
}

export function permissionPresentationRows(draft: AdminMembership, catalog: AdminMembershipCatalog) {
  const inherited = new Set(catalog.roles.find((role) => role.code === draft.role)?.inheritedPermissions || []);
  const granted = new Set(draft.grantedPermissions);
  const denied = new Set(draft.deniedPermissions);
  const known = new Set(catalog.permissions.map((permission) => permission.code));
  const permissions = [
    ...catalog.permissions.map((permission) => ({ ...permission, known: true })),
    ...[...new Set([...granted, ...denied])].filter((code) => !known.has(code)).sort().map((code) => ({ code, label: code, group: "Otros permisos existentes", known: false })),
  ];
  return permissions.map((permission) => ({
    ...permission,
    inherited: inherited.has(permission.code),
    granted: granted.has(permission.code),
    denied: denied.has(permission.code),
    hasOverride: granted.has(permission.code) || denied.has(permission.code),
    effective: !denied.has(permission.code) && (inherited.has(permission.code) || granted.has(permission.code)),
    override: (denied.has(permission.code) ? "DENY" : granted.has(permission.code) ? "ALLOW" : "INHERIT") as MembershipPermissionOverride,
  }));
}
