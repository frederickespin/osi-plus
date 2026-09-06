import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { createCommercialRelationship, listCommercialRelationships } from "../../_lib/commercialRelationshipsDomain.js";

export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: (method) => method === "GET" ? "commercial:relationships:view" : "commercial:relationships:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ req, context, input, prisma: database, method }) => method === "GET" ? listCommercialRelationships(database, context, req.query) : createCommercialRelationship(database, context, input) });
