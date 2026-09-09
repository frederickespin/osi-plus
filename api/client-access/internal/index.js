import { prisma } from "../../_lib/db.js";
import { createInternalClientTemporaryHandler } from "../../_lib/clientTemporaryAccessHttp.js";
import { createClientTemporaryAccess, listClientTemporaryAccess } from "../../_lib/clientTemporaryAccessDomain.js";

export default createInternalClientTemporaryHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? listClientTemporaryAccess(context, req.query?.caseRef, database)
    : createClientTemporaryAccess(context, input, database),
});
