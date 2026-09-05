import { prisma } from "../_lib/db.js";
import { calculateCosting } from "../_lib/costingDomain.js";
import { createCostingHandler } from "../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["POST"], permission: "costing:calculate", status: 201, execute: ({ prisma: db, context, input }) => calculateCosting(db, context, input) });
