import { prisma } from "../../../_lib/db.js";
import { publishCommunicationTemplate } from "../../../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../../../_lib/communicationsHttp.js";
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["POST"], permission: "communications:templates:manage", execute: ({ req, prisma: db, context, input }) => publishCommunicationTemplate(db, context, req.query?.templateRef, input) });
