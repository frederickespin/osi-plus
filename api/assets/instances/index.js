import { prisma } from "../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../_lib/toolsEquipmentHttp.js";
import { createAssetInstance, listAssetInstances } from "../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["GET", "POST"], permissions: (method) => method === "GET" ? "assets:instance:view" : "assets:instance:manage", execute: ({ req, context, input, prisma: db, method }) => method === "GET" ? listAssetInstances(db, context, req.query) : createAssetInstance(db, context, input) });
