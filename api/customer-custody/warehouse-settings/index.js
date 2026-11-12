import { prisma } from "../../_lib/db.js";
import { normalizeCustodyWarehouseSetting } from "../../_lib/customerCustodyContract.js";
import { listCustodyWarehouseSettings, updateCustodyWarehouseSetting } from "../../_lib/customerCustodyDomain.js";
import { createCustomerCustodyHandler } from "../../_lib/customerCustodyHttp.js";

export default createCustomerCustodyHandler({
  prismaClient: prisma,
  methods: ["GET", "PATCH"],
  permission: "warehouse-access:manage",
  normalize: normalizeCustodyWarehouseSetting,
  execute: ({ context, input, prisma: database, method }) => method === "GET"
    ? listCustodyWarehouseSettings(database, context)
    : updateCustodyWarehouseSetting(database, context, input),
});
