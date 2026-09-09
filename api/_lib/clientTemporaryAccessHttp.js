import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { ClientTemporaryAccessError } from "./clientTemporaryAccessContract.js";

export const productionApiEnabled = false;
export const CLIENT_TEMPORARY_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY" });

function fail(code, status) { throw new ClientTemporaryAccessError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
function header(req, name) { const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_m, dash, letter) => `${dash}${letter.toUpperCase()}`)]; return Array.isArray(value) ? null : value; }
function sameOrigin(req) {
  const origin = header(req, "origin");
  if (origin === undefined) return;
  const host = header(req, "host");
  const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http");
  try { if (typeof host !== "string" || origin !== origin.trim() || new URL(origin).origin !== origin || origin !== `${protocol}://${host}`) fail("CLIENT_TEMPORARY_ORIGIN_FORBIDDEN", 403); }
  catch (error) { if (error instanceof ClientTemporaryAccessError) throw error; fail("CLIENT_TEMPORARY_ORIGIN_FORBIDDEN", 403); }
}

export function resolveClientTemporaryApiMode(env = process.env, req) {
  const mode = env.CLIENT_TEMPORARY_ACCESS_API_MODE ?? "DISABLED";
  if (!Object.values(CLIENT_TEMPORARY_API_MODES).includes(mode)) fail("CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
  if (mode === "DISABLED") fail("CLIENT_TEMPORARY_DISABLED", 409);
  if (productionApiEnabled !== false || hasVercel(env) || !isRealLoopbackRequest(req)) fail("CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
  return mode;
}

export function prepareClientTemporaryRequest(req, res, env = process.env) {
  setCrmPrivateHeaders(res);
  try { const mode = resolveClientTemporaryApiMode(env, req); sameOrigin(req); return mode; }
  catch (error) { sendClientTemporaryError(res, error, req.method === "HEAD"); return false; }
}

export function sendClientTemporaryError(res, cause, head = false) {
  const known = cause instanceof ClientTemporaryAccessError || (typeof cause?.code === "string" && Number.isInteger(cause?.status));
  const status = known ? cause.status : 503;
  const error = known ? cause.code : "CLIENT_TEMPORARY_DATABASE_UNAVAILABLE";
  return head ? res.status(status).end() : res.status(status).json({ ok: false, error });
}

export function clientTemporaryTokenFromRequest(req) {
  const value = header(req, "authorization");
  if (typeof value !== "string" || !value.startsWith("ClientAccess ")) fail("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", 404);
  return value.slice("ClientAccess ".length);
}

export function createInternalClientTemporaryHandler({ env = process.env, prismaClient, methods, execute, resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareClientTemporaryRequest(req, res, env)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const method = req.method === "HEAD" ? "GET" : req.method;
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 64 * 1024 });
      const value = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(method === "POST" ? 201 : 200).json({ ok: true, data: value });
    } catch (error) { return sendClientTemporaryError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}

export function createExternalClientTemporaryHandler({ env = process.env, prismaClient, methods = ["POST"], maxBytes = 64 * 1024, execute } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareClientTemporaryRequest(req, res, env)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    if (!methods.includes(req.method)) return methodNotAllowed(res, methods);
    try {
      const token = clientTemporaryTokenFromRequest(req);
      const input = await readJsonObject(req, { required: true, requireNonEmptyObject: false, maxBytes });
      const value = await execute({ req, accessRef: req.query?.accessRef, token, input, prisma: prismaClient });
      return res.status(200).json({ ok: true, data: value });
    } catch (error) { return sendClientTemporaryError(res, error); }
  }, { handleOptions: false });
}
