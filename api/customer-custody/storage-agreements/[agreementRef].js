import { prisma } from "../../_lib/db.js";
import { normalizeStorageAgreementActivate } from "../../_lib/customerCustodyContract.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";
import { activateStorageAgreement } from "../../_lib/storageAgreementDomain.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["PATCH"],
  permission: ["customer-custody:authorize", "services:case:update"],
  normalize: (value, req) => normalizeStorageAgreementActivate(value, req.query.agreementRef),
  execute: ({ context, input, prisma: database }) => activateStorageAgreement(database, context, input),
});
