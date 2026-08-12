import { CommercialTenancyError, resolveCommercialContext } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import { JsonBodyError, methodNotAllowed, readJsonObject, setPrivateNoStore, withCommonHeaders } from "./http.js";

export const CRM_PIPELINE_MUTATION_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
});

const BODY_MAX_BYTES = 4 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const BROWSER_AUTHORITY_FIELDS = Object.freeze([
  "tenantId",
  "userId",
  "actorUserId",
  "actorMembershipId",
  "ownerUserId",
  "ownerId",
  "role",
  "permissions",
  "requestId",
  "resultingVersion",
  "payloadHash",
  "statusChangedAt",
  "timestamps",
]);
const DOMAIN_CODES = new Set([
  "CRM_PIPELINE_COMMAND_INVALID",
  "CRM_PIPELINE_PERMISSION_FORBIDDEN",
  "CRM_PIPELINE_RESOURCE_NOT_FOUND",
  "CRM_PIPELINE_STATE_INVALID",
  "CRM_PIPELINE_VERSION_CONFLICT",
  "CRM_PIPELINE_IDEMPOTENCY_CONFLICT",
  "CRM_PIPELINE_OWNER_INELIGIBLE",
  "CRM_PIPELINE_EVIDENCE_REQUIRED",
  "CRM_PIPELINE_EVIDENCE_INVALID",
  "CRM_PIPELINE_COMMAND_IN_PROGRESS",
  "CRM_PIPELINE_DATABASE_UNAVAILABLE",
]);
const AUTH_CODES = new Set([
  "COMMERCIAL_AUTH_REQUIRED",
  "COMMERCIAL_AUTH_INVALID",
  "COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE",
  "AUTH_TOKEN_INVALID",
  "AUTH_DATABASE_UNAVAILABLE",
]);

function hasVercelEnvironment(env) {
  return Object.keys(env || {}).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"));
}

export function resolveCrmPipelineMutationMode(env = process.env) {
  const configured = env.CRM_PIPELINE_MUTATION_MODE;
  const mode = configured === undefined ? CRM_PIPELINE_MUTATION_MODES.DISABLED : configured;
  if (typeof mode !== "string" || !Object.values(CRM_PIPELINE_MUTATION_MODES).includes(mode)) {
    throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
  }
  if (mode === CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY && hasVercelEnvironment(env)) {
    throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
  }
  return mode;
}

export function requireCrmPipelineMutationsLocal(env = process.env) {
  const mode = resolveCrmPipelineMutationMode(env);
  if (mode !== CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY) {
    throw new CommercialTenancyError("CRM_PIPELINE_MUTATIONS_DISABLED", 409);
  }
  return mode;
}

function sendError(res, status, code, options = {}) {
  return res.status(status).json({
    ok: false,
    code,
    error: code,
    ...(options.recoverable === true ? { recoverable: true } : {}),
    ...(Number.isSafeInteger(options.retryAfterMs) ? { retryAfterMs: options.retryAfterMs } : {}),
  });
}

export function sendPipelineMutationError(res, error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (DOMAIN_CODES.has(code)) {
    const status = Number.isInteger(error.status) ? error.status : 503;
    return sendError(res, status, code, error);
  }
  if (error instanceof CommercialTenancyError || error instanceof Mt01bAuthError || AUTH_CODES.has(code)) {
    const status = Number.isInteger(error.status) ? error.status : 401;
    return sendError(res, status, code || "COMMERCIAL_AUTH_INVALID");
  }
  return sendError(res, 503, "CRM_PIPELINE_DATABASE_UNAVAILABLE", { recoverable: true });
}

function routeCaseId(req) {
  const keys = Object.keys(req.query || {});
  if (keys.some((key) => key !== "id")) throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  const value = req.query?.id;
  if (typeof value !== "string" || value.length < 1 || value.length > 191 || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  return value;
}

function idempotencyHeaderCount(req) {
  if (!Array.isArray(req.rawHeaders)) return null;
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (String(req.rawHeaders[index]).toLowerCase() === "idempotency-key") count += 1;
  }
  return count;
}

function idempotencyKey(req) {
  const count = idempotencyHeaderCount(req);
  const raw = req.headers?.["idempotency-key"] ?? req.headers?.["Idempotency-Key"];
  if (count !== null && count !== 1) throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  if (Array.isArray(raw) || typeof raw !== "string" || !IDEMPOTENCY_KEY.test(raw)) {
    throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  return raw;
}

function exactBody(body, allowed) {
  for (const key of Object.keys(body)) {
    if (BROWSER_AUTHORITY_FIELDS.includes(key)) {
      throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
    }
    if (!allowed.has(key)) throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  return body;
}

function commandResponse(receipt) {
  return Object.freeze({
    caseId: receipt.caseId,
    commandType: receipt.commandType,
    previousVersion: receipt.previousVersion,
    resultingVersion: receipt.resultingVersion,
    previousStatus: receipt.previousStatus,
    resultingStatus: receipt.resultingStatus,
    owner: receipt.resultingOwnerMembershipId ? Object.freeze({ membershipId: receipt.resultingOwnerMembershipId }) : null,
    replayed: receipt.replayed === true,
  });
}

function createMutationHandler({ execute, allowedBodyKeys, env = process.env, resolveContext = resolveCommercialContext, prismaClient } = {}) {
  return withCommonHeaders(async (req, res) => {
    setPrivateNoStore(res);
    try {
      requireCrmPipelineMutationsLocal(env);
    } catch (error) {
      return sendPipelineMutationError(res, error);
    }
    if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

    let context;
    try {
      context = await resolveContext(req, { prisma: prismaClient });
    } catch (error) {
      return sendPipelineMutationError(res, error);
    }

    try {
      const caseId = routeCaseId(req);
      const requestId = idempotencyKey(req);
      const body = exactBody(await readJsonObject(req, { maxBytes: BODY_MAX_BYTES, requireNonEmptyObject: true }), allowedBodyKeys);
      const receipt = await execute(context, { caseId, requestId, ...body });
      return res.status(200).json({ ok: true, command: commandResponse(receipt) });
    } catch (error) {
      if (error instanceof JsonBodyError) throw error;
      return sendPipelineMutationError(res, error);
    }
  }, { handleOptions: false });
}

export function createTransitionHandler(options) {
  return createMutationHandler({ ...options, allowedBodyKeys: new Set(["expectedVersion", "toStatus", "reasonCode", "evidence"]) });
}

export function createAssignOwnerHandler(options) {
  return createMutationHandler({ ...options, allowedBodyKeys: new Set(["expectedVersion", "ownerMembershipId"]) });
}

export function createUnassignOwnerHandler(options) {
  return createMutationHandler({ ...options, allowedBodyKeys: new Set(["expectedVersion"]) });
}

export function createAllowedTransitionsHandler({ execute, env = process.env, resolveContext = resolveCommercialContext, requireReadMode, prismaClient } = {}) {
  return withCommonHeaders(async (req, res) => {
    setPrivateNoStore(res);
    try {
      requireCrmPipelineMutationsLocal(env);
      requireReadMode(env);
    } catch (error) {
      return sendPipelineMutationError(res, error);
    }
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    try {
      const context = await resolveContext(req, { prisma: prismaClient });
      const result = await execute(context, routeCaseId(req));
      return res.status(200).json({
        ok: true,
        case: {
          caseId: result.caseId,
          version: result.version,
          status: result.status,
          transitions: result.transitions.map(({ toStatus, evidenceType }) => ({ toStatus, evidenceType })),
        },
      });
    } catch (error) {
      return sendPipelineMutationError(res, error);
    }
  }, { handleOptions: false });
}
