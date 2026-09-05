import { prisma } from "../../_lib/db.js";
import { listCostingRules, versionCostingRule } from "../../_lib/costingDomain.js";
import { createCostingHandler } from "../../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: (method) => method === "GET" ? "costing:rules:view" : "costing:rules:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ prisma: db, context, input, req, method }) => method === "GET" ? listCostingRules(db, context, req.query || {}) : versionCostingRule(db, context, input) });
