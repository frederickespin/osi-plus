import { prisma } from "../../_lib/db.js";
import { listLogisticsRules, versionLogisticsRule } from "../../_lib/logisticsEngineDomain.js";
import { createLogisticsHandler } from "../../_lib/logisticsEngineHttp.js";
export default createLogisticsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: (method) => method === "GET" ? "logistics:rules:view" : "logistics:rules:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ prisma: db, context, input, req, method }) => method === "GET" ? listLogisticsRules(db, context, req.query) : versionLogisticsRule(db, context, input) });
