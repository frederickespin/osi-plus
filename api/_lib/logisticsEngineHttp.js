import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { LogisticsEngineError } from "./logisticsEngineContract.js";
import { mapLogisticsDatabaseError } from "./logisticsEngineDomain.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const LOGISTICS_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const LOGISTICS_PREVIEW_BRANCH = "feature/v17-logistics-engine";
export const LOGISTICS_PREVIEW_BATCH = "V17-LOGISTICS-ENGINE-07A-PREVIEW";
function fail(code, status) { throw new LogisticsEngineError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
export function resolveLogisticsApiMode(env = process.env, req = undefined) {
  const mode = env.LOGISTICS_ENGINE_API_MODE ?? LOGISTICS_API_MODES.DISABLED;
  if (!Object.values(LOGISTICS_API_MODES).includes(mode)) fail("LOGISTICS_CONFIGURATION_INVALID", 503);
  if (mode === LOGISTICS_API_MODES.DISABLED) fail("LOGISTICS_DISABLED", 409);
  if (mode === LOGISTICS_API_MODES.LOCAL_ONLY) {
    if (hasVercel(env) || !isRealLoopbackRequest(req)) fail("LOGISTICS_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const valid = env.VERCEL === "1" && env.VERCEL_ENV === "preview" && (env.VERCEL_GIT_COMMIT_REF === LOGISTICS_PREVIEW_BRANCH || isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF))
    && env.LOGISTICS_ENGINE_API_BATCH === LOGISTICS_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!valid) fail("LOGISTICS_CONFIGURATION_INVALID", 503);
  return mode;
}
function header(req, name) { const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)]; return Array.isArray(value) ? null : value; }
function assertSameOrigin(req) { const origin = header(req, "origin"); if (origin === undefined) return; const host = header(req, "host"); const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http"); let parsed; try { parsed = new URL(origin); } catch { fail("LOGISTICS_ORIGIN_FORBIDDEN", 403); } if (typeof host !== "string" || origin !== origin.trim() || host !== host.trim() || parsed.origin !== origin || origin !== `${protocol}://${host}`) fail("LOGISTICS_ORIGIN_FORBIDDEN", 403); }
export function sendLogisticsError(res, cause, head = false) { const error = mapLogisticsDatabaseError(cause); const known = error instanceof LogisticsEngineError || (typeof error?.code === "string" && Number.isInteger(error?.status)); const status = known ? error.status : 503; const code = known ? error.code : "LOGISTICS_DATABASE_UNAVAILABLE"; return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code }); }
export function prepareLogisticsRequest(req, res, env = process.env) { setCrmPrivateHeaders(res); try { resolveLogisticsApiMode(env, req); assertSameOrigin(req); return true; } catch (error) { sendLogisticsError(res, error, req.method === "HEAD"); return false; } }
export function createLogisticsHandler({ env = process.env, prismaClient, methods, permission, execute, status = 200, resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareLogisticsRequest(req, res, env)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const required = typeof permission === "function" ? permission(req.method === "HEAD" ? "GET" : req.method) : permission;
      if (!context.effectivePermissions?.includes(required) || context.deniedPermissions?.includes(required)) fail("LOGISTICS_FORBIDDEN", 403);
      const method = req.method === "HEAD" ? "GET" : req.method;
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 128 * 1024 });
      const value = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(typeof status === "function" ? status(method) : status).json({ ok: true, data: value });
    } catch (error) { return sendLogisticsError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
