import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { CrmSurveyError } from "./crmSurveyContract.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "application/pdf"]);
const MAX_BYTES = 12 * 1024 * 1024;
export function surveyBlobSha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function validate(bytes, mimeType) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_BYTES || !ALLOWED_MIME.has(mimeType)) throw new CrmSurveyError("CRM_SURVEY_BLOB_INVALID", 400);
}
function safeKey(key) {
  if (typeof key !== "string" || key.length > 320 || key.includes("..") || isAbsolute(key) || normalize(key).replaceAll("\\", "/") !== key) throw new CrmSurveyError("CRM_SURVEY_BLOB_NOT_FOUND", 404);
  return key;
}
export function createMemorySurveyStorage() {
  const values = new Map();
  return Object.freeze({
    provider: "MEMORY_FIXTURE",
    async put({ tenantId, kind, mimeType, bytes }) { validate(bytes, mimeType); const scope = surveyBlobSha256(Buffer.from(String(tenantId))).slice(0, 20); const key = `${scope}/${kind}/${randomUUID()}`; values.set(key, Buffer.from(bytes)); return Object.freeze({ storageKey: key, mimeType, sizeBytes: bytes.length, sha256: surveyBlobSha256(bytes) }); },
    async get(key) { const value = values.get(safeKey(key)); if (!value) throw new CrmSurveyError("CRM_SURVEY_BLOB_NOT_FOUND", 404); return Buffer.from(value); },
    async remove(key) { values.delete(safeKey(key)); },
    count() { return values.size; },
  });
}
export function createLocalSurveyStorage(root = process.env.CRM_SURVEY_LOCAL_STORAGE_ROOT || join(tmpdir(), "osi-plus-v17-survey")) {
  const base = resolve(root);
  if (!isAbsolute(base)) throw new CrmSurveyError("CRM_SURVEY_STORAGE_CONFIGURATION_INVALID", 503);
  const pathFor = (key) => { const target = resolve(base, safeKey(key)); if (!target.startsWith(`${base}${sep}`)) throw new CrmSurveyError("CRM_SURVEY_BLOB_NOT_FOUND", 404); return target; };
  return Object.freeze({
    provider: "LOCAL_FIXTURE",
    async put({ tenantId, kind, mimeType, bytes }) { validate(bytes, mimeType); const scope = surveyBlobSha256(Buffer.from(String(tenantId))).slice(0, 20); const key = `${scope}/${kind}/${randomUUID()}`; const target = pathFor(key); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); return Object.freeze({ storageKey: key, mimeType, sizeBytes: bytes.length, sha256: surveyBlobSha256(bytes) }); },
    async get(key) { try { return await readFile(pathFor(key)); } catch { throw new CrmSurveyError("CRM_SURVEY_BLOB_NOT_FOUND", 404); } },
    async remove(key) { try { await unlink(pathFor(key)); } catch (error) { if (error?.code !== "ENOENT") throw error; } },
  });
}
