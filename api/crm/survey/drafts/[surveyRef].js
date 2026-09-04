import { prisma } from "../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../_lib/crmSurveyHttp.js";
import { getSurveyDraft, mutateSurveyDraft } from "../../../_lib/crmSurveyDomain.js";
export default createCrmSurveyHandler({ prismaClient: prisma, methods: ["GET", "PATCH"], execute: ({ context, input, prisma: database, method, req }) => method === "GET" ? getSurveyDraft(context, req.query?.surveyRef, database) : mutateSurveyDraft(context, req.query?.surveyRef, input, database) });

