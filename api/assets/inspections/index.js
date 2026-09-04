import { prisma } from "../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../_lib/toolsEquipmentHttp.js";
import { createAssetInspection } from "../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["POST"], permissions: "assets:inspection:perform", execute: ({ context, input, prisma: db }) => createAssetInspection(db, context, input) });
