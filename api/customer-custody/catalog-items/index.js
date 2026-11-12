import { prisma } from "../../_lib/db.js";
import { normalizeCustodyCatalogCreate } from "../../_lib/customerCustodyContract.js";
import { createCustomerCustodyCatalogItem, listCustomerCustodyCatalogItems } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: (method) => method === "GET" ? "customer-custody:view" : "warehouse-access:manage",
  normalize: normalizeCustodyCatalogCreate,
  execute: ({ req, context, input, prisma: database, method }) => method === "GET"
    ? listCustomerCustodyCatalogItems(database, context, req.query)
    : createCustomerCustodyCatalogItem(database, context, input),
});
