import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { getChangeAddendumWorkspace, saveChangeAddendum } from "../../../_lib/changeAddendumDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? getChangeAddendumWorkspace(database, context, req.query?.caseRef)
    : saveChangeAddendum(database, context, req.query?.caseRef, input),
});
