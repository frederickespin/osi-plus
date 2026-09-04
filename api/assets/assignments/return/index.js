import { prisma } from "../../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../../_lib/toolsEquipmentHttp.js";
import { returnAsset } from "../../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["POST"], permissions: "assets:assignment:manage", execute: ({ context, input, prisma: db }) => returnAsset(db, context, input) });
