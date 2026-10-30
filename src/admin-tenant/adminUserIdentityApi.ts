import { isAdminMembershipRole, type AdminMembershipRoleCode } from "../../shared/adminMembershipCatalog.js";
import { getMembershipRef } from "@/lib/sessionStore";
import { AdminApiError, parseAdminMembership, parseAdminMembershipCatalog } from "./adminApi";

export type IdentityDocumentType = "CEDULA" | "PASSPORT" | "OTHER";
export type AdminUserIdentity = Readonly<{
  membershipRef: string;
  version: number;
  name: string;
  email: string;
  phone: string;
  contactEmail: string | null;
  documentType: IdentityDocumentType;
  documentNumber: string | null;
  hasPhoto: boolean;
  photoVersion: number;
  updatedAt: string | null;
  canEdit: boolean;
}>;
export type AdminUserIdentitySummary = Readonly<Pick<AdminUserIdentity, "membershipRef" | "name" | "email" | "hasPhoto" | "photoVersion"> & { identityVersion: number }>;
export type AdminUserIdentityChanges = { -readonly [Field in "name" | "phone" | "contactEmail" | "documentType" | "documentNumber"]?: AdminUserIdentity[Field] } & { photoBase64?: string | null };
export type AdminUserEnrollment = Readonly<{
  enrollmentRef: string;
  name: string;
  email: string;
  role: AdminMembershipRoleCode;
  status: "PENDING" | "ACTIVATED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
}>;
export type AdminUserEnrollmentInput = Readonly<{
  name: string;
  email: string;
  phone: string;
  contactEmail?: string | null;
  documentType: IdentityDocumentType;
  documentNumber?: string | null;
  role: AdminMembershipRoleCode;
  photoBase64?: string;
}>;
export const MAX_IDENTITY_PHOTO_BYTES = 256 * 1024;
export const MAX_IDENTITY_PHOTO_SOURCE_BYTES = 8 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ACTIVATION_PATH = /^\/activate-user#token=ui1\.[A-Za-z0-9_-]{43}$/u;
function invalid(): never { throw new AdminApiError("ADMIN_USER_IDENTITY_RESPONSE_INVALID", 503); }
function object(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: readonly string[]) { const actual = Object.keys(value).sort(); const wanted = [...allowed].sort(); if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) invalid(); }
function text(value: unknown, maximum: number, nullable = false): string | null { if (nullable && value === null) return null; if (typeof value !== "string" || value.length > maximum) invalid(); return value; }
function integer(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 0) invalid(); return Number(value); }
function timestamp(value: unknown, nullable = false): string | null { if (nullable && value === null) return null; if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) invalid(); return value; }
function ref(value: unknown) { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }

function identity(value: unknown): AdminUserIdentity {
  const row = object(value);
  keys(row, ["membershipRef", "version", "name", "email", "phone", "contactEmail", "documentType", "documentNumber", "hasPhoto", "photoVersion", "updatedAt", "canEdit"]);
  if (!["CEDULA", "PASSPORT", "OTHER"].includes(String(row.documentType)) || typeof row.hasPhoto !== "boolean" || typeof row.canEdit !== "boolean") invalid();
  return Object.freeze({ membershipRef: ref(row.membershipRef), version: integer(row.version), name: text(row.name, 160)!, email: text(row.email, 320)!, phone: text(row.phone, 40)!, contactEmail: text(row.contactEmail, 320, true), documentType: row.documentType as IdentityDocumentType, documentNumber: text(row.documentNumber, 40, true), hasPhoto: row.hasPhoto, photoVersion: integer(row.photoVersion), updatedAt: timestamp(row.updatedAt, true), canEdit: row.canEdit });
}
function summary(value: unknown): AdminUserIdentitySummary {
  const row = object(value);
  keys(row, ["membershipRef", "name", "email", "identityVersion", "hasPhoto", "photoVersion"]);
  if (typeof row.hasPhoto !== "boolean") invalid();
  return Object.freeze({ membershipRef: ref(row.membershipRef), name: text(row.name, 160)!, email: text(row.email, 320)!, identityVersion: integer(row.identityVersion), hasPhoto: row.hasPhoto, photoVersion: integer(row.photoVersion) });
}
function enrollment(value: unknown): AdminUserEnrollment {
  const row = object(value);
  keys(row, ["enrollmentRef", "name", "email", "role", "status", "expiresAt", "createdAt"]);
  if (!isAdminMembershipRole(row.role) || !["PENDING", "ACTIVATED", "EXPIRED", "REVOKED"].includes(String(row.status))) invalid();
  return Object.freeze({ enrollmentRef: ref(row.enrollmentRef), name: text(row.name, 160)!, email: text(row.email, 320)!, role: row.role as AdminMembershipRoleCode, status: row.status as AdminUserEnrollment["status"], expiresAt: timestamp(row.expiresAt)!, createdAt: timestamp(row.createdAt)! });
}
async function json(response: Response) {
  if (!(response.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) invalid();
  let body: Record<string, unknown>;
  try { body = object(await response.json()); } catch { invalid(); }
  if (!response.ok) throw new AdminApiError(typeof body.error === "string" ? body.error : "ADMIN_USER_IDENTITY_REQUEST_FAILED", response.status);
  if (body.ok !== true) invalid();
  return body;
}

export class AdminUserIdentityApi {
  private readonly tokenProvider: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly membershipRefProvider: () => string | null;
  constructor(tokenProvider: () => string | null, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis), membershipRefProvider: () => string | null = getMembershipRef) {
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.membershipRefProvider = membershipRefProvider;
  }
  private headers(isJson = false) {
    const token = this.tokenProvider(); const membershipRef = this.membershipRefProvider();
    if (!token) throw new AdminApiError("COMMERCIAL_AUTH_REQUIRED", 401);
    if (!membershipRef) throw new AdminApiError("MT01B_MEMBERSHIP_SELECTION_INVALID", 400);
    return { Authorization: `Bearer ${token}`, "X-OSI-Membership-Ref": membershipRef, ...(isJson ? { "Content-Type": "application/json" } : {}) };
  }
  async list(filters: Readonly<{ search?: string; role?: string; status?: string; page?: number; pageSize?: number }>, signal?: AbortSignal) {
    const query = new URLSearchParams();
    for (const key of ["search", "role", "status"] as const) if (filters[key]) query.set(key, filters[key]!);
    query.set("page", String(filters.page || 1)); query.set("pageSize", String(filters.pageSize || 20));
    const body = await json(await this.fetchImpl(`/api/admin/user-identities?${query}`, { headers: this.headers(), signal, cache: "no-store" }));
    keys(body, ["ok", "data", "total", "page", "pageSize", "catalog", "identities"]);
    if (!Array.isArray(body.data) || !Array.isArray(body.identities)) invalid();
    return Object.freeze({ data: Object.freeze(body.data.map(parseAdminMembership)), total: integer(body.total), page: integer(body.page), pageSize: integer(body.pageSize), catalog: parseAdminMembershipCatalog(body.catalog), identities: Object.freeze(body.identities.map(summary)) });
  }
  async get(membershipRef: string, signal?: AbortSignal) {
    const body = await json(await this.fetchImpl(`/api/admin/user-identities/${encodeURIComponent(membershipRef)}`, { headers: this.headers(), signal, cache: "no-store" }));
    keys(body, ["ok", "identity"]); return identity(body.identity);
  }
  async update(membershipRef: string, input: AdminUserIdentityChanges & { requestId: string; expectedVersion: number }, signal?: AbortSignal) {
    const body = await json(await this.fetchImpl(`/api/admin/user-identities/${encodeURIComponent(membershipRef)}`, { method: "PATCH", headers: this.headers(true), body: JSON.stringify(input), signal }));
    keys(body, ["ok", "identity"]); return identity(body.identity);
  }
  async photo(membershipRef: string, signal?: AbortSignal) {
    const response = await this.fetchImpl(`/api/admin/user-identities/${encodeURIComponent(membershipRef)}/photo`, { headers: this.headers(), signal, cache: "no-store" });
    if (!response.ok) { await json(response); invalid(); }
    if (!(response.headers.get("Content-Type") || "").toLowerCase().startsWith("image/png")) invalid();
    const blob = await response.blob();
    if (blob.size < 8 || blob.size > MAX_IDENTITY_PHOTO_BYTES) invalid();
    return blob;
  }
  async enrollments(signal?: AbortSignal) {
    const body = await json(await this.fetchImpl("/api/admin/user-enrollments", { headers: this.headers(), signal, cache: "no-store" }));
    keys(body, ["ok", "enrollments"]); if (!Array.isArray(body.enrollments)) invalid();
    return Object.freeze(body.enrollments.map(enrollment));
  }
  async enroll(input: AdminUserEnrollmentInput & { requestId: string }, signal?: AbortSignal) {
    const body = await json(await this.fetchImpl("/api/admin/user-enrollments", { method: "POST", headers: this.headers(true), body: JSON.stringify(input), signal }));
    keys(body, ["ok", "enrollment", "activationPath", "shownOnce"]);
    if (typeof body.shownOnce !== "boolean" || !(body.activationPath === null || typeof body.activationPath === "string" && ACTIVATION_PATH.test(body.activationPath))) invalid();
    return Object.freeze({ enrollment: enrollment(body.enrollment), activationPath: body.activationPath as string | null, shownOnce: body.shownOnce });
  }
  async revoke(enrollmentRef: string, signal?: AbortSignal) {
    const body = await json(await this.fetchImpl(`/api/admin/user-enrollments/${encodeURIComponent(enrollmentRef)}`, { method: "PATCH", headers: this.headers(true), body: JSON.stringify({ requestId: crypto.randomUUID(), action: "REVOKE" }), signal }));
    keys(body, ["ok", "enrollment"]); return enrollment(body.enrollment);
  }
}

/** Re-encoding strips source metadata and bounds the private stored avatar. */
export async function prepareIdentityPhoto(file: File, signal?: AbortSignal): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > MAX_IDENTITY_PHOTO_SOURCE_BYTES) throw new AdminApiError("ADMIN_USER_IDENTITY_PHOTO_INVALID", 400);
  signal?.throwIfAborted();
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { throw new AdminApiError("ADMIN_USER_IDENTITY_PHOTO_INVALID", 400); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 16000 || bitmap.height > 16000) throw new AdminApiError("ADMIN_USER_IDENTITY_PHOTO_INVALID", 400);
    const canvas = document.createElement("canvas");
    for (const maximum of [512, 384, 256, 192, 128, 96, 64]) {
      signal?.throwIfAborted();
      const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d"); if (!context) throw new AdminApiError("ADMIN_USER_IDENTITY_PHOTO_INVALID", 400);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob && blob.size <= MAX_IDENTITY_PHOTO_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer()); signal?.throwIfAborted();
        let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        return btoa(binary);
      }
    }
    throw new AdminApiError("ADMIN_USER_IDENTITY_PHOTO_INVALID", 400);
  } finally { bitmap.close(); }
}
