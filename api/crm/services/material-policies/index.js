import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { listMaterialPolicies, saveMaterialPolicy } from "../../../_lib/servicePackagesDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method }) => method === "GET" ? listMaterialPolicies(context, database) : saveMaterialPolicy(context, input, database),
});
