import { permsForRole } from "./rbac.js";

export const EMPLOYEE_PROVISIONING_PERMISSIONS = Object.freeze({
  REQUEST: "employee:provisioning:request",
  VIEW: "employee:provisioning:view",
  VIEW_PII: "employee:provisioning:pii:view",
  APPROVE: "employee:provisioning:approve",
  CANCEL: "employee:provisioning:cancel",
  ROLE_A_PROPOSE: "employee:role:a:propose",
  ROLE_A_ASSIGN: "employee:role:a:assign",
});

export const EMPLOYEE_PROVISIONING_ROLES = Object.freeze([
  "A", "V", "K", "B", "C", "C1", "D", "E", "G", "N", "PA", "PB", "PC", "PD", "PF", "I", "PE",
]);

const NEVER_DELEGABLE = new Set([
  "users:create",
  EMPLOYEE_PROVISIONING_PERMISSIONS.ROLE_A_ASSIGN,
  EMPLOYEE_PROVISIONING_PERMISSIONS.ROLE_A_PROPOSE,
]);

/**
 * Política de delegación cerrada: sólo permisos conocidos por el rol de destino,
 * nunca permisos administrativos de cuatro ojos. No modifica el RBAC heredado.
 */
export function delegablePermissionsForRole(role) {
  return Object.freeze(permsForRole(role).filter((permission) => !NEVER_DELEGABLE.has(permission)).sort());
}

export function effectiveDelegatedPermissions({ role, requested = [], deciderEffective = [], denied = [] }) {
  const allowed = new Set(delegablePermissionsForRole(role));
  const decider = new Set(deciderEffective.map(String));
  const blocked = new Set(denied.map(String));
  return Object.freeze([...new Set(requested.map(String))]
    .filter((permission) => allowed.has(permission) && decider.has(permission) && !blocked.has(permission))
    .sort());
}
