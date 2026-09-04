import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { listMaterialRequirements } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["GET"], permission: "inventory:recipes:view", execute: ({ context, prisma: database }) => listMaterialRequirements(database, context) });
