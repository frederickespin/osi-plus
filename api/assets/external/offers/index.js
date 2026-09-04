import { prisma } from "../../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../../_lib/toolsEquipmentHttp.js";
import { createExternalOffer, listExternalOffers } from "../../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["GET", "POST"], permissions: (method) => method === "GET" ? "assets:external:view" : "assets:external:manage", execute: ({ context, input, prisma: db, method }) => method === "GET" ? listExternalOffers(db, context) : createExternalOffer(db, context, input) });
