import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { listServiceModes, saveServiceMode } from "../../../_lib/servicePackagesDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method }) => method === "GET" ? listServiceModes(context, database) : saveServiceMode(context, input, database),
});
