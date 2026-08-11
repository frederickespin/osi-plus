import { prisma } from "../../_lib/db.js";
import { setPrivateNoStore, methodNotAllowed, withCommonHeaders } from "../../_lib/http.js";
import { requireCommercialPermission, sendCommercialTenancyError } from "../../_lib/commercialTenancyWrite.js";
import {
  CRM_PIPELINE_PERMISSION,
  listCrmPipelineCases,
  parsePipelineListQuery,
  requireCrmPipelineReadOnly,
} from "../../_lib/crmPipelineRead.js";

export function createPipelineCasesListHandler({
  prismaClient = prisma,
  requirePermission = requireCommercialPermission,
} = {}) {
  return withCommonHeaders(async (req, res) => {
    setPrivateNoStore(res);
    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    try {
      requireCrmPipelineReadOnly();
    } catch (error) {
      return sendCommercialTenancyError(res, error);
    }
    const context = await requirePermission(req, res, CRM_PIPELINE_PERMISSION, { prisma: prismaClient });
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
  });
}

export default createPipelineCasesListHandler();
