import { unauthorized } from "./http.js";

export const PERMS = Object.freeze({
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
  USERS_REACTIVATE: "users:reactivate",

  // Tenant Membership administration. These are explicit grants only.
  MEMBERSHIP_VIEW: "membership:view",
  MEMBERSHIP_UPDATE_ROLE: "membership:update:role",
  MEMBERSHIP_UPDATE_PERMISSIONS: "membership:update:permissions",
  MEMBERSHIP_UPDATE_STATUS: "membership:update:status",

  // Clients
  CLIENTS_VIEW: "clients:view",
  CLIENTS_CREATE: "clients:create",
  CLIENTS_EDIT: "clients:edit",

  // Commercial pipeline
  PIPELINE_VIEW: "pipeline:view",
  PIPELINE_UPDATE: "pipeline:update",
  PIPELINE_TRANSITION: "pipeline:transition",
  PIPELINE_ASSIGN: "pipeline:assign",
  PIPELINE_CREATE: "pipeline:create",
  PIPELINE_CREATE_PENDING_DESTINATION: "pipeline:create:pending-destination",
  PIPELINE_UPDATE_OWN: "pipeline:update:own",
  PIPELINE_UPDATE_ANY: "pipeline:update:any",

  // V17 Services. Catalog and case-service permissions are explicit grants only.
  SERVICES_CATALOG_VIEW: "services:catalog:view",
  SERVICES_CATALOG_MANAGE: "services:catalog:manage",
  SERVICES_CASE_VIEW: "services:case:view",
  SERVICES_CASE_UPDATE: "services:case:update",

  // V17 Survey. Assignment, execution and publication are explicit grants only.
  SURVEY_ASSIGNMENT_VIEW: "survey:assignment:view",
  SURVEY_ASSIGNMENT_MANAGE: "survey:assignment:manage",
  SURVEY_PERFORM: "survey:perform",
  SURVEY_PUBLISH: "survey:publish",
  SURVEY_READ: "survey:read",

  // Projects
  PROJECTS_VIEW: "projects:view",
  PROJECTS_CREATE: "projects:create",
  PROJECTS_EDIT: "projects:edit",
  PROJECTS_VALIDATE: "projects:validate",
  PROJECTS_RELEASE: "projects:release",

  // OSI
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

  // WMS / Inventory
  WMS_VIEW: "wms:view",
  WMS_SCAN: "wms:scan",
  WMS_TRANSFER: "wms:transfer",
  INVENTORY_VIEW: "inventory:view",
  INVENTORY_EDIT: "inventory:edit",
  PURCHASES_VIEW: "purchases:view",
  PURCHASES_CREATE: "purchases:create",
  INVENTORY_CATALOG_VIEW: "inventory:catalog:view",
  INVENTORY_CATALOG_MANAGE: "inventory:catalog:manage",
  INVENTORY_STOCK_VIEW: "inventory:stock:view",
  INVENTORY_STOCK_RECEIVE: "inventory:stock:receive",
  INVENTORY_STOCK_TRANSFER: "inventory:stock:transfer",
  INVENTORY_STOCK_ISSUE: "inventory:stock:issue",
  INVENTORY_STOCK_ADJUST: "inventory:stock:adjust",
  INVENTORY_RESERVATION_MANAGE: "inventory:reservation:manage",
  INVENTORY_PURCHASE_REQUEST: "inventory:purchase:request",
  INVENTORY_PURCHASE_APPROVE: "inventory:purchase:approve",
  INVENTORY_RECIPES_VIEW: "inventory:recipes:view",
  INVENTORY_RECIPES_MANAGE: "inventory:recipes:manage",

  // V17 reusable assets. Every permission is an explicit membership grant.
  ASSETS_MODEL_VIEW: "assets:model:view",
  ASSETS_MODEL_MANAGE: "assets:model:manage",
  ASSETS_INSTANCE_VIEW: "assets:instance:view",
  ASSETS_INSTANCE_MANAGE: "assets:instance:manage",
  ASSETS_RESERVATION_MANAGE: "assets:reservation:manage",
  ASSETS_ASSIGNMENT_MANAGE: "assets:assignment:manage",
  ASSETS_INSPECTION_PERFORM: "assets:inspection:perform",
  ASSETS_MAINTENANCE_VIEW: "assets:maintenance:view",
  ASSETS_MAINTENANCE_MANAGE: "assets:maintenance:manage",
  ASSETS_INCIDENT_MANAGE: "assets:incident:manage",
  ASSETS_EXTERNAL_VIEW: "assets:external:view",
  ASSETS_EXTERNAL_MANAGE: "assets:external:manage",

  // HR
  HR_VIEW: "hr:view",
  HR_KPI: "hr:kpi",
  HR_NOTA: "hr:nota",
  HR_BADGES: "hr:badges",

  // Fleet
  FLEET_VIEW: "fleet:view",
  FLEET_EDIT: "fleet:edit",

  // Security / Gate
  SECURITY_VIEW: "security:view",
  SECURITY_SCAN: "security:scan",
});

// These mutation permissions are always explicit membership grants. Merely
// holding a baseline role never enables a transactional case mutation.
const EXPLICIT_PIPELINE_MUTATION_PERMISSIONS = new Set([
  PERMS.PIPELINE_CREATE,
  PERMS.PIPELINE_CREATE_PENDING_DESTINATION,
  PERMS.PIPELINE_UPDATE_OWN,
  PERMS.PIPELINE_UPDATE_ANY,
]);

const EXPLICIT_MEMBERSHIP_ADMIN_PERMISSIONS = new Set([
  PERMS.MEMBERSHIP_VIEW,
  PERMS.MEMBERSHIP_UPDATE_ROLE,
  PERMS.MEMBERSHIP_UPDATE_PERMISSIONS,
  PERMS.MEMBERSHIP_UPDATE_STATUS,
]);

const EXPLICIT_SERVICE_PERMISSIONS = new Set([
  PERMS.SERVICES_CATALOG_VIEW,
  PERMS.SERVICES_CATALOG_MANAGE,
  PERMS.SERVICES_CASE_VIEW,
  PERMS.SERVICES_CASE_UPDATE,
]);

const EXPLICIT_SURVEY_PERMISSIONS = new Set([
  PERMS.SURVEY_ASSIGNMENT_VIEW,
  PERMS.SURVEY_ASSIGNMENT_MANAGE,
  PERMS.SURVEY_PERFORM,
  PERMS.SURVEY_PUBLISH,
  PERMS.SURVEY_READ,
]);

const EXPLICIT_MATERIALS_INVENTORY_PERMISSIONS = new Set([
  PERMS.INVENTORY_CATALOG_VIEW,
  PERMS.INVENTORY_CATALOG_MANAGE,
  PERMS.INVENTORY_STOCK_VIEW,
  PERMS.INVENTORY_STOCK_RECEIVE,
  PERMS.INVENTORY_STOCK_TRANSFER,
  PERMS.INVENTORY_STOCK_ISSUE,
  PERMS.INVENTORY_STOCK_ADJUST,
  PERMS.INVENTORY_RESERVATION_MANAGE,
  PERMS.INVENTORY_PURCHASE_REQUEST,
  PERMS.INVENTORY_PURCHASE_APPROVE,
  PERMS.INVENTORY_RECIPES_VIEW,
  PERMS.INVENTORY_RECIPES_MANAGE,
]);

const EXPLICIT_ASSET_PERMISSIONS = new Set([
  PERMS.ASSETS_MODEL_VIEW,
  PERMS.ASSETS_MODEL_MANAGE,
  PERMS.ASSETS_INSTANCE_VIEW,
  PERMS.ASSETS_INSTANCE_MANAGE,
  PERMS.ASSETS_RESERVATION_MANAGE,
  PERMS.ASSETS_ASSIGNMENT_MANAGE,
  PERMS.ASSETS_INSPECTION_PERFORM,
  PERMS.ASSETS_MAINTENANCE_VIEW,
  PERMS.ASSETS_MAINTENANCE_MANAGE,
  PERMS.ASSETS_INCIDENT_MANAGE,
  PERMS.ASSETS_EXTERNAL_VIEW,
  PERMS.ASSETS_EXTERNAL_MANAGE,
]);

const ROLE_PERMS = {
  A: Object.values(PERMS).filter((permission) =>
    !EXPLICIT_PIPELINE_MUTATION_PERMISSIONS.has(permission)
    && !EXPLICIT_MEMBERSHIP_ADMIN_PERMISSIONS.has(permission)
    && !EXPLICIT_SERVICE_PERMISSIONS.has(permission)
    && !EXPLICIT_SURVEY_PERMISSIONS.has(permission)
    && !EXPLICIT_MATERIALS_INVENTORY_PERMISSIONS.has(permission)
    && !EXPLICIT_ASSET_PERMISSIONS.has(permission)),
  V: [
    PERMS.TEMPLATES_VIEW,
    PERMS.TEMPLATES_CREATE,
    PERMS.TEMPLATES_EDIT_DRAFT,
    PERMS.TEMPLATES_SUBMIT,
    PERMS.CLIENTS_VIEW,
    PERMS.CLIENTS_CREATE,
    PERMS.CLIENTS_EDIT,
    PERMS.PIPELINE_VIEW,
    PERMS.PIPELINE_UPDATE,
    PERMS.PIPELINE_TRANSITION,
    PERMS.PROJECTS_VIEW,
    PERMS.PROJECTS_CREATE,
    PERMS.PROJECTS_EDIT,
    PERMS.OSI_VIEW,
    PERMS.OSI_CREATE,
    PERMS.OSI_EDIT,
    PERMS.OPS_CALENDAR,
  ],
  K: [
    PERMS.TEMPLATES_VIEW,
    PERMS.TEMPLATES_CREATE,
    PERMS.TEMPLATES_EDIT_DRAFT,
    PERMS.TEMPLATES_SUBMIT,
    PERMS.CLIENTS_VIEW,
    PERMS.PROJECTS_VIEW,
    PERMS.PROJECTS_CREATE,
    PERMS.PROJECTS_VALIDATE,
    PERMS.PROJECTS_RELEASE,
    PERMS.OSI_VIEW,
    PERMS.OSI_EDIT,
    PERMS.OPS_VIEW,
    PERMS.OPS_TRACKING,
    PERMS.OPS_CALENDAR,
  ],
  B: [
    PERMS.TEMPLATES_VIEW,
    PERMS.OPS_VIEW,
    PERMS.OPS_TRACKING,
    PERMS.OPS_CALENDAR,
    PERMS.OPS_WALL,
    PERMS.OSI_VIEW,
    PERMS.OSI_CREATE,
    PERMS.OSI_EDIT,
    PERMS.OSI_ASSIGN,
    PERMS.PROJECTS_VIEW,
  ],
  C: [
    PERMS.TEMPLATES_VIEW,
    PERMS.WMS_VIEW,
    PERMS.WMS_SCAN,
    PERMS.WMS_TRANSFER,
    PERMS.INVENTORY_VIEW,
    PERMS.INVENTORY_EDIT,
    PERMS.PURCHASES_VIEW,
    PERMS.PURCHASES_CREATE,
    PERMS.OSI_VIEW,
  ],
  C1: [
    PERMS.TEMPLATES_VIEW,
    PERMS.OSI_VIEW,
    PERMS.OSI_DISPATCH,
    PERMS.WMS_VIEW,
    PERMS.WMS_SCAN,
  ],
  D: [PERMS.OSI_VIEW, PERMS.OSI_EDIT, PERMS.OPS_VIEW, PERMS.OPS_TRACKING],
  E: [PERMS.OSI_VIEW, PERMS.OPS_TRACKING],
  G: [PERMS.SECURITY_VIEW, PERMS.SECURITY_SCAN, PERMS.OSI_VIEW],
  N: [PERMS.OSI_VIEW],
  PA: [PERMS.WMS_VIEW, PERMS.OSI_VIEW],
  PB: [PERMS.OSI_VIEW, PERMS.FLEET_VIEW],
  PC: [PERMS.OSI_VIEW],
  PD: [PERMS.OSI_VIEW, PERMS.FLEET_VIEW],
  PF: [PERMS.OSI_VIEW],
  I: [
    PERMS.TEMPLATES_VIEW,
    PERMS.USERS_VIEW,
    PERMS.USERS_REACTIVATE,
    PERMS.HR_VIEW,
    PERMS.HR_KPI,
    PERMS.HR_NOTA,
    PERMS.HR_BADGES,
    PERMS.OSI_VIEW,
  ],
  PE: [PERMS.OSI_VIEW],
  RB: [PERMS.OSI_VIEW],
};

export function permsForRole(role) {
  return [...(ROLE_PERMS[String(role || "").toUpperCase().trim()] || [])];
}

export function effectivePermissionsFor(role, grantedPermissions = [], deniedPermissions = []) {
  const denied = new Set((Array.isArray(deniedPermissions) ? deniedPermissions : []).map(String));
  return Object.freeze([...new Set([
    ...permsForRole(role),
    ...(Array.isArray(grantedPermissions) ? grantedPermissions.map(String) : []),
  ])].filter((permission) => !denied.has(permission)).sort());
}

export function requirePerm(req, res, perm) {
  const role = req.user?.role;
  if (!role) {
    unauthorized(res);
    return false;
  }
  const allowed = permsForRole(role).includes(perm);
  if (!allowed) {
    res.status(403).json({ ok: false, error: "Forbidden", perm });
    return false;
  }
  return true;
}
