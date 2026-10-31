import { prisma as defaultPrisma } from "./db.js";
import { JsonBodyError, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { getBearerToken, verifyStrictLegacyAccessToken } from "./auth.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import { AdminMembershipError } from "./adminMembershipDomain.js";
import { AdminMembershipPreviewError } from "./adminMembershipPreview.js";
import { AdminUserIdentityError, exactIdentityObject, identityFail } from "./adminUserIdentityContract.js";
import { assertUserIdentityDatabase, requireUserIdentityAccess, requireUserIdentityContext, userIdentityExpectedTenant } from "./adminUserIdentityAccess.js";
import { getUserIdentity, getUserIdentityPhoto, listUserIdentityDirectory, listUserIdentitySummaries, updateUserIdentity } from "./adminUserIdentityDomain.js";
import { activateUserEnrollment, issueUserEnrollment, listUserEnrollments, resolveUserEnrollment, revokeUserEnrollment } from "./adminUserEnrollmentDomain.js";

function header(req, name) { const value = req.headers?.[name]; return Array.isArray(value) ? null : value; }
function sameOrigin(req) {
  const origin = header(req, "origin");
  if (origin === undefined) return;
  const protocol = header(req, "x-forwarded-proto") ?? (req.socket?.encrypted ? "https" : "http");
  if (origin !== `${protocol}://${header(req, "host")}`) identityFail("ORIGIN_FORBIDDEN", 403);
}
function privateHeaders(res) {
  setCrmPrivateHeaders(res);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
function sendError(res, error, head = false) {
  const controlled = error instanceof AdminUserIdentityError || error instanceof AdminMembershipError || error instanceof AdminMembershipPreviewError
    || error instanceof JsonBodyError || error instanceof CommercialTenancyError || error instanceof Mt01bAuthError;
  const status = controlled && Number.isInteger(error.status) ? error.status : 503;
  let code = controlled ? error.code : "ADMIN_USER_IDENTITY_UNAVAILABLE";
  if (error instanceof AdminMembershipError && status === 403) code = "ADMIN_USER_IDENTITY_FORBIDDEN";
  if (head) return res.status(status).end();
  return res.status(status).json({ ok: false, error: code });
}
function method(res, allowed, head) {
  res.setHeader("Allow", allowed.join(", "));
  return head ? res.status(405).end() : res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
}
function pathRef(req, name) { return Array.isArray(req.query?.[name]) ? null : req.query?.[name]; }
function filters(req) {
  const params = new URL(req.url || "/", "http://admin.local").searchParams;
  const accepted = new Set(["refs", "search", "role", "status", "page", "pageSize"]);
  for (const key of params.keys()) if (!accepted.has(key) || params.getAll(key).length !== 1) identityFail("INPUT_INVALID");
  if (params.has("refs")) {
    if ([...params.keys()].length !== 1) identityFail("INPUT_INVALID");
    return { refs: params.get("refs").split(",") };
  }
  return Object.fromEntries(params.entries());
}
async function contextFor(req, { env, prisma, resolveContext, checkDatabase }) {
  const mode = requireUserIdentityAccess(req, env);
  sameOrigin(req);
  await checkDatabase(prisma, mode, env);
  const context = await resolveContext(req, { prisma, env });
  requireUserIdentityContext(env, mode, context);
  return context;
}
function settings(options) {
  const { env = process.env, prisma = defaultPrisma, resolveContext = resolveCrmPipelineContext,
    checkDatabase = assertUserIdentityDatabase } = options;
  return { env, prisma, resolveContext, checkDatabase };
}
function protectedHandler(options, allowed, run) {
  const deps = settings(options);
  return withPrivateApiHeaders(async (req, res) => {
    privateHeaders(res);
    const head = req.method === "HEAD";
    try {
      requireUserIdentityAccess(req, deps.env);
      if (!allowed.includes(req.method)) return method(res, allowed, head);
      const context = await contextFor(req, deps);
      return await run(req, res, context, deps.prisma, head);
    } catch (error) { return sendError(res, error, head); }
  }, { handleOptions: false });
}
export function createAdminUserIdentityCollectionHandler(options = {}) {
  const list = options.list ?? listUserIdentityDirectory;
  const summaries = options.summaries ?? listUserIdentitySummaries;
  return protectedHandler(options, ["GET", "HEAD"], async (req, res, context, prisma, head) => {
    const query = filters(req);
    const result = query.refs ? { data: await summaries(prisma, context, query.refs) } : await list(prisma, context, query);
    return head ? res.status(200).end() : res.status(200).json({ ok: true, ...result });
  });
}
export function createAdminUserIdentityDetailHandler(options = {}) {
  const get = options.get ?? getUserIdentity;
  const update = options.update ?? updateUserIdentity;
  return protectedHandler(options, ["GET", "HEAD", "PATCH"], async (req, res, context, prisma, head) => {
    const ref = pathRef(req, "membershipRef");
    const identity = req.method === "PATCH"
      ? await update(prisma, context, ref, await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 384 * 1024 }))
      : await get(prisma, context, ref);
    return head ? res.status(200).end() : res.status(200).json({ ok: true, identity });
  });
}
export function createAdminUserIdentityPhotoHandler(options = {}) {
  const get = options.get ?? getUserIdentityPhoto;
  return protectedHandler(options, ["GET", "HEAD"], async (req, res, context, prisma, head) => {
    const photo = await get(prisma, context, pathRef(req, "membershipRef"));
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", 'inline; filename="profile.png"');
    res.setHeader("Content-Length", String(photo.bytes.length));
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    return head ? res.status(200).end() : res.status(200).end(photo.bytes);
  });
}
export function createAdminUserEnrollmentCollectionHandler(options = {}) {
  const list = options.list ?? listUserEnrollments;
  const issue = options.issue ?? issueUserEnrollment;
  return protectedHandler(options, ["GET", "HEAD", "POST"], async (req, res, context, prisma, head) => {
    if (req.method === "POST") {
      const result = await issue(prisma, context, await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 384 * 1024 }));
      return res.status(201).json({ ok: true, ...result });
    }
    const enrollments = await list(prisma, context);
    return head ? res.status(200).end() : res.status(200).json({ ok: true, enrollments });
  });
}
export function createAdminUserEnrollmentDetailHandler(options = {}) {
  const revoke = options.revoke ?? revokeUserEnrollment;
  return protectedHandler(options, ["PATCH"], async (req, res, context, prisma) => {
    const input = await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 4096 });
    const enrollment = await revoke(prisma, context, pathRef(req, "enrollmentRef"), input);
    return res.status(200).json({ ok: true, enrollment });
  });
}
export function createAdminUserEnrollmentActivationHandler(options = {}) {
  const { env, prisma, checkDatabase } = settings(options);
  const resolve = options.resolve ?? resolveUserEnrollment;
  const activate = options.activate ?? activateUserEnrollment;
  const verifyIdentity = options.verifyIdentity ?? verifyStrictLegacyAccessToken;
  return withPrivateApiHeaders(async (req, res) => {
    privateHeaders(res);
    try {
      const mode = requireUserIdentityAccess(req, env);
      if (req.method !== "POST") return method(res, ["POST"], req.method === "HEAD");
      sameOrigin(req);
      await checkDatabase(prisma, mode, env);
      const body = await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 8192 });
      if (body.action !== "RESOLVE" && body.action !== "ACTIVATE") identityFail("ACTIVATION_INVALID");
      exactIdentityObject(body, body.action === "RESOLVE" ? ["action", "token"] : ["action", "token", "password"]);
      const configuration = { expectedTenantCode: userIdentityExpectedTenant(env, mode) };
      const activation = await resolve(prisma, body.token, configuration);
      if (body.action === "RESOLVE") return res.status(200).json({ ok: true, activation });
      let identity = null;
      if (activation.mode === "EXISTING_IDENTITY") {
        if (Object.hasOwn(body, "password")) identityFail("ACTIVATION_INVALID");
        try { identity = verifyIdentity(getBearerToken(req)); } catch { identityFail("AUTH_REQUIRED", 401); }
      }
      const { action: _action, ...input } = body;
      const result = await activate(prisma, input, identity, configuration);
      return res.status(200).json({ ok: true, ...result });
    } catch (error) { return sendError(res, error); }
  }, { handleOptions: false });
}
