import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";

export const CRM_OWNER_REF_VERSION = 1;
export const CRM_OWNER_REF_AUDIENCE = "crm:pipeline:assign";
export const CRM_OWNER_REF_TTL_SECONDS = 300;
export const CRM_OWNER_REF_CLOCK_SKEW_SECONDS = 30;
export const CRM_OWNER_REF_HKDF_INFO = "osi-plus/crm/pipeline-owner-ref/v1";

const PREFIX = "or1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_REF_LENGTH = 1_024;
const HKDF_SALT = Buffer.from("osi-plus/crm/pipeline-owner-ref/salt/v1", "utf8");
const OWNER_REF_SECRET = /^[A-Za-z0-9_-]{64}$/;

function invalid() {
  throw new CommercialTenancyError("CRM_PIPELINE_OWNER_REF_INVALID", 400);
}

function requiredIdentity(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 191 || value !== value.trim()
    || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}

export function crmOwnerRefSecretMaterial(env = process.env) {
  const secret = env.CRM_PIPELINE_OWNER_REF_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") !== 64
    || !OWNER_REF_SECRET.test(secret)) {
    throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
  }
  return secret;
}

export function assertCrmOwnerRefSecretConfigured(env = process.env) {
  crmOwnerRefSecretMaterial(env);
}

function key(env) {
  const secret = crmOwnerRefSecretMaterial(env);
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    HKDF_SALT,
    Buffer.from(CRM_OWNER_REF_HKDF_INFO, "utf8"),
    32,
  ));
}

function seconds(now) {
  const value = now instanceof Date ? now.getTime() : Number(now ?? Date.now());
  if (!Number.isFinite(value)) invalid();
  return Math.floor(value / 1_000);
}

function encoded(value) {
  return Buffer.from(value).toString("base64url");
}

function decoded(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  try {
    const buffer = Buffer.from(value, "base64url");
    if (encoded(buffer) !== value) invalid();
    return buffer;
  } catch { invalid(); }
}

function issueWithKey(identity, derivedKey, issuedAt, random) {
  const payload = Buffer.from(JSON.stringify({
    v: CRM_OWNER_REF_VERSION,
    aud: CRM_OWNER_REF_AUDIENCE,
    tenantId: requiredIdentity(identity?.tenantId),
    membershipId: requiredIdentity(identity?.membershipId),
    userId: requiredIdentity(identity?.userId),
    iat: issuedAt,
    exp: issuedAt + CRM_OWNER_REF_TTL_SECONDS,
  }), "utf8");
  const iv = Buffer.from(random(IV_BYTES));
  if (iv.length !== IV_BYTES) invalid();
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  cipher.setAAD(Buffer.from(`${PREFIX}.${CRM_OWNER_REF_AUDIENCE}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return `${PREFIX}.${encoded(iv)}.${encoded(ciphertext)}.${encoded(cipher.getAuthTag())}`;
}

export function issueCrmOwnerRef(identity, { env = process.env, now = Date.now, random = randomBytes } = {}) {
  const issuedAt = seconds(typeof now === "function" ? now() : now);
  return issueWithKey(identity, key(env), issuedAt, random);
}

export function issueCrmOwnerRefs(identities, { env = process.env, now = Date.now, random = randomBytes } = {}) {
  if (!Array.isArray(identities) || identities.length > 100) invalid();
  const issuedAt = seconds(typeof now === "function" ? now() : now);
  const derivedKey = key(env);
  return Object.freeze(identities.map((identity) => issueWithKey(identity, derivedKey, issuedAt, random)));
}

export function readCrmOwnerRef(ownerRef, { env = process.env, now = Date.now } = {}) {
  if (typeof ownerRef !== "string" || ownerRef.length < 32 || ownerRef.length > MAX_REF_LENGTH || ownerRef !== ownerRef.trim()) invalid();
  const parts = ownerRef.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) invalid();
  try {
    const iv = decoded(parts[1]);
    const ciphertext = decoded(parts[2]);
    const tag = decoded(parts[3]);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length < 1) invalid();
    const decipher = createDecipheriv("aes-256-gcm", key(env), iv);
    decipher.setAAD(Buffer.from(`${PREFIX}.${CRM_OWNER_REF_AUDIENCE}`, "utf8"));
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || Object.keys(payload).sort().join(",") !== "aud,exp,iat,membershipId,tenantId,userId,v"
      || payload.v !== CRM_OWNER_REF_VERSION || payload.aud !== CRM_OWNER_REF_AUDIENCE
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || payload.exp - payload.iat !== CRM_OWNER_REF_TTL_SECONDS) invalid();
    const current = seconds(typeof now === "function" ? now() : now);
    if (payload.iat > current + CRM_OWNER_REF_CLOCK_SKEW_SECONDS) invalid();
    if (current > payload.exp + CRM_OWNER_REF_CLOCK_SKEW_SECONDS) {
      throw new CommercialTenancyError("CRM_PIPELINE_OWNER_REF_EXPIRED", 409);
    }
    return Object.freeze({
      tenantId: requiredIdentity(payload.tenantId),
      membershipId: requiredIdentity(payload.membershipId),
      userId: requiredIdentity(payload.userId),
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    });
  } catch (error) {
    if (error instanceof CommercialTenancyError) throw error;
    invalid();
  }
}
