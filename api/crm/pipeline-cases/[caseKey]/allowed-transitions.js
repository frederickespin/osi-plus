import { prisma } from "../../../_lib/db.js";
import { requireCrmPipelineReadOnly } from "../../../_lib/crmPipelineRead.js";
import { getAllowedPipelineTransitions } from "../../../_lib/pipelineCaseDomain.js";
import { createAllowedTransitionsHandler } from "../../../_lib/pipelineCaseMutationHttp.js";

export const createPipelineAllowedTransitionsHandler = (options = {}) => createAllowedTransitionsHandler({
  execute: getAllowedPipelineTransitions,
  requireReadMode: requireCrmPipelineReadOnly,
  prismaClient: prisma,
  ...options,
});

export default createPipelineAllowedTransitionsHandler();
