import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createWarehouse, listWarehouses } from "../../_lib/materialsInventoryDomain.js";
export default createMaterialsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: "inventory:stock:view", execute: ({ context, input, prisma: database, method }) => method === "GET" ? listWarehouses(database, context) : createWarehouse(database, context, input) });
