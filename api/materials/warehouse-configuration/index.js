import { prisma } from "../../_lib/db.js";
import { createWarehouseConfigurationHandler } from "../../_lib/warehouseConfigurationHttp.js";
import { listWarehouseConfiguration } from "../../_lib/warehouseConfigurationDomain.js";

export default createWarehouseConfigurationHandler({ prismaClient: prisma, methods: ["GET"], execute: ({ context, prisma: database }) => listWarehouseConfiguration(database, context) });
