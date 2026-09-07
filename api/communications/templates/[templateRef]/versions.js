import { prisma } from "../../../_lib/db.js";
import { createCommunicationDraftVersion, updateCommunicationDraft } from "../../../_lib/communicationsDomain.js";
import { createCommunicationsHandler } from "../../../_lib/communicationsHttp.js";
export default createCommunicationsHandler({ prismaClient: prisma, methods: ["POST", "PATCH"], permission: "communications:templates:manage", status: (method) => method === "POST" ? 201 : 200, execute: ({ req, prisma: db, context, input, method }) => method === "POST" ? createCommunicationDraftVersion(db, context, req.query?.templateRef, input) : updateCommunicationDraft(db, context, req.query?.templateRef, input) });
