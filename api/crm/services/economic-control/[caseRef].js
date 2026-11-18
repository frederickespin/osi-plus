import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { getEconomicControlWorkspace, saveEconomicControl } from "../../../_lib/economicControlDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? getEconomicControlWorkspace(database, context, req.query?.caseRef)
    : saveEconomicControl(database, context, req.query?.caseRef, input),
});
