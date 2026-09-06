import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { getCaseCommercialContext, publishCaseCommercialContext } from "../../_lib/commercialRelationshipsDomain.js";

export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: (method) => method === "GET" ? "commercial:relationships:view" : "commercial:relationships:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ req, context, input, prisma: database, method }) => method === "GET" ? getCaseCommercialContext(database, context, String(req.query.caseRef || "")) : publishCaseCommercialContext(database, context, String(req.query.caseRef || ""), input) });
