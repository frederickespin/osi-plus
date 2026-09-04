import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { resolveSurveyRequirements } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["POST"], permission: "inventory:recipes:manage", execute: ({ context, input, prisma: database }) => resolveSurveyRequirements(database, context, input) });
