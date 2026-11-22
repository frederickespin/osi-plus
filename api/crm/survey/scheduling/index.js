import { prisma } from "../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../_lib/crmSurveyHttp.js";
import { getSurveySchedulingWorkspace, mutateSurveyScheduling } from "../../../_lib/surveySchedulingDomain.js";

export default createCrmSurveyHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  execute: ({ context, input, prisma: database, method, req }) => method === "GET"
    ? getSurveySchedulingWorkspace(context, {
        caseRef: req.query?.caseRef,
        date: req.query?.date,
        visitLocation: req.query?.visitLocation,
        time: req.query?.time,
        durationMinutes: req.query?.durationMinutes,
        mode: req.query?.mode,
        method: req.query?.method,
      }, database)
    : mutateSurveyScheduling(context, input, database),
});
