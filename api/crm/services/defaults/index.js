import { prisma } from "../../../_lib/db.js";
import { createCrmServicesHandler } from "../../../_lib/crmServicesHttp.js";
import { listServiceDefaults, saveServiceDefaults } from "../../../_lib/crmServicesApiDomain.js";

export default createCrmServicesHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? listServiceDefaults(context, req.query?.primaryRef, database)
    : saveServiceDefaults(context, input, database),
});
