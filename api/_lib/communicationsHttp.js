import { createHash } from "node:crypto";
import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { CommunicationsError } from "./communicationsContract.js";
import { COMMUNICATION_TRANSPORT_CAPABILITIES } from "./communicationsTransport.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const productionApiEnabled = false;
export const COMMUNICATIONS_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const COMMUNICATIONS_PREVIEW_BATCH = "V17-COMMUNICATIONS-PREVIEW-13B";
export const COMMUNICATIONS_PREVIEW_DATABASE = "v17_consolidated_preview_10b";
export const COMMUNICATIONS_PREVIEW_NEON_BRANCH = "br-mute-credit-ahxnvfx0";
const PREVIEW_MANIFEST = Object.freeze({ batch: COMMUNICATIONS_PREVIEW_BATCH, branch: "feature/v17-consolidated-preview", database: COMMUNICATIONS_PREVIEW_DATABASE, neonBranch: COMMUNICATIONS_PREVIEW_NEON_BRANCH, transport: "DISABLED", version: 1 });
function fail(code, status) { throw new CommunicationsError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
export function communicationsPreviewManifest() { const raw = canonical(PREVIEW_MANIFEST); return Object.freeze({ raw, sha256: createHash("sha256").update(raw, "utf8").digest("hex") }); }
function previewUrlAuthorized(raw) { try { const url = new URL(raw); return ["postgres:", "postgresql:"].includes(url.protocol) && decodeURIComponent(url.pathname.slice(1)) === COMMUNICATIONS_PREVIEW_DATABASE && url.searchParams.get("schema") === "osi" && !/fragrant-night|bitter-bush/i.test(url.hostname); } catch { return false; } }
export function resolveCommunicationsApiMode(env = process.env, req) {
  const mode = env.COMMUNICATIONS_API_MODE ?? "DISABLED";
  if (!Object.values(COMMUNICATIONS_API_MODES).includes(mode)) fail("COMMUNICATIONS_CONFIGURATION_INVALID", 503);
  if (mode === "DISABLED") fail("COMMUNICATIONS_DISABLED", 409);
  if (mode === "LOCAL_ONLY") { if (hasVercel(env) || !isRealLoopbackRequest(req)) fail("COMMUNICATIONS_CONFIGURATION_INVALID", 503); return mode; }
  const manifest = communicationsPreviewManifest();
  const checks = Object.freeze({
    PRODUCTION_API_DISABLED: productionApiEnabled === false,
    VERCEL_PREVIEW: env.VERCEL === "1" && env.VERCEL_ENV === "preview",
    PREVIEW_BRANCH: isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF),
    PREVIEW_BATCH: env.COMMUNICATIONS_PREVIEW_BATCH === COMMUNICATIONS_PREVIEW_BATCH,
    PREVIEW_MANIFEST: env.COMMUNICATIONS_PREVIEW_MANIFEST === manifest.raw,
    PREVIEW_MANIFEST_SHA256: env.COMMUNICATIONS_PREVIEW_MANIFEST_SHA256 === manifest.sha256,
    PREVIEW_NEON_BRANCH: env.COMMUNICATIONS_PREVIEW_NEON_BRANCH_ID === COMMUNICATIONS_PREVIEW_NEON_BRANCH,
    DATABASE_URL: previewUrlAuthorized(env.DATABASE_URL),
    DIRECT_URL: previewUrlAuthorized(env.DIRECT_URL),
    AUTH_LEGACY: env.MT01B_AUTH_MODE === "LEGACY",
    TENANT_SWITCH_DISABLED: env.MT01B_TENANT_SWITCH_ENABLED === "false",
    AUTH_V2_DISABLED: env.VITE_MT01B2_CLIENT_ENABLED === "false",
    CRM_RUNTIME_PREVIEW: env.CRM_PIPELINE_RUNTIME_MODE === "PREVIEW_REHEARSAL",
    HUB_PREVIEW: env.VITE_OSI_HUB_MODE === "PREVIEW_REHEARSAL",
    CRM_CLIENT_PREVIEW: env.VITE_CRM_PIPELINE_CLIENT_MODE === "PREVIEW_REHEARSAL",
    CRM_READ_PREVIEW: env.VITE_CRM_PIPELINE_READ_MODE === "PREVIEW_REHEARSAL",
    EXTERNAL_TRANSPORT_DISABLED: env.COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE === "DISABLED",
    EXTERNAL_WEBHOOK_DISABLED: env.COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE === "DISABLED",
    TRANSPORT_CAPABILITIES_DISABLED: Object.values(COMMUNICATION_TRANSPORT_CAPABILITIES).every((enabled) => enabled === false),
  });
  const failures = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
  if (failures.length) {
    if (env.VERCEL === "1") console.error("COMMUNICATIONS_PREVIEW_CONFIGURATION_REJECTED", { failures });
    fail("COMMUNICATIONS_CONFIGURATION_INVALID", 503);
  }
  return mode;
}
export async function assertCommunicationsPreviewDatabase(prisma, mode) { if (mode !== COMMUNICATIONS_API_MODES.PREVIEW_REHEARSAL) return; const [identity] = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch"); if (identity?.database !== COMMUNICATIONS_PREVIEW_DATABASE || identity?.branch !== COMMUNICATIONS_PREVIEW_NEON_BRANCH) fail("COMMUNICATIONS_CONFIGURATION_INVALID", 503); }
function header(req, name) { const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_m, dash, letter) => `${dash}${letter.toUpperCase()}`)]; return Array.isArray(value) ? null : value; }
function assertSameOrigin(req) { const origin = header(req, "origin"); if (origin === undefined) return; const host = header(req, "host"); const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http"); let parsed; try { parsed = new URL(origin); } catch { fail("COMMUNICATIONS_ORIGIN_FORBIDDEN", 403); } if (typeof host !== "string" || origin !== origin.trim() || host !== host.trim() || parsed.origin !== origin || origin !== `${protocol}://${host}`) fail("COMMUNICATIONS_ORIGIN_FORBIDDEN", 403); }
export function sendCommunicationsError(res, cause, head = false) { const known = cause instanceof CommunicationsError || cause instanceof CommercialTenancyError; const status = known ? cause.status : cause?.code === "P2002" || cause?.code === "P2034" ? 409 : 503; const error = known ? cause.code : status === 409 ? "COMMUNICATION_CONFLICT" : "COMMUNICATION_DATABASE_UNAVAILABLE"; return head ? res.status(status).end() : res.status(status).json({ ok: false, error }); }
export function prepareCommunicationsRequest(req, res, env = process.env) { setCrmPrivateHeaders(res); try { const mode = resolveCommunicationsApiMode(env, req); assertSameOrigin(req); return mode; } catch (error) { sendCommunicationsError(res, error, req.method === "HEAD"); return false; } }
export function createCommunicationsHandler({ env = process.env, prismaClient, methods, permission, execute, status = 200, resolveContext = resolveCrmPipelineContext } = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    const mode = prepareCommunicationsRequest(req, res, env); if (!mode) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    let stage = "SESSION";
    try {
      const context = await resolveContext(req, { env, prisma: prismaClient });
      const required = typeof permission === "function" ? permission(req.method === "HEAD" ? "GET" : req.method) : permission;
      if (!context.effectivePermissions?.includes(required) || context.deniedPermissions?.includes(required)) fail("COMMUNICATION_FORBIDDEN", 403);
      stage = "DATABASE_IDENTITY";
      await assertCommunicationsPreviewDatabase(prismaClient, mode);
      stage = "EXECUTE";
      const method = req.method === "HEAD" ? "GET" : req.method;
      const input = method === "GET" ? undefined : await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 96 * 1024 });
      const data = await execute({ req, context, input, prisma: prismaClient, method });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(typeof status === "function" ? status(method) : status).json({ ok: true, data });
    } catch (error) {
      if (!(error instanceof CommunicationsError) && env.VERCEL === "1") console.error("COMMUNICATIONS_PREVIEW_REQUEST_REJECTED", { stage, name: error?.name || "Error", code: /^P\d{4}$/u.test(error?.code || "") ? error.code : null });
      return sendCommunicationsError(res, error, req.method === "HEAD");
    }
  }, { handleOptions: false });
}
export function createTransportDisabledHandler() { return withPrivateApiHeaders((req, res) => { setCrmPrivateHeaders(res); return res.status(409).json({ ok: false, error: "COMMUNICATION_TRANSPORT_DISABLED" }); }, { handleOptions: false }); }
