import { prisma } from "../../_lib/db.js";
import { setPrivateNoStore, methodNotAllowed, withCommonHeaders } from "../../_lib/http.js";
import { requireCommercialPermission, sendCommercialTenancyError } from "../../_lib/commercialTenancyWrite.js";
import {
  CRM_PIPELINE_PERMISSION,
  findCrmPipelineCase,
  requireCrmPipelineReadOnly,
} from "../../_lib/crmPipelineRead.js";

export default withCommonHeaders(async (req, res) => {
  setPrivateNoStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    requireCrmPipelineReadOnly();
  } catch (error) {
    return sendCommercialTenancyError(res, error);
  }
  const context = await requireCommercialPermission(req, res, CRM_PIPELINE_PERMISSION, { prisma });
  if (!context) return;
  try {
    const data = await findCrmPipelineCase(prisma, {
      tenantId: context.tenantId,
      caseId: req.query?.id,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return sendCommercialTenancyError(res, error);
  }
});
