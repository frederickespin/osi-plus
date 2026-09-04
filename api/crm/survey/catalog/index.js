import { prisma } from "../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../_lib/crmSurveyHttp.js";
import { createSurveyCatalog, getSurveyCatalog } from "../../../_lib/crmSurveyDomain.js";
export default createCrmSurveyHandler({ prismaClient: prisma, methods: ["GET", "POST"], execute: ({ context, input, prisma: database, method }) => method === "GET" ? getSurveyCatalog(context, database) : createSurveyCatalog(context, input, database) });

