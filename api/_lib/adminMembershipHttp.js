import { prisma as defaultPrisma } from "./db.js";
import { readJsonObject, withCommonHeaders } from "./http.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import { AdminMembershipAccessError, requireAdminTenantMembershipAccess } from "./adminMembershipAccess.js";
import {
  AdminMembershipError,
  getTenantMembership,
  listTenantMemberships,
  updateTenantMembership,
} from "./adminMembershipDomain.js";

const PATCH_FIELDS = new Set(["requestId", "expectedVersion", "role", "status", "grantedPermissions", "deniedPermissions"]);

function single(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)];
  return Array.isArray(value) ? null : value;
}

function assertSameOrigin(req) {
  const origin = single(req, "origin");
  if (origin === undefined) return;
  const host = single(req, "host");
  const protocol = single(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http");
  if (typeof origin !== "string" || origin !== `${protocol}://${host}`) {
    throw new AdminMembershipError("ADMIN_MEMBERSHIP_ORIGIN_FORBIDDEN", 403);
  }
}

function send(res, error, head = false) {
  const controlled = error instanceof AdminMembershipError
    || error instanceof AdminMembershipAccessError
    || error instanceof CommercialTenancyError
    || error instanceof Mt01bAuthError;
  const status = controlled && Number.isInteger(error.status) ? error.status : 503;
  const code = controlled ? String(error.code || "ADMIN_MEMBERSHIP_UNAVAILABLE") : "ADMIN_MEMBERSHIP_UNAVAILABLE";
  if (head) return res.status(status).end();
  return res.status(status).json({ ok: false, error: code });
}

function methodNotAllowed(res, allowed, head = false) {
  res.setHeader("Allow", allowed.join(", "));
  if (head) return res.status(405).end();
  return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
}

function queryFilters(req) {
  const url = new URL(req.url || "/", "http://admin.local");
  const allowed = new Set(["search", "role", "status", "page", "pageSize"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
    }
  }
  return {
    search: url.searchParams.get("search") || "",
    role: url.searchParams.get("role") || "",
    status: url.searchParams.get("status") || "",
    page: url.searchParams.get("page") || "1",
    pageSize: url.searchParams.get("pageSize") || "20",
  };
}

function strictPatch(body) {
  if (Object.keys(body).some((key) => !PATCH_FIELDS.has(key))) {
    throw new AdminMembershipError("ADMIN_MEMBERSHIP_INPUT_INVALID", 400);
  }
  return body;
}

export function createAdminMembershipCollectionHandler({
  env = process.env,
  prisma = defaultPrisma,
  resolveContext = resolveCrmPipelineContext,
  list = listTenantMemberships,
} = {}) {
  return withCommonHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    const head = req.method === "HEAD";
    try {
      requireAdminTenantMembershipAccess(req, env);
      if (!["GET", "HEAD"].includes(req.method)) return methodNotAllowed(res, ["GET", "HEAD"], head);
      assertSameOrigin(req);
      const context = await resolveContext(req, { prisma, env });
      const result = await list(prisma, context, queryFilters(req));
      if (head) return res.status(200).end();
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return send(res, error, head);
    }
  }, { cors: false, handleOptions: false });
}

export function createAdminMembershipDetailHandler({
  env = process.env,
  prisma = defaultPrisma,
  resolveContext = resolveCrmPipelineContext,
  get = getTenantMembership,
  update = updateTenantMembership,
} = {}) {
  return withCommonHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    const head = req.method === "HEAD";
    try {
      requireAdminTenantMembershipAccess(req, env);
      if (!["GET", "HEAD", "PATCH"].includes(req.method)) return methodNotAllowed(res, ["GET", "HEAD", "PATCH"], head);
      assertSameOrigin(req);
      const context = await resolveContext(req, { prisma, env });
      const membershipRef = Array.isArray(req.query?.membershipRef) ? null : req.query?.membershipRef;
      if (req.method === "PATCH") {
        const body = strictPatch(await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 32 * 1024 }));
        const result = await update(prisma, context, membershipRef, body);
        return res.status(200).json({ ok: true, membership: result });
      }
      const result = await get(prisma, context, membershipRef);
      if (head) return res.status(200).end();
      return res.status(200).json({ ok: true, membership: result });
    } catch (error) {
      return send(res, error, head);
    }
  }, { cors: false, handleOptions: false });
}
