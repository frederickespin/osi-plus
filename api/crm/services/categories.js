import { prisma } from "../../_lib/db.js";
import { createCrmServicesHandler } from "../../_lib/crmServicesHttp.js";
import {
  createServiceCatalogCategory,
  listServiceCatalogCategories,
  updateServiceCatalogCategory,
} from "../../_lib/crmServicesApiDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST", "PATCH"],
  execute: ({ context, input, prisma: database, method }) => {
    if (method === "GET") return listServiceCatalogCategories(context, database);
    if (method === "POST") return createServiceCatalogCategory(context, input, database);
    return updateServiceCatalogCategory(context, input, database);
  },
});
