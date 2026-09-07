import { prisma } from "../../_lib/db.js";
import { createCommunicationTemplate, listCommunicationTemplates } from "../../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../../_lib/communicationsHttp.js";
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["GET", "POST"], permission: (method) => method === "GET" ? "communications:templates:view" : "communications:templates:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ prisma: db, context, input, method }) => method === "GET" ? listCommunicationTemplates(db, context) : createCommunicationTemplate(db, context, input) });
