import { prisma } from "../_lib/db.js";
import {
  summarizeCrmPipelineCases,
} from "../_lib/crmPipelineRead.js";
import { requireCrmPipelinePermissionResponse } from "../_lib/crmPipelineAccess.js";
import { createCrmPipelineReadHandler } from "../_lib/crmPipelineReadHttp.js";

export function createPipelineSummaryHandler({
  prismaClient = prisma,
  requirePermission = requireCrmPipelinePermissionResponse,
  env = process.env,
} = {}) {
  return createCrmPipelineReadHandler({
    env,
    prismaClient,
    requirePermission,
    execute: ({ context, prisma: database }) => summarizeCrmPipelineCases(database, {
      tenantId: context.tenantId,
      role: context.role,
      membershipId: context.membershipId,
      userId: context.userId,
    }),
    response: (data) => ({ ok: true, data }),
  });
}

export default createPipelineSummaryHandler();
