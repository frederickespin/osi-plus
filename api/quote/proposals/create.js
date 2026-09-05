import { prisma } from "../../_lib/db.js";
import { createQuoteProposal, QUOTE_PERMISSIONS } from "../../_lib/quoteDomain.js";
import { createQuoteHandler } from "../../_lib/quoteHttp.js";

export default createQuoteHandler({ prismaClient: prisma, methods: ["POST"], permission: QUOTE_PERMISSIONS.CREATE, status: 201, execute: ({ prisma: db, context, input }) => createQuoteProposal(db, context, input) });
