import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { listMovements, recordMovement } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: "inventory:stock:view",
  execute: ({ req, context, input, prisma: database, method }) => method === "GET"
    ? listMovements(database, context, req.query)
    : recordMovement(database, context, input),
});
