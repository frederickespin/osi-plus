import { prisma } from "../../../_lib/db.js";
import { createRecipeVersion } from "../../../_lib/materialsInventoryDomain.js";
import { createMaterialsHandler } from "../../../_lib/materialsInventoryHttp.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["POST"], permission: "inventory:recipes:manage", execute: ({ context, input, prisma: database }) => createRecipeVersion(database, context, input) });
