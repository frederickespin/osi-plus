import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { ToolsEquipmentError } from "./toolsEquipmentContract.js";
import { mapToolsEquipmentDatabaseError } from "./toolsEquipmentDomain.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const TOOLS_EQUIPMENT_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const TOOLS_EQUIPMENT_PREVIEW_BRANCH = "feature/v17-tools-equipment";
export const TOOLS_EQUIPMENT_PREVIEW_BATCH = "V17-TOOLS-EQUIPMENT-06A-PREVIEW";
export const productionApiEnabled = false;
function fail(code, status) { throw new ToolsEquipmentError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
export function resolveToolsEquipmentApiMode(env = process.env, req = undefined) {
  const mode = env.TOOLS_EQUIPMENT_API_MODE ?? TOOLS_EQUIPMENT_API_MODES.DISABLED;
  if (!Object.values(TOOLS_EQUIPMENT_API_MODES).includes(mode)) fail("ASSET_CONFIGURATION_INVALID", 503);
  if (mode === "DISABLED") fail("ASSET_API_DISABLED", 409);
  if (mode === "LOCAL_ONLY") { if (hasVercel(env) || !isRealLoopbackRequest(req)) fail("ASSET_CONFIGURATION_INVALID", 503); return mode; }
  const valid = env.VERCEL === "1" && env.VERCEL_ENV === "preview" && (env.VERCEL_GIT_COMMIT_REF === TOOLS_EQUIPMENT_PREVIEW_BRANCH || isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF))
    && env.TOOLS_EQUIPMENT_API_BATCH === TOOLS_EQUIPMENT_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!valid) fail("ASSET_CONFIGURATION_INVALID", 503);
  return mode;
}
function header(req, name) { const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)]; return Array.isArray(value) ? null : value; }
function assertSameOrigin(req) { const origin = header(req, "origin"); if (origin === undefined) return; const host = header(req, "host"); const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http"); let parsed; try { parsed = new URL(origin); } catch { fail("ASSET_ORIGIN_FORBIDDEN", 403); } if (typeof host !== "string" || origin !== origin.trim() || host !== host.trim() || parsed.origin !== origin || origin !== `${protocol}://${host}`) fail("ASSET_ORIGIN_FORBIDDEN", 403); }
export function sendToolsEquipmentError(res, error, head = false) { const mapped = mapToolsEquipmentDatabaseError(error); const known = mapped instanceof ToolsEquipmentError || (typeof mapped?.code === "string" && Number.isInteger(mapped?.status)); const status = known ? mapped.status : 503; const code = known ? mapped.code : "ASSET_DATABASE_UNAVAILABLE"; return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code }); }
export function prepareToolsEquipmentRequest(req, res, env = process.env) { setCrmPrivateHeaders(res); try { resolveToolsEquipmentApiMode(env, req); assertSameOrigin(req); return true; } catch (error) { sendToolsEquipmentError(res, error, req.method === "HEAD"); return false; } }
export function createToolsEquipmentHandler({ env = process.env, prismaClient, methods, permissions, execute, response = (value) => ({ ok: true, data: value }), resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareToolsEquipmentRequest(req, res, env)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const permission = typeof permissions === "function" ? permissions(req.method === "HEAD" ? "GET" : req.method) : permissions;
      if (!context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission)) fail("ASSET_FORBIDDEN", 403);
      const method = req.method === "HEAD" ? "GET" : req.method;
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 128 * 1024 });
      const value = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(method === "POST" ? 201 : 200).json(response(value));
    } catch (error) { return sendToolsEquipmentError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
