import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { updateMaterial } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["PATCH"], permission: "inventory:catalog:manage", execute: ({ req, context, input, prisma: database }) => updateMaterial(database, context, req.query?.materialRef, input) });
