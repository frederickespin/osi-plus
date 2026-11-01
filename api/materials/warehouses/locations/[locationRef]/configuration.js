import { prisma } from "../../../../_lib/db.js";
import { createWarehouseConfigurationHandler } from "../../../../_lib/warehouseConfigurationHttp.js";
import { updateWarehouseLocationConfiguration } from "../../../../_lib/warehouseConfigurationDomain.js";

export default createWarehouseConfigurationHandler({ prismaClient: prisma, methods: ["PATCH"], execute: ({ req, context, input, prisma: database }) => updateWarehouseLocationConfiguration(database, context, req.query?.locationRef, input) });
