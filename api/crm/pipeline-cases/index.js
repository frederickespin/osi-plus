import { prisma } from "../../_lib/db.js";
import {
  listCrmPipelineCases,
  parsePipelineListQuery,
} from "../../_lib/crmPipelineRead.js";
import { requireCrmPipelinePermissionResponse } from "../../_lib/crmPipelineAccess.js";
import { createCrmPipelineReadHandler } from "../../_lib/crmPipelineReadHttp.js";

export function createPipelineCasesListHandler({
  prismaClient = prisma,
  requirePermission = requireCrmPipelinePermissionResponse,
  env = process.env,
} = {}) {
  return createCrmPipelineReadHandler({
    env,
    prismaClient,
    requirePermission,
    execute: ({ req, context, prisma: database }) => listCrmPipelineCases(database, {
      tenantId: context.tenantId,
      filters: parsePipelineListQuery(req.query),
    }),
    response: (result) => ({ ok: true, ...result }),
  });
}

export default createPipelineCasesListHandler();
