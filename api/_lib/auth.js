import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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

export function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

