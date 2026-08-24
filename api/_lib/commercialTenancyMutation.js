export const COMMERCIAL_TENANCY_MUTATION_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
});

export const COMMERCIAL_TENANCY_MUTATIONS_DISABLED = "COMMERCIAL_TENANCY_MUTATIONS_DISABLED";

const CORS_RESPONSE_HEADERS = Object.freeze([
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
]);

function hasVercelMarker(env) {
  return Object.keys(env || {}).some((name) => name.toUpperCase().startsWith("VERCEL"));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function mergeCommercialMutationVaryTokens(current) {
  const seen = new Set();
  const tokens = [];
  const source = Array.isArray(current) ? current.join(",") : String(current ?? "");
  for (const rawToken of source.split(",")) {
    const token = rawToken.trim();
    const lower = token.toLowerCase();
    if (!token || token === "*" || seen.has(lower)) continue;
    seen.add(lower);
    tokens.push(token);
  }
  for (const token of ["Authorization", "Origin"]) {
    const lower = token.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      tokens.push(token);
    }
  }
  return tokens.join(", ");
}

/** El Host y los headers de proxy nunca participan en esta decisión. */
export function isRealLoopbackRequest(request) {
  return isLoopbackAddress(request?.socket?.localAddress)
    && isLoopbackAddress(request?.socket?.remoteAddress);
}

export function resolveCommercialTenancyMutationMode(
  env = process.env,
  request = undefined,
) {
  const configured = env?.COMMERCIAL_TENANCY_MUTATION_MODE;
  if (configured === undefined || configured === COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED) {
    return Object.freeze({
      mode: COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED,
      enabled: false,
      valid: true,
      reason: configured === undefined ? "DEFAULT_DISABLED" : "EXPLICIT_DISABLED",
    });
  }

  if (configured !== COMMERCIAL_TENANCY_MUTATION_MODES.LOCAL_ONLY) {
    return Object.freeze({
      mode: COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED,
      enabled: false,
      valid: false,
      reason: "UNKNOWN_MODE",
    });
  }

  if (hasVercelMarker(env)) {
    return Object.freeze({
      mode: COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED,
      enabled: false,
      valid: false,
      reason: "VERCEL_FORBIDDEN",
    });
  }

  if (!isRealLoopbackRequest(request)) {
    return Object.freeze({
      mode: COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED,
      enabled: false,
      valid: false,
      reason: "LOOPBACK_REQUIRED",
    });
  }

  return Object.freeze({
    mode: COMMERCIAL_TENANCY_MUTATION_MODES.LOCAL_ONLY,
    enabled: true,
    valid: true,
    reason: "AUTHORIZED_LOCAL_ONLY",
  });
}

function setDisabledMutationHeaders(response) {
  for (const header of CORS_RESPONSE_HEADERS) {
    if (typeof response.removeHeader === "function") response.removeHeader(header);
  }
  if (typeof response.removeHeader === "function") response.removeHeader("Set-Cookie");
  response.setHeader("Cache-Control", "private, no-store");
  const currentVary = typeof response.getHeader === "function" ? response.getHeader("Vary") : undefined;
  response.setHeader("Vary", mergeCommercialMutationVaryTokens(currentVary));
}

/** Debe ser la primera operación de toda ruta POST protegida. */
export function requireCommercialTenancyMutation(
  request,
  response,
  { env = process.env } = {},
) {
  const authority = resolveCommercialTenancyMutationMode(env, request);
  if (authority.enabled) return authority;

  setDisabledMutationHeaders(response);
  response.status(409).json({
    ok: false,
    error: COMMERCIAL_TENANCY_MUTATIONS_DISABLED,
  });
  return null;
}
