import { CommercialTenancyError, sendCommercialTenancyError } from "./commercialTenancyWrite.js";
import { requireCrmPipelinePermissionResponse } from "./crmPipelineAccess.js";
import { CRM_PIPELINE_PERMISSION, requireCrmPipelineReadOnly } from "./crmPipelineRead.js";
import { methodNotAllowed, withCommonHeaders } from "./http.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";

function sendReadError(res, error, { head = false } = {}) {
  if (!head) return sendCommercialTenancyError(res, error);
  const status = error instanceof CommercialTenancyError && Number.isInteger(error.status)
    ? error.status
    : 503;
  return res.status(status).end();
}

function singleHeader(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`)];
  return Array.isArray(value) ? null : value;
}

function assertSameOrigin(req) {
  const rawOrigin = singleHeader(req, "origin");
  if (rawOrigin === undefined) return;
  const host = singleHeader(req, "host");
  const forwardedProto = singleHeader(req, "x-forwarded-proto");
  const protocol = forwardedProto ?? (req?.socket?.encrypted ? "https" : "http");
  if (typeof rawOrigin !== "string" || rawOrigin !== rawOrigin.trim()
    || typeof host !== "string" || host !== host.trim()
    || !["http", "https"].includes(protocol)) {
    throw new CommercialTenancyError("CRM_PIPELINE_ORIGIN_FORBIDDEN", 403);
  }
  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new CommercialTenancyError("CRM_PIPELINE_ORIGIN_FORBIDDEN", 403);
  }
  if (origin.origin !== rawOrigin || rawOrigin !== `${protocol}://${host}`) {
    throw new CommercialTenancyError("CRM_PIPELINE_ORIGIN_FORBIDDEN", 403);
  }
}

/**
 * Orden HTTP canónico de las lecturas CRM:
 * headers privados -> configuración/gate -> método -> auth -> consulta.
 *
 * OPTIONS se conserva en 204 cuando la lectura está habilitada, pero nunca
 * puede interceptar una configuración DISABLED o inválida antes del gate.
 */
export function createCrmPipelineReadHandler({
  env = process.env,
  prismaClient,
  requirePermission = requireCrmPipelinePermissionResponse,
  execute,
  response,
} = {}) {
  return withCommonHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    try {
      requireCrmPipelineReadOnly(env);
      assertSameOrigin(req);
    } catch (error) {
      return sendReadError(res, error, { head: req.method === "HEAD" });
    }

    if (req.method === "OPTIONS") return res.status(204).end();
    if (!["GET", "HEAD"].includes(req.method)) return methodNotAllowed(res, ["GET", "HEAD"]);

    const context = await requirePermission(req, res, CRM_PIPELINE_PERMISSION, { prisma: prismaClient, env });
    if (!context) return;
    try {
      const result = await execute({ req, context, prisma: prismaClient, env });
      if (req.method === "HEAD") return res.status(200).end();
      return res.status(200).json(response(result));
    } catch (error) {
      return sendReadError(res, error, { head: req.method === "HEAD" });
    }
  }, { handleOptions: false, cors: false });
}
