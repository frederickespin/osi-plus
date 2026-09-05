import { prisma } from "../../_lib/db.js";
import { createLogisticsOverride } from "../../_lib/logisticsEngineDomain.js";
import { createLogisticsHandler } from "../../_lib/logisticsEngineHttp.js";
export default createLogisticsHandler({ prismaClient: prisma, methods: ["POST"], permission: "logistics:plan:override", status: 201, execute: ({ prisma: db, context, input }) => createLogisticsOverride(db, context, input) });
