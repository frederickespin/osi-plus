import { Mt01bAuthError } from "./authPolicy.js";
import { resolveAuthContext } from "./authContext.js";

function sendControlledError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 401;
  return res.status(status).json({
    ok: false,
    error: error?.code || "MT01B_AUTH_INVALID",
    ...(error?.recoverable === true ? { recoverable: true } : {}),
    ...(Number.isInteger(error?.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {}),
  });
}

export async function requireAuthContext(req, res, options = {}) {
  if (req.authContext) return req.authContext;
  try {
    const context = await resolveAuthContext(req, options);
    req.authContext = context;
    return context;
  } catch (error) {
    if (error instanceof Mt01bAuthError) {
      sendControlledError(res, error);
      return null;
    }
    throw error;
  }
}

export async function requireRole(req, res, roles, options = {}) {
  const context = await requireAuthContext(req, res, options);
  if (!context) return null;
  const allowed = new Set((Array.isArray(roles) ? roles : [roles]).map((role) => String(role || "").toUpperCase().trim()).filter(Boolean));
  if (!allowed.has(context.role)) {
    sendControlledError(res, new Mt01bAuthError("Rol insuficiente.", { code: "MT01B_ROLE_FORBIDDEN", status: 403 }));
    return null;
  }
  return context;
}

export async function requirePermission(req, res, permission, options = {}) {
  const context = await requireAuthContext(req, res, options);
  if (!context) return null;
  if (!context.effectivePermissions.includes(String(permission))) {
    sendControlledError(res, new Mt01bAuthError("Permiso insuficiente.", { code: "MT01B_PERMISSION_FORBIDDEN", status: 403 }));
    return null;
  }
  return context;
}

export async function requireTenantResource(req, res, resourceTenantId, options = {}) {
  const context = await requireAuthContext(req, res, options);
  if (!context) return null;
  if (!context.tenantId) {
    sendControlledError(res, new Mt01bAuthError("La ruta requiere contexto empresarial.", { code: "MT01B_TENANT_CONTEXT_REQUIRED", status: 403 }));
    return null;
  }
  if (String(resourceTenantId || "") !== context.tenantId) {
    sendControlledError(res, new Mt01bAuthError("Recurso no encontrado.", { code: "MT01B_RESOURCE_NOT_FOUND", status: 404 }));
    return null;
  }
  return context;
}
