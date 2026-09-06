import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { publishReferralAgreement } from "../../_lib/commercialRelationshipsDomain.js";

export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["POST"], permission: "commercial:referrals:manage", status: 201, execute: ({ context, input, prisma: database }) => publishReferralAgreement(database, context, input) });
