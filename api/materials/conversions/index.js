import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createUnitConversion, listUnitConversions } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: "inventory:catalog:view", execute: ({ req, context, input, prisma: database, method }) => method === "GET" ? listUnitConversions(database, context, req.query) : createUnitConversion(database, context, input) });
