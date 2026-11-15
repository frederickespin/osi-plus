import { prisma } from "../../../_lib/db.js";
import { createCrmPipelineReadHandler } from "../../../_lib/crmPipelineReadHttp.js";
import { getClientCaseRouteOptions } from "../../../_lib/crmCaseRouteDomain.js";

export default createCrmPipelineReadHandler({
  prismaClient: prisma,
  execute: ({ req, context, prisma: database }) => getClientCaseRouteOptions(context, req.query?.clientRef, database),
  response: (data) => ({ ok: true, data }),
});
