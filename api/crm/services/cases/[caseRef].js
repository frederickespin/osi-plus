import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { getCaseServiceWorkspace, saveCaseServiceSelection } from "../../../_lib/crmServicesApiDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "PATCH"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? getCaseServiceWorkspace(context, req.query?.caseRef, database)
    : saveCaseServiceSelection(context, req.query?.caseRef, input, database),
});
