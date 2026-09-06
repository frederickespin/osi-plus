import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { getCommercialRelationshipsWorkspace } from "../../_lib/commercialRelationshipsDomain.js";

export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["GET"], permission: "commercial:relationships:view", execute: ({ context, prisma: database }) => getCommercialRelationshipsWorkspace(database, context) });
