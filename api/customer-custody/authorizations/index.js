import { prisma } from "../../_lib/db.js";
import { normalizeStorageAuthorizationCreate } from "../../_lib/customerCustodyContract.js";
import { createCustomerStorageAuthorization, listCustomerStorageAuthorizations } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: (method) => method === "POST" ? ["customer-custody:authorize", "services:case:update"] : ["customer-custody:authorize", "services:case:update", "customer-custody:receive", "customer-custody:operate"],
  normalize: normalizeStorageAuthorizationCreate,
  execute: ({ req, context, input, prisma: database, method }) => method === "GET" ? listCustomerStorageAuthorizations(database, context, req.query) : createCustomerStorageAuthorization(database, context, input),
});
