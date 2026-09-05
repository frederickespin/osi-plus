import { prisma } from "../../_lib/db.js";
import { QUOTE_PERMISSIONS, recordQuoteDecision } from "../../_lib/quoteDomain.js";
import { createQuoteHandler } from "../../_lib/quoteHttp.js";

export default createQuoteHandler({ prismaClient: prisma, methods: ["POST"], permission: QUOTE_PERMISSIONS.DECIDE, execute: ({ prisma: db, context, input }) => recordQuoteDecision(db, context, input) });
