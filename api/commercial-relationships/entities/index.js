import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { createCommercialEntity, listCommercialEntities, updateCommercialEntity } from "../../_lib/commercialRelationshipsDomain.js";

export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["GET", "POST", "PATCH"], permission: (method) => method === "GET" ? "commercial:relationships:view" : "commercial:relationships:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ req, context, input, prisma: database, method }) => method === "GET" ? listCommercialEntities(database, context, req.query) : method === "POST" ? createCommercialEntity(database, context, input) : updateCommercialEntity(database, context, input) });
