import { prisma } from "../../_lib/db.js";
import { normalizeStorageRequirementSave } from "../../_lib/customerCustodyContract.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";
import { getStorageRequirementWorkspace, saveStorageRequirement } from "../../_lib/storageRequirementDomain.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: ["customer-custody:authorize", "services:case:update"],
  normalize: normalizeStorageRequirementSave,
  execute: ({ req, context, input, prisma: database, method }) => method === "GET"
    ? getStorageRequirementWorkspace(database, context, req.query)
    : saveStorageRequirement(database, context, input),
});
