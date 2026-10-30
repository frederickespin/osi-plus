import { ADMIN_MEMBERSHIP_ROLE_OPTIONS, isAdminMembershipRole, type AdminMembershipRoleCode as AdminMembershipRole } from "../../shared/adminMembershipCatalog.js";
import { getMembershipRef } from "@/lib/sessionStore";

export type AdminMembership = Readonly<{
  membershipRef: string;
  name: string;
  email: string;
  role: AdminMembershipRole;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  grantedPermissions: readonly string[];
  deniedPermissions: readonly string[];
  authorizationVersion: number;
  updatedAt: string;
}>;

export type AdminMembershipCatalog = Readonly<{
  roles: readonly Readonly<{ code: AdminMembershipRole; label: string; inheritedPermissions: readonly string[] }>[];
  permissions: readonly Readonly<{ code: string; label: string; group: string }>[];
}>;

export type AdminMembershipChanges = Readonly<{
  role?: AdminMembershipRole;
  status?: AdminMembership["status"];
  grantedPermissions?: readonly string[];
  deniedPermissions?: readonly string[];
}>;

export type AdminIdentityInvitation = Readonly<{
  invitationRef: string;
  email?: string;
  role: "A";
  grantedPermissions: readonly string[];
  status: "PENDING" | "EXPIRED" | "CONSUMED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEMBERSHIP_KEYS = ["membershipRef", "name", "email", "role", "status", "grantedPermissions", "deniedPermissions", "authorizationVersion", "updatedAt"].sort();
const CORPORATE_INVITATION_KEYS = ["invitationRef", "role", "grantedPermissions", "status", "expiresAt", "createdAt"].sort();
const LOCAL_INVITATION_KEYS = [...CORPORATE_INVITATION_KEYS, "email"].sort();

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = "AdminApiError";
    this.code = code;
    this.status = status;
  }
}

function exactObject(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
  }
}

function strings(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
  return Object.freeze([...new Set(value)]);
}

function membership(value: unknown): AdminMembership {
  const row = exactObject(value);
  exactKeys(row, MEMBERSHIP_KEYS);
  if (typeof row.membershipRef !== "string" || !UUID_V4.test(row.membershipRef)
    || typeof row.name !== "string" || typeof row.email !== "string"
    || !isAdminMembershipRole(row.role)
    || !["ACTIVE", "SUSPENDED", "INACTIVE"].includes(String(row.status))
    || !Number.isInteger(row.authorizationVersion) || Number(row.authorizationVersion) < 1
    || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt))) {
    throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
  }
  return Object.freeze({
    membershipRef: row.membershipRef,
    name: row.name,
    email: row.email,
    role: row.role as AdminMembershipRole,
    status: row.status as AdminMembership["status"],
    grantedPermissions: strings(row.grantedPermissions),
    deniedPermissions: strings(row.deniedPermissions),
    authorizationVersion: Number(row.authorizationVersion),
    updatedAt: row.updatedAt,
  });
}

function catalog(value: unknown): AdminMembershipCatalog {
  const result = exactObject(value);
  exactKeys(result, ["permissions", "roles"]);
  if (!Array.isArray(result.roles) || !Array.isArray(result.permissions)
    || result.roles.length !== ADMIN_MEMBERSHIP_ROLE_OPTIONS.length || result.permissions.length > 1000) {
    throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
  }
  const text = (field: unknown, maximum: number) => {
    if (typeof field !== "string" || !field.trim() || field.length > maximum) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
    return field;
  };
  const permissionCodes = new Set<string>();
  const permissions = result.permissions.map((value) => {
    const row = exactObject(value);
    exactKeys(row, ["code", "group", "label"]);
    const code = text(row.code, 160);
    if (permissionCodes.has(code)) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
    permissionCodes.add(code);
    return Object.freeze({ code, label: text(row.label, 200), group: text(row.group, 100) });
  });
  const roleCodes = new Set<string>();
  const roles = result.roles.map((value) => {
    const row = exactObject(value);
    exactKeys(row, ["code", "inheritedPermissions", "label"]);
    if (!isAdminMembershipRole(row.code) || roleCodes.has(row.code as string)) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
    roleCodes.add(row.code as string);
    const inheritedPermissions = strings(row.inheritedPermissions);
    if (inheritedPermissions.some((code) => !permissionCodes.has(code))) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
    return Object.freeze({ code: row.code as AdminMembershipRole, label: text(row.label, 160), inheritedPermissions });
  });
  return Object.freeze({ roles: Object.freeze(roles), permissions: Object.freeze(permissions) });
}

function invitation(value: unknown, corporateRecipient = false): AdminIdentityInvitation {
  const row = exactObject(value);
  exactKeys(row, corporateRecipient ? CORPORATE_INVITATION_KEYS : LOCAL_INVITATION_KEYS);
  if (typeof row.invitationRef !== "string" || !UUID_V4.test(row.invitationRef)
    || (!corporateRecipient && typeof row.email !== "string") || row.role !== "A"
    || !["PENDING", "EXPIRED", "CONSUMED", "REVOKED"].includes(String(row.status))
    || typeof row.expiresAt !== "string" || !Number.isFinite(Date.parse(row.expiresAt))
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) {
    throw new AdminApiError("ADMIN_IDENTITY_INVITATION_RESPONSE_INVALID", 503);
  }
  const result: AdminIdentityInvitation = {
    invitationRef: row.invitationRef,
    role: "A",
    grantedPermissions: strings(row.grantedPermissions),
    status: row.status as AdminIdentityInvitation["status"],
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    ...(corporateRecipient ? {} : { email: row.email as string }),
  };
  return Object.freeze(result);
}

async function responseJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", response.status || 503);
  let value: unknown;
  try { value = await response.json(); } catch { throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", response.status || 503); }
  if (!response.ok) {
    const body = exactObject(value);
    throw new AdminApiError(typeof body.error === "string" ? body.error : "ADMIN_MEMBERSHIP_REQUEST_FAILED", response.status);
  }
  return exactObject(value);
}

export class AdminTenantApi {
  private readonly tokenProvider: () => string | null;
  private readonly membershipRefProvider: () => string | null;
  private readonly fetchImpl: typeof fetch;
  constructor(tokenProvider: () => string | null, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis), membershipRefProvider: () => string | null = getMembershipRef) {
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.membershipRefProvider = membershipRefProvider;
  }

  private headers(json = false) {
    const token = this.tokenProvider();
    const membershipRef = this.membershipRefProvider();
    if (!token) throw new AdminApiError("COMMERCIAL_AUTH_REQUIRED", 401);
    if (!membershipRef) throw new AdminApiError("MT01B_MEMBERSHIP_SELECTION_INVALID", 400);
    return { Authorization: `Bearer ${token}`, "X-OSI-Membership-Ref": membershipRef, ...(json ? { "Content-Type": "application/json" } : {}) };
  }

  async list(filters: Readonly<{ search?: string; role?: string; status?: string; page?: number; pageSize?: number }>, signal?: AbortSignal) {
    const query = new URLSearchParams();
    if (filters.search) query.set("search", filters.search);
    if (filters.role) query.set("role", filters.role);
    if (filters.status) query.set("status", filters.status);
    query.set("page", String(filters.page || 1));
    query.set("pageSize", String(filters.pageSize || 20));
    const body = await responseJson(await this.fetchImpl(`/api/admin/memberships?${query}`, { headers: this.headers(), signal }));
    exactKeys(body, ["catalog", "data", "ok", "page", "pageSize", "total"]);
    if (body.ok !== true || !Array.isArray(body.data) || !Number.isInteger(body.total) || !Number.isInteger(body.page) || !Number.isInteger(body.pageSize)) {
      throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
    }
    return Object.freeze({ data: Object.freeze(body.data.map(membership)), total: Number(body.total), page: Number(body.page), pageSize: Number(body.pageSize), catalog: catalog(body.catalog) });
  }

  async get(ref: string, signal?: AbortSignal) {
    const body = await responseJson(await this.fetchImpl(`/api/admin/memberships/${encodeURIComponent(ref)}`, { headers: this.headers(), signal }));
    exactKeys(body, ["membership", "ok"]);
    if (body.ok !== true) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
    return membership(body.membership);
  }

  async update(ref: string, input: AdminMembershipChanges & Readonly<{ requestId: string; expectedVersion: number }>, signal?: AbortSignal) {
    const body = await responseJson(await this.fetchImpl(`/api/admin/memberships/${encodeURIComponent(ref)}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify(input),
      signal,
    }));
    exactKeys(body, ["membership", "ok"]);
    if (body.ok !== true) throw new AdminApiError("ADMIN_MEMBERSHIP_RESPONSE_INVALID", 503);
    return membership(body.membership);
  }

  async listInvitations(corporateRecipient = false, signal?: AbortSignal) {
    const body = await responseJson(await this.fetchImpl("/api/admin/identity-invitations", { headers: this.headers(), signal }));
    exactKeys(body, ["invitations", "ok"]);
    if (body.ok !== true || !Array.isArray(body.invitations)) throw new AdminApiError("ADMIN_IDENTITY_INVITATION_RESPONSE_INVALID", 503);
    return Object.freeze(body.invitations.map((item) => invitation(item, corporateRecipient)));
  }

  async issueInvitation(email: string, signal?: AbortSignal) {
    const body = await responseJson(await this.fetchImpl("/api/admin/identity-invitations", {
      method: "POST", headers: this.headers(true), body: JSON.stringify({ requestId: crypto.randomUUID(), email }), signal,
    }));
    exactKeys(body, ["activationPath", "invitation", "ok", "shownOnce"]);
    if (body.ok !== true || typeof body.shownOnce !== "boolean"
      || !(body.activationPath === null || typeof body.activationPath === "string")) {
      throw new AdminApiError("ADMIN_IDENTITY_INVITATION_RESPONSE_INVALID", 503);
    }
    return Object.freeze({ invitation: invitation(body.invitation), activationPath: body.activationPath as string | null, shownOnce: body.shownOnce });
  }

  async issueCorporateInvitation(signal?: AbortSignal) {
    const body = await responseJson(await this.fetchImpl("/api/admin/identity-invitations", {
      method: "POST", headers: this.headers(true), body: JSON.stringify({ requestId: crypto.randomUUID() }), signal,
    }));
    exactKeys(body, ["activationPath", "invitation", "ok", "shownOnce"]);
    if (body.ok !== true || typeof body.shownOnce !== "boolean"
      || !(body.activationPath === null || typeof body.activationPath === "string")) {
      throw new AdminApiError("ADMIN_IDENTITY_INVITATION_RESPONSE_INVALID", 503);
    }
    return Object.freeze({ invitation: invitation(body.invitation, true), activationPath: body.activationPath as string | null, shownOnce: body.shownOnce });
  }

  async revokeInvitation(ref: string, corporateRecipient = false, signal?: AbortSignal) {
    const body = await responseJson(await this.fetchImpl(`/api/admin/identity-invitations/${encodeURIComponent(ref)}`, {
      method: "PATCH", headers: this.headers(true), body: JSON.stringify({ requestId: crypto.randomUUID(), action: "REVOKE" }), signal,
    }));
    exactKeys(body, ["invitation", "ok"]);
    if (body.ok !== true) throw new AdminApiError("ADMIN_IDENTITY_INVITATION_RESPONSE_INVALID", 503);
    return invitation(body.invitation, corporateRecipient);
  }
}
