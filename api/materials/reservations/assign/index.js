import { prisma } from "../../../_lib/db.js";
import { assignReservation } from "../../../_lib/materialsInventoryDomain.js";
import { createMaterialsHandler } from "../../../_lib/materialsInventoryHttp.js";

export default createMaterialsHandler({ prismaClient: prisma, methods: ["POST"], permission: "inventory:reservation:manage", execute: ({ context, input, prisma: database }) => assignReservation(database, context, input) });
