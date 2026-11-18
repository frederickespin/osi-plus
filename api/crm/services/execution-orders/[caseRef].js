import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { getExecutionOrderWorkspace, saveExecutionOrder } from "../../../_lib/executionOrderDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? getExecutionOrderWorkspace(database, context, req.query?.caseRef)
    : saveExecutionOrder(database, context, req.query?.caseRef, input),
});

