import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createUnit, listUnits } from "../../_lib/materialsInventoryDomain.js";
export default createMaterialsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: "inventory:catalog:view", execute: ({ context, input, prisma: database, method }) => method === "GET" ? listUnits(database, context) : createUnit(database, context, input) });
