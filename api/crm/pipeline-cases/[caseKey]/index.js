import { prisma } from "../../../_lib/db.js";
import {
  findCrmPipelineCase,
} from "../../../_lib/crmPipelineRead.js";
import { requireCrmPipelinePermissionResponse } from "../../../_lib/crmPipelineAccess.js";
import { createCrmPipelineReadHandler } from "../../../_lib/crmPipelineReadHttp.js";

export function createPipelineCaseDetailHandler({
  prismaClient = prisma,
  requirePermission = requireCrmPipelinePermissionResponse,
  env = process.env,
} = {}) {
  return createCrmPipelineReadHandler({
    env,
    prismaClient,
    requirePermission,
    execute: ({ req, context, prisma: database }) => findCrmPipelineCase(database, {
      tenantId: context.tenantId,
      caseRef: req.query?.caseKey,
    }),
    response: (data) => ({ ok: true, data }),
  });
}

export default createPipelineCaseDetailHandler();
