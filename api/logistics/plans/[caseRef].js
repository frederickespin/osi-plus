import { prisma } from "../../_lib/db.js";
import { getLogisticsPlan } from "../../_lib/logisticsEngineDomain.js";
import { createLogisticsHandler } from "../../_lib/logisticsEngineHttp.js";
export default createLogisticsHandler({ prismaClient: prisma, methods: ["GET"], permission: "logistics:plan:view", execute: ({ prisma: db, context, req }) => getLogisticsPlan(db, context, String(req.query.caseRef || "")) });
