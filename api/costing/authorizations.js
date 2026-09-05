import { prisma } from "../_lib/db.js";
import { authorizeCostingMargin } from "../_lib/costingDomain.js";
import { createCostingHandler } from "../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["POST"], permission: "costing:authorize-margin", status: 201, execute: ({ prisma: db, context, input }) => authorizeCostingMargin(db, context, input) });
