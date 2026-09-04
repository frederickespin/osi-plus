import { prisma } from "../../../_lib/db.js";
import { transitionPurchaseRequest } from "../../../_lib/materialsInventoryDomain.js";
import { createMaterialsHandler } from "../../../_lib/materialsInventoryHttp.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["POST"], permission: "inventory:purchase:approve", execute: ({ context, input, prisma: database }) => transitionPurchaseRequest(database, context, input) });
