import { prisma } from "../../_lib/db.js";
import { setPrivateNoStore, methodNotAllowed, withCommonHeaders } from "../../_lib/http.js";
import { requireCommercialPermission, sendCommercialTenancyError } from "../../_lib/commercialTenancyWrite.js";
import {
  CRM_PIPELINE_PERMISSION,
  findCrmPipelineCase,
  requireCrmPipelineReadOnly,
} from "../../_lib/crmPipelineRead.js";

export function createPipelineCaseDetailHandler({
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
      const data = await findCrmPipelineCase(prismaClient, {
        tenantId: context.tenantId,
        caseId: req.query?.id,
      });
      return res.status(200).json({ ok: true, data });
    } catch (error) {
      return sendCommercialTenancyError(res, error);
    }
  }, { cors: false });
}

export default createPipelineCaseDetailHandler();
