import { prisma } from "../../../../_lib/db.js";
import { findCrmIcpV2Case } from "../../../../_lib/crmIcpV2ApiDomain.js";
import { createCrmIcpV2DetailHandler } from "../../../../_lib/crmIcpV2ApiHttp.js";

export function createIcpV2PipelineCaseDetailHandler({
  env = process.env,
  prismaClient = prisma,
  execute = ({ req, context, prisma: database }) => findCrmIcpV2Case(context, req.query?.caseKey, database),
  resolveContext,
} = {}) {
  return createCrmIcpV2DetailHandler({ env, prismaClient, execute, resolveContext });
}

export default createIcpV2PipelineCaseDetailHandler();
