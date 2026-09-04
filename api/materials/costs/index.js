import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createCostVersion } from "../../_lib/materialsInventoryDomain.js";
export default createMaterialsHandler({ prismaClient: prisma, methods: ["POST"], permission: "inventory:catalog:manage", execute: ({ context, input, prisma: database }) => createCostVersion(database, context, input) });
