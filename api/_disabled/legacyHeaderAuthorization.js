// Archivo aislado para conservar exclusivamente ejemplos históricos desactivados.
// Ninguna ruta activa puede importar este módulo.
import { unauthorized } from "../_lib/http.js";
import { permsForRole } from "../_lib/rbac.js";

export function requirePermFromHeaders(req, res, permission) {
  const role = String(req.headers["x-osi-role"] || "").toUpperCase().trim();
  if (!role) return unauthorized(res);
  if (!permsForRole(role).includes(permission)) {
    return res.status(403).json({ ok: false, error: "Forbidden", perm: permission });
  }
  return { role, userId: String(req.headers["x-osi-userid"] || "").trim() || null };
}

export function requireRoleFromHeaders(req, res, roles) {
  const role = String(req.headers["x-osi-role"] || "").toUpperCase().trim();
  if (!role) return unauthorized(res);
  if (!Array.isArray(roles) || !roles.includes(role)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  return { role, userId: String(req.headers["x-osi-userid"] || "").trim() || null };
}

export async function ensureActorUserId(prisma, actor) {
  if (!actor?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true } });
  return user?.id || null;
}
