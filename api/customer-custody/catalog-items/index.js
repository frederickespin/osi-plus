import { prisma } from "../../_lib/db.js";
import { readActiveArticleCatalog } from "../../_lib/articleCatalog.js";
import { custodyFail, normalizeCustodyCatalogCreate } from "../../_lib/customerCustodyContract.js";
import { createCustomerCustodyCatalogItem, listCustomerCustodyCatalogItems } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: (method) => method === "GET" ? "customer-custody:view" : "warehouse-access:manage",
  normalize: normalizeCustodyCatalogCreate,
  execute: ({ req, context, input, prisma: database, method }) => {
    if (method !== "GET") return createCustomerCustodyCatalogItem(database, context, input);
    const query = req.query ?? {};
    if (query.view === undefined) return listCustomerCustodyCatalogItems(database, context, query);
    if (query.view !== "articles" || Object.keys(query).length !== 1) custodyFail("CUSTOMER_CUSTODY_INPUT_INVALID");
    return readActiveArticleCatalog(database, context.tenantId);
  },
});
