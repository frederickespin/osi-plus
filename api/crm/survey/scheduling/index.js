import { prisma } from "../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../_lib/crmSurveyHttp.js";
import { getSurveySchedulingWorkspace, mutateSurveyScheduling } from "../../../_lib/surveySchedulingDomain.js";

export default createCrmSurveyHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? getSurveySchedulingWorkspace(context, { caseRef: req.query?.caseRef, date: req.query?.date }, database)
    : mutateSurveyScheduling(context, input, database),
});
