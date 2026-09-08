import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { getCaseServiceConfiguration, saveCaseServiceConfiguration } from "../../../_lib/servicePackagesDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET" ? getCaseServiceConfiguration(context, req.query?.caseRef, database) : saveCaseServiceConfiguration(context, req.query?.caseRef, input, database),
});
