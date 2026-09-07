import { prisma } from "../_lib/db.js";
import { listCommunicationRecipients } from "../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../_lib/communicationsHttp.js";
import { communicationFail } from "../_lib/communicationsContract.js";
function body(input) { const allowed = new Set(["caseRef", "audience", "surveyAssignmentRef", "quoteRevisionRef"]); if (!input || Object.keys(input).some((key) => !allowed.has(key)) || typeof input.caseRef !== "string") communicationFail("COMMUNICATION_INPUT_INVALID"); return input; }
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["POST"], permission: "communications:prepare", execute: ({ prisma: db, context, input }) => { const value = body(input); return listCommunicationRecipients(db, context, value.caseRef, value); } });
