import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { getCaseServiceConfiguration, saveCaseServiceConfiguration, saveCaseIntake } from "../../../_lib/servicePackagesDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => {
    const caseRef = req.query?.caseRef;
    if (method === "GET") return getCaseServiceConfiguration(context, caseRef, database);
    if (Object.hasOwn(input, "intake")) return saveCaseIntake(context, caseRef, input, database);
    return saveCaseServiceConfiguration(context, caseRef, input, database);
  },
});
