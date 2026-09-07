import { prisma } from "../_lib/db.js";
import { listCommunicationVariables } from "../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../_lib/communicationsHttp.js";
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["GET"], permission: "communications:templates:view", execute: ({ context }) => listCommunicationVariables(context) });
