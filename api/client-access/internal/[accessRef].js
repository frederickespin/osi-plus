import { prisma } from "../../_lib/db.js";
import { createInternalClientTemporaryHandler } from "../../_lib/clientTemporaryAccessHttp.js";
import { revokeClientTemporaryAccess } from "../../_lib/clientTemporaryAccessDomain.js";

export default createInternalClientTemporaryHandler({
  prismaClient: prisma,
  methods: ["POST"],
  execute: ({ context, input, prisma: database, req }) => revokeClientTemporaryAccess(context, req.query?.accessRef, input, database),
});
