import { MT01B_AUTH_MODES, Mt01bAuthError, resolveMt01bAuthPolicy } from "./authPolicy.js";
import { requireAuthContext } from "./authContextMiddleware.js";
import { requireAuth } from "./requireAuth.js";
import { requirePerm } from "./rbac.js";

function sendControlledError(res, error) {
  return res.status(error.status || 403).json({
    ok: false,
    error: error.code || "MT01B_PERMISSION_FORBIDDEN",
    ...(error.permission ? { permission: error.permission } : {}),
  });
}

function legacyRouteContext(user) {
  return Object.freeze({
    authType: "LEGACY",
    userId: user.id,
    role: user.role,
    tenantId: null,
    membershipId: null,
  });
}

/**
 * Adaptador explícito para el lote MT-01B3B1. En LEGACY delega sin cambios
 * al middleware existente; en los otros modos sólo resolveAuthContext puede
 * resolver identidad empresarial. No debe usarse como middleware global.
 */
export async function requirePilotAuth(req, res, options = {}) {
  const policy = resolveMt01bAuthPolicy(options.env || process.env, options.now || new Date());
  if (policy.mode === MT01B_AUTH_MODES.LEGACY) {
    const user = await requireAuth(req, res, { prisma: options.prisma });
    return user ? legacyRouteContext(user) : null;
  }
  return requireAuthContext(req, res, options);
}

export async function requirePilotPermission(req, res, permission, options = {}) {
  const policy = resolveMt01bAuthPolicy(options.env || process.env, options.now || new Date());
  if (policy.mode === MT01B_AUTH_MODES.LEGACY) {
    const user = await requireAuth(req, res, { prisma: options.prisma });
    if (!user || !requirePerm(req, res, permission)) return null;
    return legacyRouteContext(user);
  }

  const context = await requireAuthContext(req, res, options);
  if (!context) return null;
  if (!context.effectivePermissions.includes(String(permission))) {
    sendControlledError(res, new Mt01bAuthError("Permiso empresarial insuficiente.", {
      code: "MT01B_PERMISSION_FORBIDDEN",
      status: 403,
    }));
    return null;
  }
  return context;
}
