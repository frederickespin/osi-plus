import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { createAssociationMembership } from "../../_lib/commercialRelationshipsDomain.js";
export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["POST"], permission: "commercial:associations:manage", status: 201, execute: ({ context, input, prisma: database }) => createAssociationMembership(database, context, input) });
