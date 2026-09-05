import { prisma } from "../../_lib/db.js";
import { QUOTE_PERMISSIONS, sendQuoteProposal } from "../../_lib/quoteDomain.js";
import { createQuoteHandler } from "../../_lib/quoteHttp.js";

export default createQuoteHandler({ prismaClient: prisma, methods: ["POST"], permission: QUOTE_PERMISSIONS.SEND, execute: ({ prisma: db, context, input }) => sendQuoteProposal(db, context, input) });
