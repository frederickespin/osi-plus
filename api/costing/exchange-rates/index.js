import { prisma } from "../../_lib/db.js";
import { listCostingExchangeRates, versionCostingExchangeRate } from "../../_lib/costingDomain.js";
import { createCostingHandler } from "../../_lib/costingHttp.js";

export default createCostingHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: (method) => method === "GET" ? "costing:rules:view" : "costing:rules:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ prisma: db, context, input, method }) => method === "GET" ? listCostingExchangeRates(db, context) : versionCostingExchangeRate(db, context, input) });
