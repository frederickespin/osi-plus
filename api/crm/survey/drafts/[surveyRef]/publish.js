import { prisma } from "../../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../../_lib/crmSurveyHttp.js";
import { publishSurvey } from "../../../../_lib/crmSurveyDomain.js";
export default createCrmSurveyHandler({ prismaClient: prisma, methods: ["POST"], execute: ({ context, input, prisma: database, req }) => publishSurvey(context, req.query?.surveyRef, input, database) });

