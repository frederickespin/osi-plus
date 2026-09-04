import { prisma } from "../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../_lib/crmSurveyHttp.js";
import { createSurveyAssignment, listSurveyAgenda } from "../../../_lib/crmSurveyDomain.js";
export default createCrmSurveyHandler({ prismaClient: prisma, methods: ["GET", "POST"], execute: ({ context, input, prisma: database, method }) => method === "GET" ? listSurveyAgenda(context, database) : createSurveyAssignment(context, input, database) });
