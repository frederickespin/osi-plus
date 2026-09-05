import { prisma } from "../../_lib/db.js";
import { publishQuoteProposal, QUOTE_PERMISSIONS } from "../../_lib/quoteDomain.js";
import { createQuoteHandler } from "../../_lib/quoteHttp.js";

export default createQuoteHandler({ prismaClient: prisma, methods: ["POST"], permission: QUOTE_PERMISSIONS.PUBLISH, execute: ({ prisma: db, context, input }) => publishQuoteProposal(db, context, input) });
