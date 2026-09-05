import { prisma } from "../../../_lib/db.js";
import { getQuoteClientProposal, QUOTE_PERMISSIONS } from "../../../_lib/quoteDomain.js";
import { createQuoteHandler } from "../../../_lib/quoteHttp.js";

export default createQuoteHandler({ prismaClient: prisma, methods: ["GET"], permission: QUOTE_PERMISSIONS.VIEW, execute: ({ prisma: db, context, req }) => getQuoteClientProposal(db, context, req.query.proposalRef) });
