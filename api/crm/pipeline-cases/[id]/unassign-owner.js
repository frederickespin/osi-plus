import { prisma } from "../../../_lib/db.js";
import { unassignPipelineCaseOwner } from "../../../_lib/pipelineCaseDomain.js";
import { createUnassignOwnerHandler } from "../../../_lib/pipelineCaseMutationHttp.js";

export const createPipelineUnassignOwnerHandler = (options = {}) => createUnassignOwnerHandler({
  execute: unassignPipelineCaseOwner,
  prismaClient: prisma,
  ...options,
});

export default createPipelineUnassignOwnerHandler();

