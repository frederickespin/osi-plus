import { prisma } from "../../_lib/db.js";
import { normalizeStorageAgreementSave } from "../../_lib/customerCustodyContract.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";
import { getStorageAgreementWorkspace, saveStorageAgreement } from "../../_lib/storageAgreementDomain.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: ["customer-custody:authorize", "services:case:update"],
  normalize: normalizeStorageAgreementSave,
  execute: ({ req, context, input, prisma: database, method }) => method === "GET" ? getStorageAgreementWorkspace(database, context, req.query) : saveStorageAgreement(database, context, input),
});
