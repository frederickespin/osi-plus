import { prisma } from "../../../_lib/db.js";
import { assignPipelineCaseOwner } from "../../../_lib/pipelineCaseDomain.js";
import { createAssignOwnerHandler } from "../../../_lib/pipelineCaseMutationHttp.js";

export const createPipelineAssignOwnerHandler = (options = {}) => createAssignOwnerHandler({
  execute: assignPipelineCaseOwner,
  prismaClient: prisma,
  ...options,
});

export default createPipelineAssignOwnerHandler();
