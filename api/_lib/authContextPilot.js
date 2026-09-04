import { Mt01bAuthError } from "./authPolicy.js";
import { requireAuthContext } from "./authContextMiddleware.js";

function sendControlledError(res, error) {
  return res.status(error.status || 403).json({
    ok: false,
    error: error.code || "MT01B_PERMISSION_FORBIDDEN",
    ...(error.permission ? { permission: error.permission } : {}),
  });
}

/**
 * Adaptador transitorio: LEGACY y V2 terminan en el mismo AuthorizationContext.
 * La autenticación puede coexistir; la autorización no se bifurca.
 */
export async function requirePilotAuth(req, res, options = {}) {
  return requireAuthContext(req, res, options);
}

export async function requirePilotPermission(req, res, permission, options = {}) {
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
