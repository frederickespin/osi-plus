import { prisma } from "../../_lib/db.js";
import { normalizeCustodyPreviewReset } from "../../_lib/customerCustodyContract.js";
import { resetCustomerCustodyReceptionForPreview } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({ prismaClient: prisma, methods: ["POST"], permission: "customer-custody:operate", normalize: normalizeCustodyPreviewReset, execute: ({ context, input, prisma: database }) => resetCustomerCustodyReceptionForPreview(database, context, input) });
