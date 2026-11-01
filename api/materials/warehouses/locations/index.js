import { prisma } from "../../../_lib/db.js";
import { createMaterialsHandler } from "../../../_lib/materialsInventoryHttp.js";
import { createWarehouseLocation } from "../../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["POST"], permission: "inventory:stock:view", execute: ({ context, input, prisma: database }) => createWarehouseLocation(database, context, input) });
