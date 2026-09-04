import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createRecipe, listRecipes } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: "inventory:recipes:view", execute: ({ context, input, prisma: database, method }) => method === "GET" ? listRecipes(database, context) : createRecipe(database, context, input) });
