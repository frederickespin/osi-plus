import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { CommunicationsError } from "./communicationsContract.js";

export const productionApiEnabled = false;
export const COMMUNICATIONS_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY" });
function fail(code, status) { throw new CommunicationsError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
export function resolveCommunicationsApiMode(env = process.env, req) {
  const mode = env.COMMUNICATIONS_API_MODE ?? "DISABLED";
  if (!Object.values(COMMUNICATIONS_API_MODES).includes(mode)) fail("COMMUNICATIONS_CONFIGURATION_INVALID", 503);
  if (mode === "DISABLED") fail("COMMUNICATIONS_DISABLED", 409);
  if (hasVercel(env) || !isRealLoopbackRequest(req)) fail("COMMUNICATIONS_CONFIGURATION_INVALID", 503);
  return mode;
}
function header(req, name) { const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_m, dash, letter) => `${dash}${letter.toUpperCase()}`)]; return Array.isArray(value) ? null : value; }
function assertSameOrigin(req) { const origin = header(req, "origin"); if (origin === undefined) return; const host = header(req, "host"); const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http"); let parsed; try { parsed = new URL(origin); } catch { fail("COMMUNICATIONS_ORIGIN_FORBIDDEN", 403); } if (typeof host !== "string" || origin !== origin.trim() || host !== host.trim() || parsed.origin !== origin || origin !== `${protocol}://${host}`) fail("COMMUNICATIONS_ORIGIN_FORBIDDEN", 403); }
export function sendCommunicationsError(res, cause, head = false) { const known = cause instanceof CommunicationsError; const status = known ? cause.status : cause?.code === "P2002" || cause?.code === "P2034" ? 409 : 503; const error = known ? cause.code : status === 409 ? "COMMUNICATION_CONFLICT" : "COMMUNICATION_DATABASE_UNAVAILABLE"; return head ? res.status(status).end() : res.status(status).json({ ok: false, error }); }
export function prepareCommunicationsRequest(req, res, env = process.env) { setCrmPrivateHeaders(res); try { resolveCommunicationsApiMode(env, req); assertSameOrigin(req); return true; } catch (error) { sendCommunicationsError(res, error, req.method === "HEAD"); return false; } }
export function createCommunicationsHandler({ env = process.env, prismaClient, methods, permission, execute, status = 200, resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareCommunicationsRequest(req, res, env)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const required = typeof permission === "function" ? permission(req.method === "HEAD" ? "GET" : req.method) : permission;
      if (!context.effectivePermissions?.includes(required) || context.deniedPermissions?.includes(required)) fail("COMMUNICATION_FORBIDDEN", 403);
      const method = req.method === "HEAD" ? "GET" : req.method;
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 96 * 1024 });
      const data = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(typeof status === "function" ? status(method) : status).json({ ok: true, data });
    } catch (error) { return sendCommunicationsError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
export function createTransportDisabledHandler() { return withPrivateApiHeaders((req, res) => { setCrmPrivateHeaders(res); return res.status(409).json({ ok: false, error: "COMMUNICATION_TRANSPORT_DISABLED" }); }, { handleOptions: false }); }
