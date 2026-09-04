import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { createServiceCatalogItem, listServiceCatalog } from "../../../_lib/crmServicesApiDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? listServiceCatalog(context, { usage: req.query?.usage, status: req.query?.status }, database)
    : createServiceCatalogItem(context, input, database),
});
