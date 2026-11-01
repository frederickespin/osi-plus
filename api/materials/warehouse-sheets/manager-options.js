import { prisma } from "../../_lib/db.js";
import { createWarehouseSheetHandler } from "../../_lib/warehouseSheetHttp.js";
import { listWarehouseManagerOptions } from "../../_lib/warehouseSheetDomain.js";

export default createWarehouseSheetHandler({ prismaClient: prisma, methods: ["GET"], managerOptions: true, execute: ({ req, context, prisma: database }) => listWarehouseManagerOptions(database, context, req.query ?? {}) });
