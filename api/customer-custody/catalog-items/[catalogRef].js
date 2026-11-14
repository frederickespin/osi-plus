import { prisma } from "../../_lib/db.js";
import { normalizeCustodyCatalogUpdate } from "../../_lib/customerCustodyContract.js";
import { updateCustomerCustodyCatalogItem } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["PATCH"],
  permission: "warehouse-access:manage",
  normalize: (body, req) => normalizeCustodyCatalogUpdate(body, req.query.catalogRef),
  execute: ({ context, input, prisma: database }) => updateCustomerCustodyCatalogItem(database, context, input),
});
