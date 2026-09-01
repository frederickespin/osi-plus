import { prisma } from "../../../_lib/db.js";
import { createCrmIcpV2Case } from "../../../_lib/crmIcpV2ApiDomain.js";
import { createCrmIcpV2CreateHandler } from "../../../_lib/crmIcpV2ApiHttp.js";

export function createIcpV2PipelineCaseHandler({
  env = process.env,
  prismaClient = prisma,
  execute = ({ context, input, prisma: database }) => createCrmIcpV2Case(context, input, database),
  resolveContext,
} = {}) {
  return createCrmIcpV2CreateHandler({ env, prismaClient, execute, resolveContext });
}

export default createIcpV2PipelineCaseHandler();
