import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { ADMIN_MEMBERSHIP_ROLE_OPTIONS } from "../../shared/adminMembershipCatalog.js";
import { ADMIN_USER_DOCUMENT_TYPES, ADMIN_USER_PHOTO_MAX_BYTES, ADMIN_USER_PHOTO_MAX_DIMENSION } from "../../shared/adminUserIdentity.js";

export class AdminUserIdentityError extends Error {
  constructor(code, status = 400) { super(code); this.name = "AdminUserIdentityError"; this.code = code; this.status = status; }
}
export function identityFail(suffix, status = 400) { throw new AdminUserIdentityError(`ADMIN_USER_IDENTITY_${suffix}`, status); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/u;
const ROLES = new Set(ADMIN_MEMBERSHIP_ROLE_OPTIONS.map(({ code }) => code));
const PROFILE_FIELDS = new Set(["name", "phone", "contactEmail", "documentType", "documentNumber", "photoBase64"]);

export function exactIdentityObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) identityFail("INPUT_INVALID");
  return value;
}
export function identityRef(value) {
  if (typeof value !== "string" || !UUID.test(value)) identityFail("NOT_FOUND", 404);
  return value;
}
export function requestRef(value) {
  if (typeof value !== "string" || !UUID.test(value)) identityFail("INPUT_INVALID");
  return value;
}
export function normalizeIdentityEmail(value, optional = false) {
  if (optional && (value === null || value === "")) return null;
  if (typeof value !== "string") identityFail("INPUT_INVALID");
  const email = value.trim().toLowerCase();
  if (email.length > 320 || /[^\x20-\x7e]/u.test(email) || !EMAIL.test(email)) identityFail("INPUT_INVALID");
  return email;
}
function cleanName(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) identityFail("INPUT_INVALID");
  const name = value.trim().replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 160) identityFail("INPUT_INVALID");
  return name;
}
function cleanPhone(value) {
  if (typeof value !== "string") identityFail("INPUT_INVALID");
  const phone = value.replace(/[ ()-]/gu, "");
  if (phone !== "" && !/^\+[1-9][0-9]{6,14}$/u.test(phone)) identityFail("INPUT_INVALID");
  return phone;
}
export function normalizeIdentityDocument(documentType, value) {
  if (!ADMIN_USER_DOCUMENT_TYPES.includes(documentType)) identityFail("INPUT_INVALID");
  if (value === null || value === "") return null;
  if (typeof value !== "string") identityFail("INPUT_INVALID");
  const number = documentType === "CEDULA" ? value.replace(/[ -]/gu, "") : value.trim().toUpperCase();
  if (!(documentType === "CEDULA" ? /^[0-9]{11}$/u : /^[A-Z0-9][A-Z0-9-]{2,39}$/u).test(number)) identityFail("INPUT_INVALID");
  return number;
}
export function normalizeIdentityInput(raw, { partial = false } = {}) {
  exactIdentityObject(raw, [...PROFILE_FIELDS]);
  const result = {};
  if (!partial || Object.hasOwn(raw, "name")) result.name = cleanName(raw.name);
  if (!partial || Object.hasOwn(raw, "phone")) result.phone = cleanPhone(raw.phone ?? "");
  if (!partial || Object.hasOwn(raw, "contactEmail")) result.contactEmail = normalizeIdentityEmail(raw.contactEmail ?? null, true);
  if (!partial || Object.hasOwn(raw, "documentType")) {
    result.documentType = raw.documentType ?? "CEDULA";
    if (!ADMIN_USER_DOCUMENT_TYPES.includes(result.documentType)) identityFail("INPUT_INVALID");
  }
  if (!partial || Object.hasOwn(raw, "documentNumber")) {
    // Full pair validation follows merge with the persisted record for PATCH.
    if (partial && !Object.hasOwn(raw, "documentType")) {
      if (raw.documentNumber !== null && typeof raw.documentNumber !== "string") identityFail("INPUT_INVALID");
      if (typeof raw.documentNumber === "string" && raw.documentNumber.length > 50) identityFail("INPUT_INVALID");
      result.documentNumber = raw.documentNumber;
    } else result.documentNumber = normalizeIdentityDocument(result.documentType, raw.documentNumber ?? null);
  }
  if (Object.hasOwn(raw, "photoBase64")) result.photo = parseProfilePhoto(raw.photoBase64);
  return result;
}
export function normalizeEnrollmentInput(raw) {
  exactIdentityObject(raw, ["requestId", "email", "role", ...PROFILE_FIELDS]);
  const role = raw.role;
  if (role === "A") identityFail("ADMIN_ENROLLMENT_REQUIRED", 409);
  if (!ROLES.has(role)) identityFail("INPUT_INVALID");
  const profile = Object.fromEntries(Object.entries(raw).filter(([key]) => PROFILE_FIELDS.has(key)));
  return { requestId: requestRef(raw.requestId), email: normalizeIdentityEmail(raw.email), role, ...normalizeIdentityInput(profile) };
}
export function canonicalIdentityPayload(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalIdentityPayload).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalIdentityPayload(value[key])}`).join(",")}}`;
}

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Decode one bounded, non-interlaced 8-bit RGB/RGBA PNG. Strip ancillary metadata. */
export function parseProfilePhoto(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return { bytes: null, sha256: null };
  try {
    if (typeof raw !== "string" || raw.length > Math.ceil(ADMIN_USER_PHOTO_MAX_BYTES / 3) * 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(raw)) identityFail("PHOTO_INVALID");
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length < 45 || bytes.length > ADMIN_USER_PHOTO_MAX_BYTES || bytes.toString("base64") !== raw || !bytes.subarray(0, 8).equals(PNG)) identityFail("PHOTO_INVALID");
    let offset = 8; let count = 0; let width = 0; let height = 0; let channels = 0; let ended = false; let dataEnded = false;
    const idats = []; const safe = [PNG];
    while (offset < bytes.length) {
      if (++count > 128 || offset + 12 > bytes.length || ended) identityFail("PHOTO_INVALID");
      const length = bytes.readUInt32BE(offset);
      if (length > ADMIN_USER_PHOTO_MAX_BYTES || offset + length + 12 > bytes.length) identityFail("PHOTO_INVALID");
      const type = bytes.toString("latin1", offset + 4, offset + 8);
      if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/u.test(type) || crc32(bytes.subarray(offset + 4, offset + length + 8)) !== bytes.readUInt32BE(offset + length + 8)) identityFail("PHOTO_INVALID");
      const chunk = bytes.subarray(offset, offset + length + 12);
      const payload = bytes.subarray(offset + 8, offset + length + 8);
      if (count === 1 && type !== "IHDR") identityFail("PHOTO_INVALID");
      if (type === "IHDR") {
        if (count !== 1 || length !== 13) identityFail("PHOTO_INVALID");
        width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
        if (width < 1 || height < 1 || width > ADMIN_USER_PHOTO_MAX_DIMENSION || height > ADMIN_USER_PHOTO_MAX_DIMENSION
          || payload[8] !== 8 || ![2, 6].includes(payload[9]) || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) identityFail("PHOTO_INVALID");
        channels = payload[9] === 6 ? 4 : 3;
        safe.push(chunk);
      } else if (type === "IDAT") {
        if (!width || dataEnded || length === 0) identityFail("PHOTO_INVALID");
        idats.push(payload); safe.push(chunk);
      } else if (type === "IEND") {
        if (length !== 0 || idats.length === 0) identityFail("PHOTO_INVALID");
        ended = true; safe.push(chunk);
      } else {
        if (type[0] === type[0].toUpperCase() || ["acTL", "fcTL", "fdAT"].includes(type)) identityFail("PHOTO_INVALID");
        if (idats.length) dataEnded = true;
      }
      offset += length + 12;
    }
    if (!ended || offset !== bytes.length) identityFail("PHOTO_INVALID");
    const stride = width * channels + 1;
    const compressed = Buffer.concat(idats);
    const inflated = inflateSync(compressed, { maxOutputLength: stride * height, info: true });
    if (inflated.buffer.length !== stride * height || inflated.engine.bytesWritten !== compressed.length) identityFail("PHOTO_INVALID");
    for (let row = 0; row < height; row += 1) if (inflated.buffer[row * stride] > 4) identityFail("PHOTO_INVALID");
    const clean = Buffer.concat(safe);
    return { bytes: clean, sha256: createHash("sha256").update(clean).digest("hex") };
  } catch (error) {
    if (error instanceof AdminUserIdentityError) throw error;
    identityFail("PHOTO_INVALID");
  }
}
