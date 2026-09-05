import { prisma } from "../../_lib/db.js";
import { resolveCostingIssue } from "../../_lib/costingDomain.js";
import { createCostingHandler } from "../../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["POST"], permission: "costing:resolve", execute: ({ prisma: db, context, input }) => resolveCostingIssue(db, context, input) });
