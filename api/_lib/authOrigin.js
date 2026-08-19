import { Mt01bAuthError, assertMt01bV2Enabled } from "./authPolicy.js";
import { setAuthPrivateHeaders } from "./authHttp.js";

const LOCAL_ORIGINS = Object.freeze(["http://localhost:5173", "http://127.0.0.1:5173"]);

function normalizedOrigin(value) {
  if (!value) return null;
  try {
    return new URL(String(value)).origin;
  } catch {
    return null;
  }
}

export function mt01bAllowedOrigins(env = process.env) {
  const configured = String(env.MT01B_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => normalizedOrigin(item.trim()))
    .filter(Boolean);
  const production = env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
  if (production && configured.length === 0) {
    throw new Mt01bAuthError("MT01B_ALLOWED_ORIGINS es obligatorio al activar autenticación empresarial.", {
      code: "MT01B_CORS_CONFIG_INVALID",
      status: 500,
    });
  }
  return new Set(production ? configured : [...configured, ...LOCAL_ORIGINS]);
}

export function validateMt01bMutationOrigin(req, env = process.env) {
  const headerOrigin = normalizedOrigin(req?.headers?.origin);
  const refererOrigin = normalizedOrigin(req?.headers?.referer);
  const candidate = headerOrigin || refererOrigin;
  if (!candidate || !mt01bAllowedOrigins(env).has(candidate)) {
    throw new Mt01bAuthError("Origen de solicitud no autorizado.", {
      code: "MT01B_ORIGIN_FORBIDDEN",
      status: 403,
    });
  }
  return candidate;
}

export function withMt01bAuthHeaders(handler) {
  return async (req, res) => {
    setAuthPrivateHeaders(res);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method === "HEAD") {
      res.setHeader("Allow", "POST");
      return res.status(405).end();
    }
    try {
      assertMt01bV2Enabled();
      if (req.method === "OPTIONS") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: "Method Not Allowed", allowed: ["POST"] });
      }
      return await handler(req, res);
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (error?.recoverable && Number.isInteger(error?.retryAfterMs)) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil(error.retryAfterMs / 1_000))));
        res.setHeader("X-Retry-After-Ms", String(error.retryAfterMs));
      }
      return res.status(status).json({
        ok: false,
        error: error?.code || "MT01B_AUTH_ERROR",
        message: status >= 500
          ? (error?.recoverable ? "Autenticación temporalmente no disponible" : "Error de configuración de autenticación")
          : error.message,
        ...(error?.recoverable ? { recoverable: true } : {}),
        ...(error?.recoverable && Number.isInteger(error?.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {}),
      });
    }
  };
}
