import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { publishCommercialInstruction } from "../../_lib/commercialRelationshipsDomain.js";
export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["POST"], permission: "commercial:relationships:manage", status: 201, execute: ({ context, input, prisma: database }) => publishCommercialInstruction(database, context, input) });
