import { prisma } from "../../_lib/db.js";
import { getTransportWorkspace, TRANSPORT_PLAN_PERMISSIONS } from "../../_lib/logisticsTransportDomain.js";
import { createLogisticsTransportHandler } from "../../_lib/logisticsTransportHttp.js";
export default createLogisticsTransportHandler({ prismaClient: prisma, methods: ["GET"], permissions: TRANSPORT_PLAN_PERMISSIONS.VIEW, execute: ({ prisma: db, context, req }) => getTransportWorkspace(db, context, req.query) });
