import { prisma } from "../_lib/db.js";
import { publishCosting } from "../_lib/costingDomain.js";
import { createCostingHandler } from "../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["POST"], permission: "costing:publish", status: 201, execute: ({ prisma: db, context, input }) => publishCosting(db, context, input) });
