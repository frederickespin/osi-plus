import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import {
  CRM_PIPELINE_MUTATION_MODES,
  requireCrmPipelineMutation,
  resolveCrmPipelineContext,
} from "./crmPipelineAccess.js";
import { CrmCaseMutationError } from "./crmCaseMutationDomain.js";
import { methodNotAllowed, readJsonObject, withCommonHeaders } from "./http.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";

function single(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)];
  return Array.isArray(value) ? null : value;
}
function sameOrigin(req) {
  const raw = single(req, "origin");
  if (raw === undefined) return;
  const host = single(req, "host");
  const protocol = single(req, "x-forwarded-proto") ?? (req?.socket?.encrypted ? "https" : "http");
  if (typeof raw !== "string" || raw !== `${protocol}://${host}`) {
    throw new CrmCaseMutationError("CRM_PIPELINE_ORIGIN_FORBIDDEN", 403);
  }
}
function gate(env) {
  const mode = requireCrmPipelineMutation(env);
  if (mode !== CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY) {
    throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
  }
}
function send(res, error, head = false) {
  const status = Number.isInteger(error?.status) ? error.status : 503;
  const code = error instanceof CrmCaseMutationError || error instanceof CommercialTenancyError
    ? error.code
    : "CRM_PIPELINE_DATABASE_UNAVAILABLE";
  if (head) return res.status(status).end();
  return res.status(status).json({ ok: false, error: code });
}
function accessControlMethod(req) {
  const value = single(req, "access-control-request-method");
  return typeof value === "string" ? value : "";
}

export function isMutationPreflight(req, method) {
  return req?.method === "OPTIONS" && accessControlMethod(req) === method;
}

export function createCrmCaseMutationHandler({
  env = process.env,
  prismaClient,
  method,
  execute,
  status = 200,
} = {}) {
  return withCommonHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    try {
      // Configuration is deliberately first: no auth, body or Prisma access can
      // happen while case mutations are disabled or outside loopback.
      gate(env);
      sameOrigin(req);
    } catch (error) {
      return send(res, error, req.method === "HEAD");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== method) return methodNotAllowed(res, [method]);
    try {
      const context = await resolveCrmPipelineContext(req, { prisma: prismaClient, env });
      const body = await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 32 * 1024 });
      const result = await execute({ req, context, body, prisma: prismaClient });
      return res.status(status).json({
        ok: true,
        data: { caseRef: result.case.caseRef, version: result.case.version },
        replayed: result.replayed,
      });
    } catch (error) {
      if (error?.name === "JsonBodyError") throw error;
      return send(res, error);
    }
  }, { handleOptions: false, cors: false });
}
