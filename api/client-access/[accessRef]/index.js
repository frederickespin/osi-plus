import { prisma } from "../../_lib/db.js";
import { createExternalClientTemporaryHandler } from "../../_lib/clientTemporaryAccessHttp.js";
import { openClientTemporaryAccess } from "../../_lib/clientTemporaryAccessDomain.js";

export default createExternalClientTemporaryHandler({
  prismaClient: prisma,
  execute: ({ accessRef, token, prisma: database }) => openClientTemporaryAccess(accessRef, token, database),
});
