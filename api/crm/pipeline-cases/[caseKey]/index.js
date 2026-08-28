import { prisma } from "../../../_lib/db.js";
import {
  findCrmPipelineCase,
} from "../../../_lib/crmPipelineRead.js";
import { requireCrmPipelinePermissionResponse } from "../../../_lib/crmPipelineAccess.js";
import { createCrmPipelineReadHandler } from "../../../_lib/crmPipelineReadHttp.js";
import { createCrmCaseMutationHandler, isMutationPreflight } from "../../../_lib/crmCaseMutationHttp.js";
import { updateCrmPipelineCase } from "../../../_lib/crmCaseMutationDomain.js";

export function createPipelineCaseDetailHandler({
  prismaClient = prisma,
  requirePermission = requireCrmPipelinePermissionResponse,
  env = process.env,
} = {}) {
  return createCrmPipelineReadHandler({
    env,
    prismaClient,
    requirePermission,
    execute: ({ req, context, prisma: database }) => findCrmPipelineCase(database, {
      tenantId: context.tenantId,
      role: context.role,
      membershipId: context.membershipId,
      userId: context.userId,
      caseRef: req.query?.caseKey,
    }),
    response: (data) => ({ ok: true, data }),
  });
}

const readHandler = createPipelineCaseDetailHandler();
const updateHandler = createCrmCaseMutationHandler({
  prismaClient: prisma,
  method: "PATCH",
  execute: ({ req, context, body, prisma: database }) => updateCrmPipelineCase(context, req.query?.caseKey, body, database),
});

export default function pipelineCaseHandler(req, res) {
  if (req.method === "PATCH" || isMutationPreflight(req, "PATCH")) return updateHandler(req, res);
  return readHandler(req, res);
}
