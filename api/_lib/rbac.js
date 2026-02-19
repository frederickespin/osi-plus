import { unauthorized } from "./http.js";

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
  USERS_REACTIVATE: "users:reactivate",

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
};

const ROLE_PERMS = {
  A: Object.values(PERMS),
  V: [
    PERMS.TEMPLATES_VIEW,
    PERMS.TEMPLATES_CREATE,
    PERMS.TEMPLATES_EDIT_DRAFT,
    PERMS.TEMPLATES_SUBMIT,
    PERMS.CLIENTS_VIEW,
    PERMS.CLIENTS_CREATE,
    PERMS.CLIENTS_EDIT,
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

function permsForRole(role) {
  return ROLE_PERMS[role] || [];
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

export function requirePermFromHeaders(req, res, perm) {
  const role = String(req.headers["x-osi-role"] || "").toUpperCase().trim();
  if (!role) return unauthorized(res);

  const allowed = permsForRole(role).includes(perm);
  if (!allowed) return res.status(403).json({ ok: false, error: "Forbidden", perm });

  const userId = String(req.headers["x-osi-userid"] || "").trim() || null;
  return { role, userId };
}

export function requireRoleFromHeaders(req, res, roles) {
  const role = String(req.headers["x-osi-role"] || "").toUpperCase().trim();
  if (!role) return unauthorized(res);

  if (!Array.isArray(roles) || roles.length === 0) {
    return res.status(500).json({ ok: false, error: "Server misconfig", detail: "roles missing" });
  }

  if (!roles.includes(role)) {
    return res.status(403).json({ ok: false, error: "Forbidden", role, roles });
  }

  const userId = String(req.headers["x-osi-userid"] || "").trim() || null;
  return { role, userId };
}

export async function ensureActorUserId(prisma, actor) {
  if (actor.userId) {
    const byId = await prisma.user.findUnique({ where: { id: actor.userId } });
    if (byId?.id) return byId.id;
  }

  const email = actor.role === "K" ? "maria@ipackers.com" : "admin@ipackers.com";
  const user = await prisma.user.findUnique({ where: { email } });
  return user?.id || null;
}
