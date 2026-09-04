import { prisma } from "../../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../../_lib/toolsEquipmentHttp.js";
import { createExternalReservation } from "../../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["POST"], permissions: "assets:external:manage", execute: ({ context, input, prisma: db }) => createExternalReservation(db, context, input) });
