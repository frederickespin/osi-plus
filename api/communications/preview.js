import { prisma } from "../_lib/db.js";
import { normalizePreview } from "../_lib/communicationsContract.js";
import { previewCommunication } from "../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../_lib/communicationsHttp.js";
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["POST"], permission: "communications:templates:view", execute: ({ context, input }) => previewCommunication(context, normalizePreview(input)) });
