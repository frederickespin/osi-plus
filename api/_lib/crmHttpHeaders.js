const CRM_CORS_RESPONSE_HEADERS = Object.freeze([
  "Access-Control-Allow-Credentials",
]);

export const CRM_REQUIRED_VARY_TOKENS = Object.freeze(["Authorization", "Origin"]);

/**
 * Combina Vary de forma case-insensitive, conserva tokens ajenos y normaliza
 * los dos tokens obligatorios de CRM. `Vary: *` nunca se propaga porque haría
 * imposible el contrato privado y específico del namespace.
 */
export function mergeCrmVaryTokens(current, required = CRM_REQUIRED_VARY_TOKENS) {
  const source = Array.isArray(current) ? current.join(",") : String(current ?? "");
  const requiredByLower = new Map(required.map((token) => [token.toLowerCase(), token]));
  const seen = new Set();
  const preserved = [];

  for (const rawToken of source.split(",")) {
    const token = rawToken.trim();
    if (!token || token === "*") continue;
    const lower = token.toLowerCase();
    if (requiredByLower.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    preserved.push(token);
  }

  return [...preserved, ...requiredByLower.values()].join(", ");
}

export function ensureCrmVaryHeaders(res) {
  const current = typeof res.getHeader === "function" ? res.getHeader("Vary") : undefined;
  res.setHeader("Vary", mergeCrmVaryTokens(current));
}

/** Aplica el contrato privado antes de cualquier gate, auth, body o Prisma. */
export function setCrmPrivateHeaders(res) {
  for (const header of CRM_CORS_RESPONSE_HEADERS) {
    if (typeof res.removeHeader === "function") res.removeHeader(header);
  }
  const allowOrigin = typeof res.getHeader === "function"
    ? res.getHeader("Access-Control-Allow-Origin")
    : undefined;
  if (allowOrigin === "*" && typeof res.removeHeader === "function") {
    res.removeHeader("Access-Control-Allow-Origin");
  }
  res.setHeader("Cache-Control", "private, no-store");
  ensureCrmVaryHeaders(res);
}
