/**
 * Middleware: Verifica JWT Bearer y adjunta req.user = { id, email, role }
 * Usado por endpoints que requieren autenticación.
 */
import { getBearerToken, verifyAccessToken } from "./auth.js";
import { unauthorized } from "./http.js";

/**
 * Extrae y verifica el token JWT. Si es válido, adjunta req.user.
 * Retorna null si no hay token o es inválido; en ese caso ya envió 401.
 */
export function requireAuth(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    unauthorized(res);
    return null;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    unauthorized(res);
    return null;
  }

  req.user = {
    id: payload.sub,
    email: payload.email || "",
    role: String(payload.role || "").toUpperCase().trim(),
  };
  return req.user;
}
