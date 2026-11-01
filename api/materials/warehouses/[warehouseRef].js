import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { updateWarehouse } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["PATCH"], permission: "inventory:stock:view", execute: ({ req, context, input, prisma: database }) => updateWarehouse(database, context, req.query?.warehouseRef, input) });
