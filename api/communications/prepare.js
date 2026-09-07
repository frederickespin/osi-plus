import { prisma } from "../_lib/db.js";
import { prepareCommunication } from "../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../_lib/communicationsHttp.js";
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["POST"], permission: "communications:prepare", status: 201, execute: ({ prisma: db, context, input }) => prepareCommunication(db, context, input) });
