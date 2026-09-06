import { prisma } from "../../_lib/db.js";
import { createCommercialRelationshipsHandler } from "../../_lib/commercialRelationshipsHttp.js";
import { publishPricingAgreement } from "../../_lib/commercialRelationshipsDomain.js";

export default createCommercialRelationshipsHandler({ prismaClient: prisma, methods: ["POST"], permission: "commercial:tariffs:manage", status: 201, execute: ({ context, input, prisma: database }) => publishPricingAgreement(database, context, input) });
