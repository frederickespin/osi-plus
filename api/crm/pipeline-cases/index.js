import { prisma } from "../../_lib/db.js";
import {
  listCrmPipelineCases,
  parsePipelineListQuery,
} from "../../_lib/crmPipelineRead.js";
import { requireCrmPipelinePermissionResponse } from "../../_lib/crmPipelineAccess.js";
import { createCrmPipelineReadHandler } from "../../_lib/crmPipelineReadHttp.js";
import { createCrmCaseMutationHandler, isMutationPreflight } from "../../_lib/crmCaseMutationHttp.js";
import { createCrmPipelineCase } from "../../_lib/crmCaseMutationDomain.js";

export function createPipelineCasesListHandler({
  prismaClient = prisma,
  requirePermission = requireCrmPipelinePermissionResponse,
  env = process.env,
} = {}) {
  return createCrmPipelineReadHandler({
    env,
    prismaClient,
    requirePermission,
    execute: ({ req, context, prisma: database }) => listCrmPipelineCases(database, {
      tenantId: context.tenantId,
      filters: parsePipelineListQuery(req.query),
    }),
    response: (result) => ({ ok: true, ...result }),
  });
}

const readHandler = createPipelineCasesListHandler();
const createHandler = createCrmCaseMutationHandler({
  prismaClient: prisma,
  method: "POST",
  status: 201,
  execute: ({ context, body, prisma: database }) => createCrmPipelineCase(context, body, database),
});

export default function pipelineCasesHandler(req, res) {
  if (req.method === "POST" || isMutationPreflight(req, "POST")) return createHandler(req, res);
  return readHandler(req, res);
}
