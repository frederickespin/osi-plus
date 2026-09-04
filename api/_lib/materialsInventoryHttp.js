import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { MaterialsInventoryError } from "./materialsInventoryContract.js";

export const MATERIALS_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const MATERIALS_PREVIEW_BRANCH = "feature/v17-materials-inventory";
export const MATERIALS_PREVIEW_BATCH = "V17-MATERIALS-INVENTORY-05A-PREVIEW";
function fail(code, status) { throw new MaterialsInventoryError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
export function resolveMaterialsApiMode(env = process.env, req = undefined) {
  const mode = env.MATERIALS_INVENTORY_API_MODE ?? MATERIALS_API_MODES.DISABLED;
  if (!Object.values(MATERIALS_API_MODES).includes(mode)) fail("MATERIALS_CONFIGURATION_INVALID", 503);
  if (mode === MATERIALS_API_MODES.DISABLED) fail("MATERIALS_DISABLED", 409);
  if (mode === MATERIALS_API_MODES.LOCAL_ONLY) {
    if (hasVercel(env) || !isRealLoopbackRequest(req)) fail("MATERIALS_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const valid = env.VERCEL === "1" && env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === MATERIALS_PREVIEW_BRANCH
    && env.MATERIALS_INVENTORY_API_BATCH === MATERIALS_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!valid) fail("MATERIALS_CONFIGURATION_INVALID", 503);
  return mode;
}
function header(req, name) { const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)]; return Array.isArray(value) ? null : value; }
function assertSameOrigin(req) {
  const origin = header(req, "origin"); if (origin === undefined) return;
  const host = header(req, "host"); const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http");
  let parsed; try { parsed = new URL(origin); } catch { fail("MATERIALS_ORIGIN_FORBIDDEN", 403); }
  if (typeof host !== "string" || origin !== origin.trim() || host !== host.trim() || parsed.origin !== origin || origin !== `${protocol}://${host}`) fail("MATERIALS_ORIGIN_FORBIDDEN", 403);
}
export function sendMaterialsError(res, error, head = false) {
  const known = error instanceof MaterialsInventoryError || (typeof error?.code === "string" && Number.isInteger(error?.status));
  const status = known ? error.status : 503; const code = known ? error.code : "MATERIALS_DATABASE_UNAVAILABLE";
  return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code });
}
export function prepareMaterialsRequest(req, res, env = process.env) {
  setCrmPrivateHeaders(res);
  try { resolveMaterialsApiMode(env, req); assertSameOrigin(req); return true; } catch (error) { sendMaterialsError(res, error, req.method === "HEAD"); return false; }
}
export function createMaterialsHandler({ env = process.env, prismaClient, methods, permission, execute, response = (value) => ({ ok: true, data: value }), resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    if (!prepareMaterialsRequest(req, res, env)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      if (!context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission)) fail("MATERIALS_FORBIDDEN", 403);
      const method = req.method === "HEAD" ? "GET" : req.method;
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 128 * 1024 });
      const value = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(method === "POST" ? 201 : 200).json(response(value));
    } catch (error) { return sendMaterialsError(res, error, req.method === "HEAD"); }
  }, { handleOptions: false });
}
