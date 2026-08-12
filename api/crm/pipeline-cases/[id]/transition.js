import { prisma } from "../../../_lib/db.js";
import { transitionPipelineCase } from "../../../_lib/pipelineCaseDomain.js";
import { createTransitionHandler } from "../../../_lib/pipelineCaseMutationHttp.js";

export const createPipelineTransitionHandler = (options = {}) => createTransitionHandler({
  execute: transitionPipelineCase,
  prismaClient: prisma,
  ...options,
});

export default createPipelineTransitionHandler();

