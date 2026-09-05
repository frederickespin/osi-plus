import { prisma } from "../../_lib/db.js";
import { getQuoteCase, QUOTE_PERMISSIONS } from "../../_lib/quoteDomain.js";
import { createQuoteHandler } from "../../_lib/quoteHttp.js";

export default createQuoteHandler({ prismaClient: prisma, methods: ["GET"], permission: QUOTE_PERMISSIONS.VIEW, execute: ({ prisma: db, context, req }) => getQuoteCase(db, context, req.query.caseRef) });
