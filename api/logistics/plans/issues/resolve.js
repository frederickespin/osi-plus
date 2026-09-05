import { prisma } from "../../../_lib/db.js";
import { resolveLogisticsIssue } from "../../../_lib/logisticsEngineDomain.js";
import { createLogisticsHandler } from "../../../_lib/logisticsEngineHttp.js";
export default createLogisticsHandler({ prismaClient: prisma, methods: ["POST"], permission: "logistics:plan:resolve", execute: ({ prisma: db, context, input }) => resolveLogisticsIssue(db, context, input) });
