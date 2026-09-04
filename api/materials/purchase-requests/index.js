import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createPurchaseRequest, listPurchaseRequests } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: "inventory:purchase:request", execute: ({ context, input, prisma: database, method }) => method === "GET" ? listPurchaseRequests(database, context) : createPurchaseRequest(database, context, input) });
