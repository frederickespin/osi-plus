import { prisma } from "../../_lib/db.js";
import { createExternalClientTemporaryHandler } from "../../_lib/clientTemporaryAccessHttp.js";
import { saveClientMiniSurvey } from "../../_lib/clientTemporaryAccessDomain.js";

export default createExternalClientTemporaryHandler({
  prismaClient: prisma,
  execute: ({ accessRef, token, input, prisma: database }) => saveClientMiniSurvey(accessRef, token, input, database),
});
