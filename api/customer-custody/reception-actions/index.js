import { prisma } from "../../_lib/db.js";
import { normalizeCustodyReceptionAction } from "../../_lib/customerCustodyContract.js";
import { applyCustomerCustodyReceptionAction } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({ prismaClient: prisma, methods: ["POST"], permission: "customer-custody:operate", normalize: normalizeCustodyReceptionAction, execute: ({ context, input, prisma: database }) => applyCustomerCustodyReceptionAction(database, context, input) });
