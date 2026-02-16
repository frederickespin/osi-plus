import { unauthorized } from "./http.js";

export const PERMS = {
  TEMPLATES_VIEW: "templates:view",
  TEMPLATES_CREATE: "templates:create",
  TEMPLATES_EDIT_DRAFT: "templates:edit_draft",
  TEMPLATES_SUBMIT: "templates:submit_for_approval",
  TEMPLATES_APPROVE: "templates:approve",
  TEMPLATES_REJECT: "templates:reject",
  TEMPLATES_PUBLISH: "templates:publish",
  TEMPLATES_ARCHIVE: "templates:archive",
};

function permsForRole(role) {
  if (role === "A") {
    return [
      PERMS.TEMPLATES_VIEW,
      PERMS.TEMPLATES_APPROVE,
      PERMS.TEMPLATES_REJECT,
      PERMS.TEMPLATES_PUBLISH,
      PERMS.TEMPLATES_ARCHIVE,
      PERMS.TEMPLATES_CREATE,
    ];
  }

  if (role === "K") {
    return [
      PERMS.TEMPLATES_VIEW,
      PERMS.TEMPLATES_CREATE,
      PERMS.TEMPLATES_EDIT_DRAFT,
      PERMS.TEMPLATES_SUBMIT,
    ];
  }

  if (role === "V") {
    return [PERMS.TEMPLATES_VIEW];
  }

  return [];
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
    // If the caller passed an ID, verify it exists to avoid FK violations.
    // Frontend may send placeholders like "seed-admin" during MVP auth.
    const byId = await prisma.user.findUnique({ where: { id: actor.userId } });
    if (byId?.id) return byId.id;
  }

  // Fallback: mapear por rol a un usuario existente (MVP mientras no haya login real)
  // A -> admin@ipackers.com, K -> maria@ipackers.com, otros -> admin.
  const email =
    actor.role === "K" ? "maria@ipackers.com" : "admin@ipackers.com";

  const user = await prisma.user.findUnique({ where: { email } });
  return user?.id || null;
}
