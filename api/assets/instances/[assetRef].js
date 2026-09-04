import { prisma } from "../../_lib/db.js";
import { createToolsEquipmentHandler } from "../../_lib/toolsEquipmentHttp.js";
import { changeAssetState, getAssetInstance } from "../../_lib/toolsEquipmentDomain.js";
export default createToolsEquipmentHandler({ prismaClient: prisma, methods: ["GET", "PATCH"], permissions: (method) => method === "GET" ? "assets:instance:view" : "assets:instance:manage", execute: ({ req, context, input, prisma: db, method }) => method === "GET" ? getAssetInstance(db, context, String(req.query.assetRef || ""), req.query) : changeAssetState(db, context, String(req.query.assetRef || ""), input) });
