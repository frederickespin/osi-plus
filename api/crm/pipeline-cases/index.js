import { prisma } from "../../_lib/db.js";
import { setPrivateNoStore, methodNotAllowed, withCommonHeaders } from "../../_lib/http.js";
import { sendCommercialTenancyError } from "../../_lib/commercialTenancyWrite.js";
import { requireCrmPipelinePermissionResponse } from "../../_lib/crmPipelineAccess.js";
import {
  CRM_PIPELINE_PERMISSION,
  listCrmPipelineCases,
  parsePipelineListQuery,
  requireCrmPipelineReadOnly,
} from "../../_lib/crmPipelineRead.js";

export function createPipelineCasesListHandler({
  prismaClient = prisma,
  requirePermission = requireCrmPipelinePermissionResponse,
  env = process.env,
} = {}) {
  return withCommonHeaders(async (req, res) => {
    setPrivateNoStore(res);
    try {
      requireCrmPipelineReadOnly(env);
    } catch (error) {
      return sendCommercialTenancyError(res, error);
    }
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    const context = await requirePermission(req, res, CRM_PIPELINE_PERMISSION, { prisma: prismaClient, env });
    if (!context) return;
    try {
      const result = await listCrmPipelineCases(prismaClient, {
        tenantId: context.tenantId,
        filters: parsePipelineListQuery(req.query),
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return sendCommercialTenancyError(res, error);
    }
  }, { cors: false });
}

export default createPipelineCasesListHandler();
