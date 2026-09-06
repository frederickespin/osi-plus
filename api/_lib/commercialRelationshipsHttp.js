import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { CommercialRelationshipsError } from "./commercialRelationshipsContract.js";
import { mapCommercialRelationshipsDatabaseError } from "./commercialRelationshipsDomain.js";

export const COMMERCIAL_RELATIONSHIPS_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const COMMERCIAL_RELATIONSHIPS_PREVIEW_BRANCH = "feature/v17-consolidated-preview";
export const COMMERCIAL_RELATIONSHIPS_PREVIEW_BATCH = "V17-COMMERCIAL-RELATIONSHIPS-12A-PREVIEW";
export const productionApiEnabled = false;

function fail(code, status) { throw new CommercialRelationshipsError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
export function resolveCommercialRelationshipsApiMode(env = process.env, req) {
  const mode = env.COMMERCIAL_RELATIONSHIPS_API_MODE ?? "DISABLED";
  if (!Object.values(COMMERCIAL_RELATIONSHIPS_API_MODES).includes(mode)) fail("COMMERCIAL_RELATIONSHIPS_CONFIGURATION_INVALID", 503);
  if (mode === "DISABLED") fail("COMMERCIAL_RELATIONSHIPS_DISABLED", 409);
  if (mode === "LOCAL_ONLY") { if (hasVercel(env) || !isRealLoopbackRequest(req)) fail("COMMERCIAL_RELATIONSHIPS_CONFIGURATION_INVALID", 503); return mode; }
  if (!(env.VERCEL === "1" && env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === COMMERCIAL_RELATIONSHIPS_PREVIEW_BRANCH && env.COMMERCIAL_RELATIONSHIPS_API_BATCH === COMMERCIAL_RELATIONSHIPS_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY" && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false")) fail("COMMERCIAL_RELATIONSHIPS_CONFIGURATION_INVALID", 503);
  return mode;
}
function header(req, name) { const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)]; return Array.isArray(value) ? null : value; }
function assertSameOrigin(req) { const origin = header(req, "origin"); if (origin === undefined) return; const host = header(req, "host"); const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http"); let parsed; try { parsed = new URL(origin); } catch { fail("COMMERCIAL_RELATIONSHIPS_ORIGIN_FORBIDDEN", 403); } if (typeof host !== "string" || origin !== origin.trim() || parsed.origin !== origin || origin !== `${protocol}://${host}`) fail("COMMERCIAL_RELATIONSHIPS_ORIGIN_FORBIDDEN", 403); }
export function sendCommercialRelationshipsError(res, cause, head = false) { const error = mapCommercialRelationshipsDatabaseError(cause); const known = error instanceof CommercialRelationshipsError || (typeof error?.code === "string" && Number.isInteger(error?.status)); const status = known ? error.status : 503; const code = known ? error.code : "COMMERCIAL_RELATIONSHIPS_DATABASE_UNAVAILABLE"; return head ? res.status(status).end() : res.status(status).json({ ok: false, error: code }); }
export function prepareCommercialRelationshipsRequest(req, res, env = process.env) { setCrmPrivateHeaders(res); try { resolveCommercialRelationshipsApiMode(env, req); assertSameOrigin(req); return true; } catch (error) { sendCommercialRelationshipsError(res, error, req.method === "HEAD"); return false; } }
export function createCommercialRelationshipsHandler({ env = process.env, prismaClient, methods, permission, execute, status = 200, resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => { if (!prepareCommercialRelationshipsRequest(req, res, env)) return; if (req.method === "OPTIONS") return res.status(204).end(); const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods; if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed); try { const context = await resolveContext(req, { env, prisma: prismaClient }); const method = req.method === "HEAD" ? "GET" : req.method; const required = typeof permission === "function" ? permission(method) : permission; if (!context.effectivePermissions?.includes(required) || context.deniedPermissions?.includes(required)) fail("COMMERCIAL_RELATIONSHIPS_FORBIDDEN", 403); const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 256 * 1024 }); const value = await execute({ req, context, input, prisma: prismaClient, method }); if (req.method === "HEAD") return res.status(200).end(); return res.status(typeof status === "function" ? status(method) : status).json({ ok: true, data: value }); } catch (error) { return sendCommercialRelationshipsError(res, error, req.method === "HEAD"); } }, { handleOptions: false });
}
