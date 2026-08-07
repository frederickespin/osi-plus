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
const MT01B_ACCESS_HEADER = Object.freeze({ alg: "HS256", typ: "JWT" });
const MT01B_ACCESS_CLAIMS = Object.freeze([
  "aud", "authorizationVersion", "exp", "iat", "iss", "jti", "membershipId",
  "role", "sid", "sub", "tenantId", "typ", "ver",
]);
const MT01B_STRING_CLAIM_LIMITS = Object.freeze({
  sub: 128,
  membershipId: 128,
  tenantId: 128,
  role: 32,
  sid: 128,
  jti: 128,
});

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
  let complete;
  let rawPayload;
  try {
    complete = jwt.decode(token, { complete: true });
    rawPayload = Buffer.from(String(token).split(".")[1] || "", "base64url").toString("utf8");
  } catch (cause) {
    throw new Mt01bAuthError("Token empresarial inválido.", { code: "MT01B_TOKEN_INVALID", cause });
  }
  if (!complete || complete.header?.alg !== MT01B_ACCESS_HEADER.alg || complete.header?.typ !== MT01B_ACCESS_HEADER.typ) {
    throw new Mt01bAuthError("Encabezado empresarial inválido.", { code: "MT01B_TOKEN_INVALID" });
  }
  // Los tokens emitidos por este servicio usan JSON compacto canónico. Exigir
  // la misma representación evita claims duplicados que JSON.parse ocultaría.
  try {
    if (JSON.stringify(JSON.parse(rawPayload)) !== rawPayload) {
      throw new Error("non-canonical payload");
    }
  } catch (cause) {
    throw new Mt01bAuthError("Payload empresarial inválido.", { code: "MT01B_TOKEN_INVALID", cause });
  }
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
  const keys = Object.keys(payload || {}).sort();
  const invalidStringClaim = Object.entries(MT01B_STRING_CLAIM_LIMITS).some(([claim, maxLength]) =>
    typeof payload?.[claim] !== "string" || payload[claim].length < 1 || payload[claim].length > maxLength || payload[claim] !== payload[claim].trim());
  if (JSON.stringify(keys) !== JSON.stringify([...MT01B_ACCESS_CLAIMS].sort()) ||
      payload?.iss !== MT01B_ISSUER || payload?.aud !== MT01B_ACCESS_AUDIENCE ||
      payload?.ver !== 2 || payload?.typ !== "access" || invalidStringClaim ||
      !Number.isInteger(payload?.authorizationVersion) || payload.authorizationVersion < 1 ||
      !Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) || payload.exp <= payload.iat) {
    throw new Mt01bAuthError("Claims empresariales incompletos.", { code: "MT01B_TOKEN_INVALID" });
  }
  return payload;
}

// Sólo clasifica el contrato para impedir que un JWT V2 inválido se degrade a
// LEGACY. El contenido decodificado nunca se usa para autorizar.
export function isMembershipAccessTokenCandidate(token) {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object") return false;
  return ["ver", "typ", "membershipId", "tenantId", "authorizationVersion", "sid", "jti"]
    .some((claim) => Object.hasOwn(decoded, claim));
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
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authHeader);
  return match?.[1] || null;
}

