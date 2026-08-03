export const MT01B_AUTH_MODES = Object.freeze({
  LEGACY: "LEGACY",
  HYBRID: "HYBRID",
  MEMBERSHIP_ONLY: "MEMBERSHIP_ONLY",
});

const MAX_LEGACY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

export class Mt01bAuthError extends Error {
  constructor(message, { code = "MT01B_AUTH_ERROR", status = 401, recoverable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "Mt01bAuthError";
    this.code = code;
    this.status = status;
    this.recoverable = recoverable;
  }
}

function positiveInteger(value, fallback, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = value == null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Mt01bAuthError(`${name} no es válido.`, { code: "MT01B_AUTH_CONFIG_INVALID", status: 500 });
  }
  return parsed;
}

export function isEnabledFlag(value) {
  return String(value || "false").trim().toLowerCase() === "true";
}

export function resolveMt01bAuthPolicy(env = process.env, now = new Date()) {
  const mode = String(env.MT01B_AUTH_MODE || MT01B_AUTH_MODES.LEGACY).trim().toUpperCase();
  if (!Object.values(MT01B_AUTH_MODES).includes(mode)) {
    throw new Mt01bAuthError("MT01B_AUTH_MODE no es válido.", { code: "MT01B_AUTH_CONFIG_INVALID", status: 500 });
  }

  const tenantSwitchEnabled = isEnabledFlag(env.MT01B_TENANT_SWITCH_ENABLED);
  if (tenantSwitchEnabled) {
    throw new Mt01bAuthError("El cambio de empresa permanece deshabilitado hasta MT-01C.", {
      code: "MT01B_TENANT_SWITCH_DISABLED",
      status: 500,
    });
  }

  let legacyTokenAcceptUntil = null;
  if (mode === MT01B_AUTH_MODES.HYBRID) {
    if (!env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL) {
      throw new Mt01bAuthError("HYBRID requiere MT01B_LEGACY_TOKEN_ACCEPT_UNTIL.", {
        code: "MT01B_LEGACY_CUTOFF_REQUIRED",
        status: 500,
      });
    }
    legacyTokenAcceptUntil = new Date(env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL);
    const distance = legacyTokenAcceptUntil.getTime() - now.getTime();
    if (!Number.isFinite(legacyTokenAcceptUntil.getTime()) || distance <= 0 || distance > MAX_LEGACY_WINDOW_MS) {
      throw new Mt01bAuthError("La ventana legacy debe ser futura y no superar siete días.", {
        code: "MT01B_LEGACY_CUTOFF_INVALID",
        status: 500,
      });
    }
  }

  return {
    mode,
    tenantSwitchEnabled,
    legacyTokenAcceptUntil,
    accessTokenTtlSeconds: positiveInteger(env.MT01B_ACCESS_TOKEN_TTL_SECONDS, 900, "MT01B_ACCESS_TOKEN_TTL_SECONDS", { max: 3600 }),
    refreshTokenTtlSeconds: positiveInteger(env.MT01B_REFRESH_TOKEN_TTL_SECONDS, 14 * 24 * 3600, "MT01B_REFRESH_TOKEN_TTL_SECONDS", { max: 30 * 24 * 3600 }),
    sessionTtlSeconds: positiveInteger(env.MT01B_SESSION_TTL_SECONDS, 30 * 24 * 3600, "MT01B_SESSION_TTL_SECONDS", { max: 90 * 24 * 3600 }),
    refreshConcurrencyToleranceMs: positiveInteger(env.MT01B_REFRESH_CONCURRENCY_TOLERANCE_MS, 5_000, "MT01B_REFRESH_CONCURRENCY_TOLERANCE_MS", { min: 1_000, max: 10_000 }),
  };
}

export function assertMt01bV2Enabled(env = process.env, now = new Date()) {
  const policy = resolveMt01bAuthPolicy(env, now);
  if (policy.mode === MT01B_AUTH_MODES.LEGACY) {
    throw new Mt01bAuthError("La autenticación empresarial todavía no está activa.", {
      code: "MT01B_AUTH_V2_DISABLED",
      status: 409,
    });
  }
  return policy;
}

export function requireRefreshPepper(env = process.env) {
  const pepper = String(env.MT01B_REFRESH_TOKEN_PEPPER || "");
  if (pepper.length < 32) {
    throw new Mt01bAuthError("MT01B_REFRESH_TOKEN_PEPPER debe tener al menos 32 caracteres.", {
      code: "MT01B_AUTH_CONFIG_INVALID",
      status: 500,
    });
  }
  return pepper;
}
