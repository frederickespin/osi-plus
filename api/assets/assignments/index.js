import { prisma } from "../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../_lib/toolsEquipmentHttp.js";
import { createAssetAssignment } from "../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["POST"], permissions: "assets:assignment:manage", execute: ({ context, input, prisma: db }) => createAssetAssignment(db, context, input) });
