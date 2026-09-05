import { prisma } from "../../_lib/db.js";
import { publishLogistics } from "../../_lib/logisticsEngineDomain.js";
import { createLogisticsHandler } from "../../_lib/logisticsEngineHttp.js";
export default createLogisticsHandler({ prismaClient: prisma, methods: ["POST"], permission: "logistics:plan:publish", status: 201, execute: ({ prisma: db, context, input }) => publishLogistics(db, context, input) });
