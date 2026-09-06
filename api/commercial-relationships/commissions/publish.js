import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { publishCommissionAgreement } from "../../_lib/commercialRelationshipsDomain.js";

export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["POST"], permission: "commercial:commissions:manage", status: 201, execute: ({ context, input, prisma: database }) => publishCommissionAgreement(database, context, input) });
