import { createHash } from "node:crypto";
import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { ClientTemporaryAccessError } from "./clientTemporaryAccessContract.js";
import { COMMUNICATION_TRANSPORT_CAPABILITIES } from "./communicationsTransport.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const productionApiEnabled = false;
export const CLIENT_TEMPORARY_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const CLIENT_TEMPORARY_PREVIEW_BATCH = "V17-CLIENT-PORTAL-PREVIEW-16B";
export const CLIENT_TEMPORARY_PREVIEW_DATABASE = "v17_consolidated_preview_10b";
export const CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH = "br-mute-credit-ahxnvfx0";
export const CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE = "SURVEY_EPHEMERAL_PREVIEW";
export const CLIENT_TEMPORARY_PREVIEW_STORAGE_ROOT = "/tmp/osi-plus-v17-survey-preview";
const PREVIEW_MANIFEST = Object.freeze({ auth: "LEGACY", authV2: "DISABLED", batch: CLIENT_TEMPORARY_PREVIEW_BATCH, branch: "feature/v17-consolidated-preview", database: CLIENT_TEMPORARY_PREVIEW_DATABASE, externalTransport: "DISABLED", neonBranch: CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH, productionApiEnabled: false, storage: CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE, version: 1 });

function fail(code, status) { throw new ClientTemporaryAccessError(code, status); }
function hasVercel(env) { return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL")); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
export function clientTemporaryPreviewManifest() { const raw = canonical(PREVIEW_MANIFEST); return Object.freeze({ raw, sha256: createHash("sha256").update(raw, "utf8").digest("hex") }); }
function previewUrlAuthorized(raw) { try { const url = new URL(raw); return ["postgres:", "postgresql:"].includes(url.protocol) && decodeURIComponent(url.pathname.slice(1)) === CLIENT_TEMPORARY_PREVIEW_DATABASE && url.searchParams.get("schema") === "osi" && !/fragrant-night|bitter-bush/i.test(url.hostname); } catch { return false; } }
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
  if (mode === "LOCAL_ONLY") {
    if (productionApiEnabled !== false || hasVercel(env) || !isRealLoopbackRequest(req)) fail("CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const manifest = clientTemporaryPreviewManifest();
  const checks = Object.freeze({
    PRODUCTION_API_DISABLED: productionApiEnabled === false,
    VERCEL_PREVIEW: env.VERCEL === "1" && env.VERCEL_ENV === "preview",
    PREVIEW_BRANCH: isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF),
    PREVIEW_BATCH: env.CLIENT_TEMPORARY_PREVIEW_BATCH === CLIENT_TEMPORARY_PREVIEW_BATCH,
    PREVIEW_MANIFEST: env.CLIENT_TEMPORARY_PREVIEW_MANIFEST === manifest.raw,
    PREVIEW_MANIFEST_SHA256: env.CLIENT_TEMPORARY_PREVIEW_MANIFEST_SHA256 === manifest.sha256,
    PREVIEW_NEON_BRANCH: env.CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH_ID === CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH,
    DATABASE_URL: previewUrlAuthorized(env.DATABASE_URL),
    DIRECT_URL: previewUrlAuthorized(env.DIRECT_URL),
    AUTH_LEGACY: env.MT01B_AUTH_MODE === "LEGACY",
    TENANT_SWITCH_DISABLED: env.MT01B_TENANT_SWITCH_ENABLED === "false",
    AUTH_V2_DISABLED: env.VITE_MT01B2_CLIENT_ENABLED === "false",
    HUB_PREVIEW: env.VITE_OSI_HUB_MODE === "PREVIEW_REHEARSAL",
    CRM_CLIENT_PREVIEW: env.VITE_CRM_PIPELINE_CLIENT_MODE === "PREVIEW_REHEARSAL",
    CRM_READ_PREVIEW: env.VITE_CRM_PIPELINE_READ_MODE === "PREVIEW_REHEARSAL",
    CRM_RUNTIME_PREVIEW: env.CRM_PIPELINE_RUNTIME_MODE === "PREVIEW_REHEARSAL",
    EXTERNAL_TRANSPORT_DISABLED: env.COMMUNICATIONS_EXTERNAL_TRANSPORT_MODE === "DISABLED",
    EXTERNAL_WEBHOOK_DISABLED: env.COMMUNICATIONS_EXTERNAL_WEBHOOK_MODE === "DISABLED",
    TRANSPORT_CAPABILITIES_DISABLED: Object.values(COMMUNICATION_TRANSPORT_CAPABILITIES).every((enabled) => enabled === false),
    STORAGE_MODE: env.CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE === CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE,
    STORAGE_ROOT: env.CRM_SURVEY_LOCAL_STORAGE_ROOT === CLIENT_TEMPORARY_PREVIEW_STORAGE_ROOT,
  });
  const failures = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
  if (failures.length) {
    if (env.VERCEL === "1") console.error("CLIENT_TEMPORARY_PREVIEW_CONFIGURATION_REJECTED", { failures });
    fail("CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
  }
  return mode;
}

export async function assertClientTemporaryPreviewDatabase(prisma, mode) {
  if (mode !== CLIENT_TEMPORARY_API_MODES.PREVIEW_REHEARSAL) return;
  const [identity] = await prisma.$queryRawUnsafe("SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch");
  if (identity?.database !== CLIENT_TEMPORARY_PREVIEW_DATABASE || identity?.branch !== CLIENT_TEMPORARY_PREVIEW_NEON_BRANCH) fail("CLIENT_TEMPORARY_CONFIGURATION_INVALID", 503);
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
    const mode = prepareClientTemporaryRequest(req, res, env); if (!mode) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = methods.includes("GET") ? [...new Set([...methods, "HEAD"])] : methods;
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      await assertClientTemporaryPreviewDatabase(prismaClient, mode);
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
    const mode = prepareClientTemporaryRequest(req, res, env); if (!mode) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    if (!methods.includes(req.method)) return methodNotAllowed(res, methods);
    try {
      await assertClientTemporaryPreviewDatabase(prismaClient, mode);
      const token = clientTemporaryTokenFromRequest(req);
      const input = await readJsonObject(req, { required: true, requireNonEmptyObject: false, maxBytes });
      const value = await execute({ req, accessRef: req.query?.accessRef, token, input, prisma: prismaClient });
      return res.status(200).json({ ok: true, data: value });
    } catch (error) { return sendClientTemporaryError(res, error); }
  }, { handleOptions: false });
}
