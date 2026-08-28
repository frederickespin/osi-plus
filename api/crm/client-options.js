import { prisma } from "../_lib/db.js";
import { createCrmPipelineReadHandler } from "../_lib/crmPipelineReadHttp.js";
import { requireCrmPipelinePermissionResponse } from "../_lib/crmPipelineAccess.js";
import { listCrmClientOptions, parseCrmClientOptionsQuery } from "../_lib/crmClientOptions.js";

export function createCrmClientOptionsHandler({
  prismaClient = prisma,
  requirePermission = requireCrmPipelinePermissionResponse,
  env = process.env,
} = {}) {
  return createCrmPipelineReadHandler({
    env,
    prismaClient,
    requirePermission,
    execute: ({ req, context, prisma: database }) => listCrmClientOptions(database, {
      tenantId: context.tenantId,
      filters: parseCrmClientOptionsQuery(req.query),
    }),
    response: (result) => ({ ok: true, ...result }),
  });
}

export default createCrmClientOptionsHandler();
