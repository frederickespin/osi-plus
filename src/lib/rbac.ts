/**
 * OSi-Plus RBAC (Role-Based Access Control)
 * Comprehensive permissions for all 12+ user roles
 */

export const PERMS = {
  // Templates
  TEMPLATES_VIEW: "templates:view",
  TEMPLATES_CREATE: "templates:create",
  TEMPLATES_EDIT_DRAFT: "templates:edit_draft",
  TEMPLATES_SUBMIT: "templates:submit_for_approval",
  TEMPLATES_APPROVE: "templates:approve",
  TEMPLATES_REJECT: "templates:reject",
  TEMPLATES_PUBLISH: "templates:publish",
  TEMPLATES_ARCHIVE: "templates:archive",
  
  // Users
  USERS_VIEW: "users:view",
  USERS_CREATE: "users:create",
  USERS_EDIT: "users:edit",
  USERS_DELETE: "users:delete",
  
  // Clients
  CLIENTS_VIEW: "clients:view",
  CLIENTS_CREATE: "clients:create",
  CLIENTS_EDIT: "clients:edit",
  
  // Projects
  PROJECTS_VIEW: "projects:view",
  PROJECTS_CREATE: "projects:create",
  PROJECTS_EDIT: "projects:edit",
  PROJECTS_VALIDATE: "projects:validate",
  PROJECTS_RELEASE: "projects:release",
  
  // OSI (Ordenes de Servicio)
  OSI_VIEW: "osi:view",
  OSI_CREATE: "osi:create",
  OSI_EDIT: "osi:edit",
  OSI_DISPATCH: "osi:dispatch",
  OSI_ASSIGN: "osi:assign",
  
  // Operations
  OPS_VIEW: "ops:view",
  OPS_TRACKING: "ops:tracking",
  OPS_CALENDAR: "ops:calendar",
  OPS_WALL: "ops:wall",
  
  // Field Operations
  FIELD_SCAN_QR: "field:scan_qr",
  FIELD_CHECKLIST: "field:checklist",
  FIELD_SUPERVISOR: "field:supervisor",
  FIELD_NOTA: "field:nota",
  
  // WMS / Inventory
  WMS_VIEW: "wms:view",
  WMS_SCAN: "wms:scan",
  WMS_TRANSFER: "wms:transfer",
  INVENTORY_VIEW: "inventory:view",
  INVENTORY_EDIT: "inventory:edit",
  PURCHASES_VIEW: "purchases:view",
  PURCHASES_CREATE: "purchases:create",
  
  // HR
  HR_VIEW: "hr:view",
  HR_KPI: "hr:kpi",
  HR_NOTA: "hr:nota",
  HR_BADGES: "hr:badges",
  
  // Fleet
  FLEET_VIEW: "fleet:view",
  FLEET_EDIT: "fleet:edit",
  
  // Settings
  SETTINGS_VIEW: "settings:view",
  SETTINGS_EDIT: "settings:edit",
  
  // Security / Gate
  SECURITY_VIEW: "security:view",
  SECURITY_SCAN: "security:scan",
} as const;

export type Perm = (typeof PERMS)[keyof typeof PERMS];

export type RoleCode =
  | "A"   // Administrador
  | "V"   // Ventas
  | "K"   // Coordinador
  | "B"   // Operaciones
  | "C"   // Materiales
  | "C1"  // Despachador
  | "D"   // Supervisor
  | "E"   // Chofer
  | "G"   // Portería
  | "N"   // Personal de Campo
  | "PA"  // Carpintero
  | "PB"  // Mecánico
  | "PC"  // (Reservado)
  | "PD"  // Mantenimiento
  | "PF"  // (Reservado)
  | "I"   // RRHH
  | "PE"  // Supervisor Externo
  | "RB"; // (Reservado)

/**
 * Permission mappings for each role
 */
const ROLE_PERMISSIONS: Record<RoleCode, Perm[]> = {
  // Administrador - Full access
  A: Object.values(PERMS),
  
  // Ventas (Sales / Key Account)
  V: [
    PERMS.TEMPLATES_VIEW,
    PERMS.CLIENTS_VIEW, PERMS.CLIENTS_CREATE, PERMS.CLIENTS_EDIT,
    PERMS.PROJECTS_VIEW, PERMS.PROJECTS_CREATE, PERMS.PROJECTS_EDIT,
    PERMS.OSI_VIEW, PERMS.OSI_CREATE, PERMS.OSI_EDIT,
    PERMS.OPS_CALENDAR,
  ],
  
  // Coordinador
  K: [
    PERMS.TEMPLATES_VIEW, PERMS.TEMPLATES_CREATE, PERMS.TEMPLATES_EDIT_DRAFT, PERMS.TEMPLATES_SUBMIT,
    PERMS.CLIENTS_VIEW,
    PERMS.PROJECTS_VIEW, PERMS.PROJECTS_VALIDATE, PERMS.PROJECTS_RELEASE,
    PERMS.OSI_VIEW, PERMS.OSI_EDIT,
    PERMS.OPS_VIEW, PERMS.OPS_TRACKING, PERMS.OPS_CALENDAR,
  ],
  
  // Operaciones
  B: [
    PERMS.OPS_VIEW, PERMS.OPS_TRACKING, PERMS.OPS_CALENDAR, PERMS.OPS_WALL,
    PERMS.OSI_VIEW, PERMS.OSI_ASSIGN,
    PERMS.PROJECTS_VIEW,
  ],
  
  // Materiales
  C: [
    PERMS.WMS_VIEW, PERMS.WMS_SCAN, PERMS.WMS_TRANSFER,
    PERMS.INVENTORY_VIEW, PERMS.INVENTORY_EDIT,
    PERMS.PURCHASES_VIEW, PERMS.PURCHASES_CREATE,
    PERMS.OSI_VIEW,
  ],
  
  // Despachador
  C1: [
    PERMS.OSI_VIEW, PERMS.OSI_DISPATCH,
    PERMS.FIELD_SCAN_QR, PERMS.FIELD_CHECKLIST,
    PERMS.WMS_VIEW, PERMS.WMS_SCAN,
  ],
  
  // Supervisor
  D: [
    PERMS.OSI_VIEW, PERMS.OSI_EDIT,
    PERMS.FIELD_SCAN_QR, PERMS.FIELD_CHECKLIST, PERMS.FIELD_SUPERVISOR, PERMS.FIELD_NOTA,
    PERMS.OPS_VIEW, PERMS.OPS_TRACKING,
  ],
  
  // Chofer
  E: [
    PERMS.OSI_VIEW,
    PERMS.FIELD_SCAN_QR, PERMS.FIELD_CHECKLIST,
    PERMS.OPS_TRACKING,
  ],
  
  // Portería
  G: [
    PERMS.SECURITY_VIEW, PERMS.SECURITY_SCAN,
    PERMS.FIELD_SCAN_QR,
    PERMS.OSI_VIEW,
  ],
  
  // Personal de Campo
  N: [
    PERMS.FIELD_SCAN_QR, PERMS.FIELD_CHECKLIST, PERMS.FIELD_NOTA,
    PERMS.OSI_VIEW,
  ],
  
  // Carpintero
  PA: [
    PERMS.WMS_VIEW,
    PERMS.OSI_VIEW,
    PERMS.FIELD_NOTA,
  ],
  
  // Mecánico
  PB: [
    PERMS.OSI_VIEW,
    PERMS.FIELD_NOTA,
    PERMS.FLEET_VIEW,
  ],
  
  // PC (Reservado)
  PC: [PERMS.OSI_VIEW],
  
  // Mantenimiento
  PD: [
    PERMS.OSI_VIEW,
    PERMS.FIELD_NOTA,
    PERMS.FLEET_VIEW,
  ],
  
  // PF (Reservado)
  PF: [PERMS.OSI_VIEW],
  
  // RRHH
  I: [
    PERMS.USERS_VIEW,
    PERMS.HR_VIEW, PERMS.HR_KPI, PERMS.HR_NOTA, PERMS.HR_BADGES,
    PERMS.OSI_VIEW,
  ],
  
  // Supervisor Externo
  PE: [
    PERMS.OSI_VIEW,
    PERMS.FIELD_SCAN_QR, PERMS.FIELD_CHECKLIST,
  ],
  
  // RB (Reservado)
  RB: [PERMS.OSI_VIEW],
};

/**
 * Get all permissions for a given role
 */
export function permsForRole(role: RoleCode): Perm[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role has a specific permission
 */
export function hasPerm(role: RoleCode, perm: Perm): boolean {
  return permsForRole(role).includes(perm);
}

/**
 * Check if a role has any of the given permissions
 */
export function hasAnyPerm(role: RoleCode, perms: Perm[]): boolean {
  const rolePerms = permsForRole(role);
  return perms.some(p => rolePerms.includes(p));
}

/**
 * Check if a role has all of the given permissions
 */
export function hasAllPerms(role: RoleCode, perms: Perm[]): boolean {
  const rolePerms = permsForRole(role);
  return perms.every(p => rolePerms.includes(p));
}

