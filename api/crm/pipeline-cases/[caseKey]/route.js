import { prisma } from "../../../_lib/db.js";
import { createCrmPipelineReadHandler } from "../../../_lib/crmPipelineReadHttp.js";
import { createCrmCaseMutationHandler, isMutationPreflight } from "../../../_lib/crmCaseMutationHttp.js";
import { getCaseRouteEditor, updateCaseRoute } from "../../../_lib/crmCaseRouteDomain.js";

const readHandler = createCrmPipelineReadHandler({
  prismaClient: prisma,
  execute: ({ req, context, prisma: database }) => getCaseRouteEditor(context, req.query?.caseKey, database),
  response: (data) => ({ ok: true, data }),
});
const updateHandler = createCrmCaseMutationHandler({
  prismaClient: prisma,
  method: "PATCH",
  execute: async ({ req, context, body, prisma: database }) => {
    const saved = await updateCaseRoute(context, req.query?.caseKey, body, database);
    return { case: { caseRef: saved.caseRef, version: saved.version }, replayed: false };
  },
});

export default function routeHandler(req, res) {
  if (req.method === "PATCH" || isMutationPreflight(req, "PATCH")) return updateHandler(req, res);
  return readHandler(req, res);
}
