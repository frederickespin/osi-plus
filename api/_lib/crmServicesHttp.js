import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { CrmServicesError } from "./crmServicesContract.js";

export const CRM_SERVICES_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const CRM_SERVICES_PREVIEW_BRANCH = "feature/v17-services-tenant-first";
export const CRM_SERVICES_PREVIEW_BATCH = "V17-SERVICES-TENANT-FIRST-03A-PREVIEW";

function fail(code, status) { throw new CrmServicesError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
export function resolveCrmServicesApiMode(env = process.env, req = undefined) {
  const mode = env.CRM_SERVICES_API_MODE ?? CRM_SERVICES_API_MODES.DISABLED;
  if (!Object.values(CRM_SERVICES_API_MODES).includes(mode)) fail("CRM_SERVICES_CONFIGURATION_INVALID", 503);
  if (mode === CRM_SERVICES_API_MODES.DISABLED) fail("CRM_SERVICES_DISABLED", 409);
  if (mode === CRM_SERVICES_API_MODES.LOCAL_ONLY) {
    if (hasVercel(env) || !isRealLoopbackRequest(req)) fail("CRM_SERVICES_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const validPreview = env.VERCEL === "1" && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === CRM_SERVICES_PREVIEW_BRANCH
    && env.CRM_SERVICES_API_BATCH === CRM_SERVICES_PREVIEW_BATCH
    && env.MT01B_AUTH_MODE === "LEGACY" && env.MT01B_TENANT_SWITCH_ENABLED === "false"
    && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!validPreview) fail("CRM_SERVICES_CONFIGURATION_INVALID", 503);
  return mode;
}
function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)];
  return Array.isArray(value) ? null : value;
}
function sameOrigin(req) {
  const origin = header(req, "origin");
  if (origin === undefined) return;
  const host = header(req, "host");
  const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http");
  if (typeof origin !== "string" || typeof host !== "string" || origin !== origin.trim() || host !== host.trim()) fail("CRM_SERVICES_ORIGIN_FORBIDDEN", 403);
  let parsed; try { parsed = new URL(origin); } catch { fail("CRM_SERVICES_ORIGIN_FORBIDDEN", 403); }
  if (parsed.origin !== origin || origin !== `${protocol}://${host}`) fail("CRM_SERVICES_ORIGIN_FORBIDDEN", 403);
}
function sendError(res, error, head = false) {
  const known = error instanceof CrmServicesError || (typeof error?.code === "string" && Number.isInteger(error?.status));
  const status = known ? error.status : 503;
  const code = known ? error.code : "CRM_SERVICES_DATABASE_UNAVAILABLE";
  return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code });
}
export function createCrmServicesHandler({ env = process.env, prismaClient, methods, execute, response = (value) => ({ ok: true, data: value }), resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    try { resolveCrmServicesApiMode(env, req); sameOrigin(req); } catch (error) { return sendError(res, error, req.method === "HEAD"); }
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const isRead = req.method === "GET" || req.method === "HEAD";
      const input = isRead ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 64 * 1024 });
      const value = await execute({ req, context, input, prisma: prismaClient, method: req.method === "HEAD" ? "GET" : req.method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(req.method === "POST" ? 201 : 200).json(response(value));
    } catch (error) { return sendError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
