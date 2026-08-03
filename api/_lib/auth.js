import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { Mt01bAuthError, resolveMt01bAuthPolicy } from "./authPolicy.js";

// En producción JWT_SECRET debe estar definido; el fallback es solo para desarrollo local.
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";

const isProduction =
  process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
if (
  isProduction &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-insecure-secret")
) {
  throw new Error(
    "JWT_SECRET must be set in production. Do not use the default dev-insecure-secret. Set JWT_SECRET in Vercel Environment Variables.",
  );
}

// JWT expects: number (seconds) or string like "7d", "20h" - reject invalid values
const raw = process.env.JWT_EXPIRES_IN;
const JWT_EXPIRES_IN =
  typeof raw === "string" && /^(\d+[smhd]|\d+)$/.test(raw.trim())
    ? raw.trim()
    : "7d";

export async function hashPassword(plainText) {
  return bcrypt.hash(plainText, 10);
}

export async function comparePassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

export function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

const MT01B_ISSUER = "osi-plus";
const MT01B_ACCESS_AUDIENCE = "osi-plus-api";

function requiredClaim(value, claim) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Mt01bAuthError(`Claim ${claim} ausente.`, { code: "MT01B_TOKEN_INVALID" });
  }
  return normalized;
}

export function signMembershipAccessToken(identity, { env = process.env } = {}) {
  const policy = resolveMt01bAuthPolicy(env);
  const payload = {
    ver: 2,
    typ: "access",
    sub: requiredClaim(identity?.userId, "sub"),
    membershipId: requiredClaim(identity?.membershipId, "membershipId"),
    tenantId: requiredClaim(identity?.tenantId, "tenantId"),
    role: requiredClaim(identity?.role, "role"),
    authorizationVersion: Number(identity?.authorizationVersion),
    sid: requiredClaim(identity?.sessionId, "sid"),
    jti: randomUUID(),
  };
  if (!Number.isInteger(payload.authorizationVersion) || payload.authorizationVersion < 1) {
    throw new Mt01bAuthError("authorizationVersion inválida.", { code: "MT01B_TOKEN_INVALID" });
  }
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: "HS256",
    issuer: MT01B_ISSUER,
    audience: MT01B_ACCESS_AUDIENCE,
    expiresIn: policy.accessTokenTtlSeconds,
  });
}

export function verifyMembershipAccessToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: MT01B_ISSUER,
      audience: MT01B_ACCESS_AUDIENCE,
    });
  } catch (cause) {
    throw new Mt01bAuthError("Token empresarial inválido.", { code: "MT01B_TOKEN_INVALID", cause });
  }
  const required = ["sub", "membershipId", "tenantId", "role", "sid", "jti"];
  if (payload?.ver !== 2 || payload?.typ !== "access" || required.some((claim) => !String(payload?.[claim] || "").trim()) ||
      !Number.isInteger(payload?.authorizationVersion) || payload.authorizationVersion < 1) {
    throw new Mt01bAuthError("Claims empresariales incompletos.", { code: "MT01B_TOKEN_INVALID" });
  }
  return payload;
}

export function verifyStrictLegacyAccessToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch (cause) {
    throw new Mt01bAuthError("Token legacy inválido.", { code: "MT01B_LEGACY_TOKEN_INVALID", cause });
  }
  const keys = Object.keys(payload || {}).sort();
  const expected = ["email", "exp", "iat", "role", "sub"].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected) ||
      !String(payload.sub || "").trim() || !String(payload.email || "").trim() || !String(payload.role || "").trim() ||
      !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat || payload.exp - payload.iat > 7 * 24 * 3600) {
    throw new Mt01bAuthError("El token no coincide con el contrato legacy permitido.", { code: "MT01B_LEGACY_TOKEN_INVALID" });
  }
  return payload;
}

export function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

