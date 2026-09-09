import { prisma } from "../../_lib/db.js";
import { createExternalClientTemporaryHandler } from "../../_lib/clientTemporaryAccessHttp.js";
import { applyClientVisitAction } from "../../_lib/clientTemporaryAccessDomain.js";

export default createExternalClientTemporaryHandler({
  prismaClient: prisma,
  execute: ({ accessRef, token, input, prisma: database }) => applyClientVisitAction(accessRef, token, input, database),
});
