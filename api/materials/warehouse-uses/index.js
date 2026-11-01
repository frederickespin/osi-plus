import { prisma } from "../../_lib/db.js";
import { createWarehouseConfigurationHandler } from "../../_lib/warehouseConfigurationHttp.js";
import { createWarehouseAreaUse } from "../../_lib/warehouseConfigurationDomain.js";

export default createWarehouseConfigurationHandler({ prismaClient: prisma, methods: ["POST"], execute: ({ context, input, prisma: database }) => createWarehouseAreaUse(database, context, input) });
