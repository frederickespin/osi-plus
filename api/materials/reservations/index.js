import { prisma } from "../../_lib/db.js";
import { createMaterialsHandler } from "../../_lib/materialsInventoryHttp.js";
import { createReservation, listReservations } from "../../_lib/materialsInventoryDomain.js";

export default createMaterialsHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: "inventory:reservation:manage",
  execute: ({ context, input, prisma: database, method }) => method === "GET"
    ? listReservations(database, context)
    : createReservation(database, context, input),
});
