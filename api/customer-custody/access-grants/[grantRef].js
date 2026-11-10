import { prisma } from "../../_lib/db.js";
import { normalizeWarehouseGrantUpdate } from "../../_lib/customerCustodyContract.js";
import { updateWarehouseAccessGrant } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({ prismaClient: prisma, methods: ["PATCH"], permission: "warehouse-access:manage", normalize: (input, req) => normalizeWarehouseGrantUpdate(input, req.query?.grantRef), execute: ({ context, input, prisma: database }) => updateWarehouseAccessGrant(database, context, input) });
