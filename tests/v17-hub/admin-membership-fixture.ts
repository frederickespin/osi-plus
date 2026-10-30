import {
  ADMIN_MEMBERSHIP_ROLE_OPTIONS,
  adminMembershipPermissionPresentation,
} from "../../shared/adminMembershipCatalog.js";

export const ADMIN_MEMBERSHIP_PERMISSIONS = [
  "membership:view",
  "membership:update:role",
  "membership:update:permissions",
  "membership:update:status",
];

const permissionCodes = [
  ...ADMIN_MEMBERSHIP_PERMISSIONS,
  "osi:view",
  "templates:view",
  "projects:view",
  "pipeline:view",
  "logistics:rules:view",
  "logistics:rules:manage",
];

// A small synthetic catalog exercises the API contract without importing server
// modules into the browser harness. Its inherited permissions are a subset of
// the server role defaults; explicit membership/logistics permissions are never
// invented as role-A inheritance.
export const ADMIN_BROWSER_CATALOG = {
  roles: ADMIN_MEMBERSHIP_ROLE_OPTIONS.map(({ code, label }) => ({
    code,
    label,
    inheritedPermissions: [
      "osi:view",
      ...(["A", "V", "K", "B", "C", "C1", "I"].includes(code) ? ["templates:view"] : []),
      ...(["A", "V", "K", "B"].includes(code) ? ["projects:view"] : []),
      ...(["A", "V"].includes(code) ? ["pipeline:view"] : []),
    ],
  })),
  permissions: permissionCodes.map((code) => ({ code, ...adminMembershipPermissionPresentation(code) })),
};

export function adminPermissionLabel(code: string) {
  const permission = ADMIN_BROWSER_CATALOG.permissions.find((item) => item.code === code);
  if (!permission) throw new Error(`Missing synthetic permission: ${code}`);
  return permission.label;
}
