/**
 * OSi-Plus: Mapa centralizado de roles y módulos
 * Fuente única de verdad para qué módulos ve cada rol.
 * Basado en: docs "roles y módulos" (PDF operativo)
 */

import type { UserRole } from "@/types/osi.types";

export type ModuleId =
  | "dashboard"
  | "operations"
  | "security"
  | "driver"
  | "supervisor"
  | "mechanic"
  | "maintenance"
  | "osi-editor"
  | "supervisor-nota"
  | "sales-approvals"
  | "dispatch"
  | "field"
  | "wms"
  | "inventory"
  | "clients"
  | "sales-quote"
  | "commercial-calendar"
  | "commercial-config"
  | "tracking"
  | "hr"
  | "carpentry"
  | "users"
  | "billing"
  | "fleet"
  | "projects"
  | "calendar"
  | "wall"
  | "purchases"
  | "kpi"
  | "nota"
  | "badges"
  | "nesting"
  | "nestingv2"
  | "disenacotiza"
  | "crate-wood"
  | "crate-settings"
  | "k-templates"
  | "k-template-editor"
  | "a-template-approvals"
  | "k-dashboard"
  | "k-project"
  | "settings";

/**
 * Módulos permitidos por rol (Admin A ve todos implícitamente).
 * PDF: Grupo 1 (Web) A,V,K,B,C,I | Grupo 2 (Móvil) C1,D,E,G,N,PA,PB,PC,PD,PE,PF
 */
export const MODULES_BY_ROLE: Record<UserRole, ModuleId[]> = {
  A: [
    "dashboard", "users", "settings", "fleet", "a-template-approvals",
    "clients", "sales-quote", "commercial-calendar", "commercial-config", "projects",
    "k-dashboard", "k-templates", "osi-editor",
    "operations", "dispatch", "tracking", "calendar", "wall", "security",
    "field", "supervisor", "supervisor-nota", "mechanic", "maintenance", "carpentry",
    "wms", "inventory", "purchases",
    "hr", "kpi", "nota", "badges",
  ],
  V: ["clients", "sales-quote", "commercial-calendar", "commercial-config", "projects", "osi-editor"],
  K: ["k-dashboard", "clients", "projects", "commercial-calendar", "k-templates", "osi-editor", "tracking"],
  B: ["operations", "tracking", "calendar", "wall", "projects"],
  C: ["wms", "inventory", "purchases", "carpentry"],
  C1: ["dispatch"],
  D: ["supervisor", "supervisor-nota", "operations", "tracking"],
  E: ["driver"],
  G: ["security"],
  N: ["field"],
  PA: ["carpentry"],
  PB: ["mechanic"],
  PC: ["field"],
  PD: ["maintenance"],
  PF: ["field"],
  I: ["hr", "kpi", "nota", "badges"],
  PE: ["supervisor", "field"],
  RB: ["field"],
};

/**
 * Módulo por defecto al iniciar sesión según el rol.
 * PDF: Cada rol opera su "módulo principal" primero.
 */
export function getDefaultModuleForRole(role: UserRole): ModuleId {
  const map: Record<UserRole, ModuleId> = {
    A: "dashboard",
    V: "clients",
    K: "k-dashboard",
    B: "operations",
    C: "wms",
    C1: "dispatch",
    D: "supervisor",
    E: "driver",
    G: "security",
    N: "field",
    PA: "carpentry",
    PB: "mechanic",   // Mecánico
    PC: "field",     // Instalador
    PD: "maintenance",
    PF: "field",
    I: "hr",
    PE: "supervisor",
    RB: "clients",
  };
  return map[role] ?? "clients";
}

/**
 * Verifica si un rol puede acceder a un módulo.
 */
export function canAccessModule(role: UserRole, moduleId: ModuleId): boolean {
  if (role === "A") return true;
  return MODULES_BY_ROLE[role]?.includes(moduleId) ?? false;
}
