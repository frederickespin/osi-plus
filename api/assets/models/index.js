import { prisma } from "../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../_lib/toolsEquipmentHttp.js";
import { createAssetModel, listAssetModels } from "../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["GET", "POST"], permissions: (method) => method === "GET" ? "assets:model:view" : "assets:model:manage", execute: ({ req, context, input, prisma: db, method }) => method === "GET" ? listAssetModels(db, context, req.query) : createAssetModel(db, context, input) });
