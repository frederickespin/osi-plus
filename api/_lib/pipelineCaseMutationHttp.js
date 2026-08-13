import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import { mt01bAllowedOrigins } from "./authOrigin.js";
import {
  CRM_PIPELINE_MUTATION_MODES,
  assertCrmAuthorizationHeader,
  requireCrmPipelineMutation,
  resolveCrmPipelineContext,
  resolveCrmPipelineModes,
} from "./crmPipelineAccess.js";
import { JsonBodyError, methodNotAllowed, readJsonObject, setPrivateNoStore, withCommonHeaders } from "./http.js";
import { resolveCrmOwnerRefForAssignment } from "./crmOwnerCatalog.js";

export { CRM_PIPELINE_MUTATION_MODES };

const BODY_MAX_BYTES = 4 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
const CORS_ALLOWED_HEADERS = Object.freeze(["Authorization", "Content-Type", "Idempotency-Key"]);
const BROWSER_AUTHORITY_FIELDS = Object.freeze([
  "tenantId",
  "userId",
  "actorUserId",
  "actorMembershipId",
  "ownerUserId",
  "ownerMembershipId",
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
  "CRM_PIPELINE_OWNER_REF_INVALID",
  "CRM_PIPELINE_OWNER_REF_EXPIRED",
  "CRM_PIPELINE_OWNER_CATALOG_AMBIGUOUS",
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

export function resolveCrmPipelineMutationMode(env = process.env) {
  return resolveCrmPipelineModes(env).mutationMode;
}

export function requireCrmPipelineMutationsLocal(env = process.env) {
  return requireCrmPipelineMutation(env);
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

export function sendPipelineMutationError(res, error, { head = false } = {}) {
  const code = typeof error?.code === "string" ? error.code : "";
  let contract;
  if (DOMAIN_CODES.has(code)) {
    const status = Number.isInteger(error.status) ? error.status : 503;
    contract = { status, code, options: error };
  } else if (error instanceof CommercialTenancyError || error instanceof Mt01bAuthError || AUTH_CODES.has(code)) {
    const status = Number.isInteger(error.status) ? error.status : 401;
    contract = { status, code: code || "COMMERCIAL_AUTH_INVALID", options: {} };
  } else {
    contract = { status: 503, code: "CRM_PIPELINE_DATABASE_UNAVAILABLE", options: { recoverable: true } };
  }
  if (head) return res.status(contract.status).end();
  return sendError(res, contract.status, contract.code, contract.options);
}

function routeCaseId(req, routeAction) {
  const keys = Object.keys(req.query || {});
  if (keys.some((key) => key !== "id")) throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  const value = req.query?.id;
  const rawUrl = typeof req.url === "string" ? req.url.split("?", 1)[0] : null;
  const expectedPath = routeAction && rawUrl
    ? new RegExp(`^/api/crm/pipeline-cases/[^/]+/${routeAction}/?$`)
    : null;
  if (typeof value !== "string" || !CASE_ID.test(value) || value !== value.trim()
    || (rawUrl && (rawUrl.includes("%") || !expectedPath?.test(rawUrl)))) {
    throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  return value;
}

function rawHeaderCount(req, headerName) {
  if (!Array.isArray(req.rawHeaders)) return null;
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (String(req.rawHeaders[index]).toLowerCase() === headerName) count += 1;
  }
  return count;
}

function idempotencyKey(req) {
  const count = rawHeaderCount(req, "idempotency-key");
  const raw = req.headers?.["idempotency-key"] ?? req.headers?.["Idempotency-Key"];
  if (count !== null && count !== 1) throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  if (Array.isArray(raw) || typeof raw !== "string" || !IDEMPOTENCY_KEY.test(raw)) {
    throw new CommercialTenancyError("CRM_PIPELINE_COMMAND_INVALID", 400);
  }
  return raw;
}

function appendVary(res, field) {
  const current = typeof res.getHeader === "function" ? res.getHeader("Vary") : undefined;
  const values = String(current || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === field.toLowerCase())) values.push(field);
  res.setHeader("Vary", values.join(", "));
}

function requestOrigin(req) {
  const raw = req?.headers?.origin ?? req?.headers?.Origin;
  if (Array.isArray(raw) || typeof raw !== "string" || raw.length === 0 || raw !== raw.trim()) return null;
  try {
    const parsed = new URL(raw);
    return parsed.origin === raw ? parsed.origin : null;
  } catch {
    return null;
  }
}

function corsError(code = "CRM_PIPELINE_ORIGIN_FORBIDDEN", status = 403) {
  throw new CommercialTenancyError(code, status);
}

export function applyLocalCors(req, res, env, methods, { preflight = false } = {}) {
  appendVary(res, "Origin");
  const rawOrigin = req?.headers?.origin ?? req?.headers?.Origin;
  if (rawOrigin === undefined && !preflight) return;
  const origin = requestOrigin(req);
  if (!origin || !mt01bAllowedOrigins(env).has(origin)) corsError();
  if (preflight) {
    const requestedMethod = req?.headers?.["access-control-request-method"] ?? req?.headers?.["Access-Control-Request-Method"];
    if (typeof requestedMethod !== "string" || !methods.includes(requestedMethod) || requestedMethod === "OPTIONS") {
      corsError("CRM_PIPELINE_CORS_PREFLIGHT_INVALID", 400);
    }
    const requestedHeaders = req?.headers?.["access-control-request-headers"] ?? req?.headers?.["Access-Control-Request-Headers"];
    if (typeof requestedHeaders !== "string") corsError("CRM_PIPELINE_CORS_PREFLIGHT_INVALID", 400);
    const allowed = new Set(CORS_ALLOWED_HEADERS.map((value) => value.toLowerCase()));
    const values = requestedHeaders.split(",").map((value) => value.trim().toLowerCase());
    if (values.some((value) => !value || !allowed.has(value))) corsError("CRM_PIPELINE_CORS_PREFLIGHT_INVALID", 400);
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS.join(", "));
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
    owner: receipt.resultingOwnerMembershipId ? Object.freeze({ assigned: true }) : null,
    replayed: receipt.replayed === true,
  });
}

function createMutationHandler({ execute, allowedBodyKeys, routeAction, transformCommand, env = process.env, resolveContext = resolveCrmPipelineContext, prismaClient } = {}) {
  return withCommonHeaders(async (req, res) => {
    setPrivateNoStore(res);
    try {
      requireCrmPipelineMutationsLocal(env);
    } catch (error) {
      return sendPipelineMutationError(res, error);
    }
    try {
      if (req.method === "OPTIONS") {
        applyLocalCors(req, res, env, ["POST", "OPTIONS"], { preflight: true });
        return res.status(204).end();
      }
      applyLocalCors(req, res, env, ["POST", "OPTIONS"]);
    } catch (error) {
      return sendPipelineMutationError(res, error);
    }
    if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);

    let context;
    try {
      assertCrmAuthorizationHeader(req);
      context = await resolveContext(req, { prisma: prismaClient, env });
    } catch (error) {
      return sendPipelineMutationError(res, error);
    }

    try {
      const caseId = routeCaseId(req, routeAction);
      const requestId = idempotencyKey(req);
      const body = exactBody(await readJsonObject(req, { maxBytes: BODY_MAX_BYTES, requireNonEmptyObject: true }), allowedBodyKeys);
      const publicCommand = { caseId, requestId, ...body };
      const command = transformCommand
        ? await transformCommand(context, publicCommand, { prisma: prismaClient, env })
        : publicCommand;
      const receipt = await execute(context, command);
      return res.status(200).json({ ok: true, command: commandResponse(receipt) });
    } catch (error) {
      if (error instanceof JsonBodyError) throw error;
      return sendPipelineMutationError(res, error);
    }
  }, { handleOptions: false, cors: false });
}

export function createTransitionHandler(options) {
  return createMutationHandler({ ...options, routeAction: "transition", allowedBodyKeys: new Set(["expectedVersion", "toStatus", "reasonCode", "evidence"]) });
}

export function createAssignOwnerHandler(options) {
  const resolveOwnerRef = options?.resolveOwnerRef ?? resolveCrmOwnerRefForAssignment;
  return createMutationHandler({
    ...options,
    routeAction: "assign-owner",
    allowedBodyKeys: new Set(["expectedVersion", "ownerRef"]),
    transformCommand: async (context, command, dependencies) => ({
      caseId: command.caseId,
      requestId: command.requestId,
      expectedVersion: command.expectedVersion,
      ownerMembershipId: await resolveOwnerRef(context, command.ownerRef, dependencies),
    }),
  });
}

export function createUnassignOwnerHandler(options) {
  return createMutationHandler({ ...options, routeAction: "unassign-owner", allowedBodyKeys: new Set(["expectedVersion"]) });
}

export function createAllowedTransitionsHandler({ execute, env = process.env, resolveContext = resolveCrmPipelineContext, requireReadMode, prismaClient } = {}) {
  return withCommonHeaders(async (req, res) => {
    setPrivateNoStore(res);
    try {
      requireCrmPipelineMutationsLocal(env);
      requireReadMode(env);
    } catch (error) {
      return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
    }
    try {
      if (req.method === "OPTIONS") {
        applyLocalCors(req, res, env, ["GET", "HEAD", "OPTIONS"], { preflight: true });
        return res.status(204).end();
      }
      applyLocalCors(req, res, env, ["GET", "HEAD", "OPTIONS"]);
    } catch (error) {
      return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
    }
    if (!["GET", "HEAD"].includes(req.method)) return methodNotAllowed(res, ["GET", "HEAD", "OPTIONS"]);
    try {
      assertCrmAuthorizationHeader(req);
      const context = await resolveContext(req, { prisma: prismaClient, env });
      const result = await execute(context, routeCaseId(req, "allowed-transitions"));
      const response = {
        ok: true,
        case: {
          caseId: result.caseId,
          version: result.version,
          status: result.status,
          transitions: result.transitions.map(({ toStatus, evidenceType }) => ({ toStatus, evidenceType })),
        },
      };
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).json(response);
    } catch (error) {
      return sendPipelineMutationError(res, error, { head: req.method === "HEAD" });
    }
  }, { handleOptions: false, cors: false });
}
