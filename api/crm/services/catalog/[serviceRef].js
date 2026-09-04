import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { getServiceCatalogHistory, updateServiceCatalogItem } from "../../../_lib/crmServicesApiDomain.js";

export default createCrmServicesHandler({ prismaClient: prisma, methods: ["GET", "PATCH"], execute: ({ context, input, prisma: database, req, method }) => method === "GET" ? getServiceCatalogHistory(context, req.query?.serviceRef, database) : updateServiceCatalogItem(context, req.query?.serviceRef, input, database) });
