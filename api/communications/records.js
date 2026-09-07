import { prisma } from "../_lib/db.js";
import { listCommunicationRecords } from "../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../_lib/communicationsHttp.js";
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["GET"], permission: "communications:view", execute: ({ req, prisma: db, context }) => listCommunicationRecords(db, context, req.query?.caseRef) });
