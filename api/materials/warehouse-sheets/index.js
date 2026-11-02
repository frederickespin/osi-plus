import { prisma } from "../../_lib/db.js";
import { createWarehouseSheetHandler } from "../../_lib/warehouseSheetHttp.js";
import { listWarehouseSheets, saveWarehouseSheet } from "../../_lib/warehouseSheetDomain.js";

export default createWarehouseSheetHandler({ prismaClient: prisma, methods: ["GET", "POST"], execute: ({ context, input, prisma: database, method, routesEnabled }) => method === "GET" ? listWarehouseSheets(database, context, { routesEnabled }) : saveWarehouseSheet(database, context, input, { routesEnabled }) });
