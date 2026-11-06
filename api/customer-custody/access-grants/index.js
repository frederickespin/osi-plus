import { prisma } from "../../_lib/db.js";
import { normalizeWarehouseGrant } from "../../_lib/customerCustodyContract.js";
import { createWarehouseAccessGrant, listWarehouseAccessGrants } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: "warehouse-access:manage", normalize: normalizeWarehouseGrant, execute: ({ context, input, prisma: database, method }) => method === "GET" ? listWarehouseAccessGrants(database, context) : createWarehouseAccessGrant(database, context, input) });
