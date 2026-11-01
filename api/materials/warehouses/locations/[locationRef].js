import { prisma } from "../../../_lib/db.js";
import { createMaterialsHandler } from "../../../_lib/materialsInventoryHttp.js";
import { updateWarehouseLocation } from "../../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["PATCH"], permission: "inventory:stock:view", execute: ({ req, context, input, prisma: database }) => updateWarehouseLocation(database, context, req.query?.locationRef, input) });
