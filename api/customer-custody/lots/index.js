import { prisma } from "../../_lib/db.js";
import { normalizeCustodyReceipt } from "../../_lib/customerCustodyContract.js";
import { listCustomerStorageLots, receiveCustomerStorage } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: (method) => method === "GET" ? "customer-custody:view" : "customer-custody:receive", normalize: normalizeCustodyReceipt, execute: ({ req, context, input, prisma: database, method }) => method === "GET" ? listCustomerStorageLots(database, context, req.query) : receiveCustomerStorage(database, context, input) });
