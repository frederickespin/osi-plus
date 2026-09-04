import { prisma } from "../../../_lib/db.js";
import { createCrmSurveyHandler } from "../../../_lib/crmSurveyHttp.js";
import { actOnSurveyAssignment } from "../../../_lib/crmSurveyDomain.js";
export default createCrmSurveyHandler({ prismaClient: prisma, methods: ["PATCH"], execute: ({ context, input, prisma: database, req }) => actOnSurveyAssignment(context, req.query?.assignmentRef, input, database) });
