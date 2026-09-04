import { prisma } from "../../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../../_lib/toolsEquipmentHttp.js";
import { handoutAsset } from "../../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["POST"], permissions: "assets:assignment:manage", execute: ({ context, input, prisma: db }) => handoutAsset(db, context, input) });
