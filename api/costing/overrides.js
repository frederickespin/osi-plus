import { prisma } from "../_lib/db.js";
import { createCostingOverride } from "../_lib/costingDomain.js";
import { createCostingHandler } from "../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["POST"], permission: "costing:override", status: 201, execute: ({ prisma: db, context, input }) => createCostingOverride(db, context, input) });
