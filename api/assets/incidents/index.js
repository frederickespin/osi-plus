import { prisma } from "../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../_lib/toolsEquipmentHttp.js";
import { createAssetIncident } from "../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["POST"], permissions: "assets:incident:manage", execute: ({ context, input, prisma: db }) => createAssetIncident(db, context, input) });
