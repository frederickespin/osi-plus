import { assertCommercialDatabaseIdentity, CommercialTenancyError, sendCommercialTenancyError } from "./commercialTenancyWrite.js";
import { requireCrmPipelinePermissionResponse } from "./crmPipelineAccess.js";
import { CRM_PIPELINE_PERMISSION, requireCrmPipelineReadOnly } from "./crmPipelineRead.js";
import { methodNotAllowed, setPrivateNoStore, withCommonHeaders } from "./http.js";
import { applyLocalCors } from "./pipelineCaseMutationHttp.js";
import { crm01c1aPreviewOrigin } from "./crmPreviewRehearsal.js";

function sendReadError(res, error, { head = false } = {}) {
  if (!head) return sendCommercialTenancyError(res, error);
  const status = error instanceof CommercialTenancyError && Number.isInteger(error.status)
    ? error.status
    : 503;
  return res.status(status).end();
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
    setPrivateNoStore(res);
    try {
      requireCrmPipelineReadOnly(env);
    } catch (error) {
      return sendReadError(res, error, { head: req.method === "HEAD" });
    }

    try {
      await assertCommercialDatabaseIdentity(req, prismaClient, env);
    } catch (error) {
      return sendReadError(res, error, { head: req.method === "HEAD" });
    }

    if (crm01c1aPreviewOrigin(env)) {
      try {
        if (req.method === "OPTIONS") {
          applyLocalCors(req, res, env, ["GET", "OPTIONS"], { preflight: true });
          return res.status(204).end();
        }
        applyLocalCors(req, res, env, ["GET", "OPTIONS"]);
      } catch (error) {
        return sendReadError(res, error, { head: req.method === "HEAD" });
      }
    }

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

    const context = await requirePermission(req, res, CRM_PIPELINE_PERMISSION, { prisma: prismaClient, env });
    if (!context) return;
    try {
      const result = await execute({ req, context, prisma: prismaClient, env });
      return res.status(200).json(response(result));
    } catch (error) {
      return sendReadError(res, error, { head: req.method === "HEAD" });
    }
  }, { handleOptions: false, cors: false });
}
