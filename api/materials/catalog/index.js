import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createMaterial, listMaterials } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: "inventory:catalog:view",
  execute: ({ req, context, input, prisma: database, method }) => method === "GET"
    ? listMaterials(database, context, req.query)
    : createMaterial(database, context, input),
});
