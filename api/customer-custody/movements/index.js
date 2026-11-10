import { prisma } from "../../_lib/db.js";
import { normalizeCustodyMovement } from "../../_lib/customerCustodyContract.js";
import { moveCustomerStorage } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({ prismaClient: prisma, methods: ["POST"], permission: "customer-custody:operate", normalize: normalizeCustodyMovement, execute: ({ context, input, prisma: database }) => moveCustomerStorage(database, context, input) });
