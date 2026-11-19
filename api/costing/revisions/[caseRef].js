import { prisma } from "../../_lib/db.js";
import { getCosting, getCostingPackageOptions, getQuoteAddOnCatalog } from "../../_lib/costingDomain.js";
import { createCostingHandler } from "../../_lib/costingHttp.js";

export default createCostingHandler({
  prismaClient: prisma,
  methods: ["GET"],
  permission: "costing:view",
  execute: ({ prisma: db, context, req }) => {
    const caseRef = String(req.query?.caseRef || "");
    if (req.query?.view === "packages") return getCostingPackageOptions(db, context, caseRef);
    if (req.query?.view === "addons") return getQuoteAddOnCatalog(db, context, caseRef, req.query.currency);
    return getCosting(db, context, caseRef);
  },
});
