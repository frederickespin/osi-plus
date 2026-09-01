import { prisma } from "../../../_lib/db.js";
import { searchCrmIcpClients } from "../../../_lib/crmIcpV2ApiDomain.js";
import { createCrmIcpClientSearchHandler } from "../../../_lib/crmIcpV2ApiHttp.js";

export function createIcpV2ClientSearchHandler({
  env = process.env,
  prismaClient = prisma,
  execute = ({ context, input, prisma: database }) => searchCrmIcpClients(context, input, database),
  resolveContext,
} = {}) {
  return createCrmIcpClientSearchHandler({ env, prismaClient, execute, resolveContext });
}

export default createIcpV2ClientSearchHandler();
