import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { requireCrmPipelineExplicitlyDisabled, resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { CrmIcpV2Error } from "./crmIcpV2Domain.js";
import { CrmIcpV2ApiError } from "./crmIcpV2ApiDomain.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { isExactV17CommercialCrmPreviewServerEnvironment } from "../../shared/v17CommercialCrmPreview.js";

export const CRM_ICP_V2_API_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL",
});

export const CRM_ICP_V2_API_PREVIEW_BRANCH = "feature/v17-crm-icp-api-05b1";
export const CRM_ICP_V2_API_PREVIEW_BATCH = "V17-CRM-ICP-05B1-PREVIEW";
export const CRM_ICP_V2_UI_PREVIEW_BRANCH = "feature/v17-crm-icp-ui-05c1";
export const CRM_ICP_V2_UI_PREVIEW_BATCH = "V17-CRM-ICP-05C1-PREVIEW";

function apiError(code, status) {
  return new CrmIcpV2ApiError(code, status);
}

function hasVercelSignal(env) {
  return Object.keys(env || {}).some((key) => key.toUpperCase().startsWith("VERCEL"));
}

export function resolveCrmIcpV2ApiMode(env = process.env, req = undefined) {
  const mode = env.CRM_ICP_V2_API_MODE ?? CRM_ICP_V2_API_MODES.DISABLED;
  if (!Object.values(CRM_ICP_V2_API_MODES).includes(mode)) {
    throw apiError("CRM_ICP_V2_API_CONFIGURATION_INVALID", 503);
  }
  if (mode === CRM_ICP_V2_API_MODES.DISABLED) {
    throw apiError("CRM_ICP_V2_API_DISABLED", 409);
  }
  if (mode === CRM_ICP_V2_API_MODES.LOCAL_ONLY) {
    if (hasVercelSignal(env) || !isRealLoopbackRequest(req)) {
      throw apiError("CRM_ICP_V2_API_CONFIGURATION_INVALID", 503);
    }
    return mode;
  }
  let historicalCrmDisabled = false;
  try {
    requireCrmPipelineExplicitlyDisabled(env);
    historicalCrmDisabled = true;
  } catch {
    historicalCrmDisabled = false;
  }
  const apiOnlyPreview = env.VERCEL === "1"
    && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === CRM_ICP_V2_API_PREVIEW_BRANCH
    && env.CRM_ICP_V2_API_BATCH === CRM_ICP_V2_API_PREVIEW_BATCH
    && historicalCrmDisabled
    && env.COMMERCIAL_TENANCY_MUTATION_MODE === "DISABLED"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false"
    && env.VITE_MT01B2_CLIENT_ENABLED === "false"
    && ["LEGACY", "MEMBERSHIP_ONLY"].includes(env.MT01B_AUTH_MODE);
  const uiPreview = env.VERCEL === "1"
    && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === CRM_ICP_V2_UI_PREVIEW_BRANCH
    && env.CRM_ICP_V2_API_BATCH === CRM_ICP_V2_UI_PREVIEW_BATCH
    && env.VITE_CRM_ICP_V2_UI_MODE === "PREVIEW_REHEARSAL"
    && env.VITE_CRM_ICP_V2_UI_BATCH === CRM_ICP_V2_UI_PREVIEW_BATCH
    && isExactV17CommercialCrmPreviewServerEnvironment(env)
    && env.CRM_PIPELINE_MUTATION_MODE === "DISABLED"
    && env.COMMERCIAL_TENANCY_MUTATION_MODE === "DISABLED";
  const exactPreview = apiOnlyPreview || uiPreview;
  if (!exactPreview) throw apiError("CRM_ICP_V2_API_CONFIGURATION_INVALID", 503);
  return mode;
}

function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)];
  return Array.isArray(value) ? null : value;
}

function assertSameOrigin(req) {
  const rawOrigin = header(req, "origin");
  if (rawOrigin === undefined) return;
  const host = header(req, "host");
  const protocol = header(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http");
  if (typeof rawOrigin !== "string" || rawOrigin !== rawOrigin.trim()
    || typeof host !== "string" || host !== host.trim() || !["http", "https"].includes(protocol)) {
    throw apiError("CRM_ICP_V2_ORIGIN_FORBIDDEN", 403);
  }
  let parsed;
  try { parsed = new URL(rawOrigin); } catch { throw apiError("CRM_ICP_V2_ORIGIN_FORBIDDEN", 403); }
  if (parsed.origin !== rawOrigin || rawOrigin !== `${protocol}://${host}`) {
    throw apiError("CRM_ICP_V2_ORIGIN_FORBIDDEN", 403);
  }
}

function safeData(error) {
  const fingerprint = error?.safeData?.matchFingerprint;
  return /^[0-9a-f]{64}$/.test(String(fingerprint || ""))
    ? { matchFingerprint: fingerprint }
    : null;
}

function sendError(res, error, { head = false } = {}) {
  const known = error instanceof CrmIcpV2Error || error instanceof CommercialTenancyError;
  const status = known && Number.isInteger(error.status) ? error.status : 503;
  const code = known ? String(error.code) : "CRM_ICP_DATABASE_UNAVAILABLE";
  if (head) return res.status(status).end();
  const data = safeData(error);
  return res.status(status).json({ ok: false, error: code, ...(data ? { data } : {}) });
}

function createHandler({
  env = process.env,
  prismaClient,
  method,
  execute,
  response,
  successStatus = 200,
  resolveContext = resolveCrmPipelineContext,
  body = false,
} = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    try {
      resolveCrmIcpV2ApiMode(env, req);
      assertSameOrigin(req);
    } catch (error) {
      return sendError(res, error, { head: req.method === "HEAD" });
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    const allowed = method === "GET" ? ["GET", "HEAD"] : [method];
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);
    try {
      const context = await resolveContext(req, { prisma: prismaClient, env });
      const input = body
        ? await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 64 * 1024 })
        : undefined;
      const result = await execute({ req, context, input, prisma: prismaClient, env });
      if (req.method === "HEAD") return res.status(successStatus).end();
      return res.status(successStatus).json(response(result));
    } catch (error) {
      if (error?.name === "JsonBodyError") throw error;
      return sendError(res, error, { head: req.method === "HEAD" });
    }
  }, { handleOptions: false });
}

export function createCrmIcpV2CreateHandler(options = {}) {
  return createHandler({
    ...options,
    method: "POST",
    body: true,
    successStatus: 201,
    response: (result) => ({
      ok: true,
      data: {
        caseRef: result.case.caseRef,
        version: result.case.version,
        routeRevision: result.case.route.revision,
        clientRef: result.case.client.clientRef,
      },
      replayed: result.replayed,
    }),
  });
}

export function createCrmIcpClientSearchHandler(options = {}) {
  return createHandler({
    ...options,
    method: "POST",
    body: true,
    response: (result) => ({ ok: true, ...result }),
  });
}

export function createCrmIcpV2DetailHandler(options = {}) {
  return createHandler({
    ...options,
    method: "GET",
    response: (result) => ({ ok: true, data: result }),
  });
}
