import { prisma } from "../_lib/db.js";
import { createCrmOwnerCatalogHandler } from "../_lib/crmOwnerCatalogHttp.js";

export const createPipelineOwnerOptionsHandler = (options = {}) => createCrmOwnerCatalogHandler({
  prismaClient: prisma,
  ...options,
});

export default createPipelineOwnerOptionsHandler();
