/**
 * Middleware: Verifica JWT Bearer y adjunta req.user = { id, email, role }
 * Usado por endpoints que requieren autenticación.
 */
import { getBearerToken, verifyAccessToken } from "./auth.js";
import { prisma as defaultPrisma } from "./db.js";
import { unauthorized } from "./http.js";
import { isGloballyActiveUser } from "./userStatus.js";

const LEGACY_AUTH_CACHE = Symbol("osi.legacyAuthContext");

/**
 * Extrae y verifica el token JWT. Si es válido, adjunta req.user.
 * Retorna null si no hay token o es inválido; en ese caso ya envió 401.
 */
export async function requireAuth(req, res, { prisma = defaultPrisma } = {}) {
  if (req[LEGACY_AUTH_CACHE]) {
    const cached = await req[LEGACY_AUTH_CACHE];
    if (!cached) unauthorized(res);
    else req.user = cached;
    return cached;
  }

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

  req[LEGACY_AUTH_CACHE] = (async () => {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!user || !isGloballyActiveUser(user.status)) return null;
    return Object.freeze({
      id: payload.sub,
      email: payload.email || "",
      role: String(payload.role || "").toUpperCase().trim(),
    });
  })();

  const current = await req[LEGACY_AUTH_CACHE];
  if (!current) {
    unauthorized(res);
    return null;
  }
  req.user = current;
  return current;
}
