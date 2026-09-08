import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { listServiceCatalogModes, saveServiceCatalogModes } from "../../../_lib/servicePackagesDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method }) => method === "GET" ? listServiceCatalogModes(context, database) : saveServiceCatalogModes(context, input, database),
});
