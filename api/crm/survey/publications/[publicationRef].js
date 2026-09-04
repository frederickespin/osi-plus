import { prisma } from "../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../_lib/crmSurveyHttp.js";
import { getSurveyPublication } from "../../../_lib/crmSurveyDomain.js";
export default createCrmSurveyHandler({ prismaClient: prisma, methods: ["GET"], execute: ({ context, prisma: database, req }) => getSurveyPublication(context, req.query?.publicationRef, database) });

