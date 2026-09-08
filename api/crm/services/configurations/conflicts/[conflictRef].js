import { prisma } from "../../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../../_lib/crmServicesHttp.js";
import { resolveServiceConfigurationConflict } from "../../../../_lib/servicePackagesDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["POST"],
  execute: ({ context, input, prisma: database, req }) => resolveServiceConfigurationConflict(context, req.query?.conflictRef, input, database),
});
