import { prisma } from "../../_lib/db.js";
import { cancelQuoteProposal, QUOTE_PERMISSIONS } from "../../_lib/quoteDomain.js";
import { createQuoteHandler } from "../../_lib/quoteHttp.js";

export default createQuoteHandler({ prismaClient: prisma, methods: ["POST"], permission: QUOTE_PERMISSIONS.UPDATE, execute: ({ prisma: db, context, input }) => cancelQuoteProposal(db, context, input) });
