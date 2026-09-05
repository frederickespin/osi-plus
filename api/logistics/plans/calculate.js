import { prisma } from "../../_lib/db.js";
import { calculateLogistics } from "../../_lib/logisticsEngineDomain.js";
import { createLogisticsHandler } from "../../_lib/logisticsEngineHttp.js";
export default createLogisticsHandler({ prismaClient: prisma, methods: ["POST"], permission: "logistics:plan:calculate", status: 201, execute: ({ prisma: db, context, input }) => calculateLogistics(db, context, input) });
