import { prisma } from "../../_lib/db.js";
import { getCosting } from "../../_lib/costingDomain.js";
import { createCostingHandler } from "../../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["GET"], permission: "costing:view", execute: ({ prisma: db, context, req }) => getCosting(db, context, String(req.query?.caseRef || "")) });
