import { prisma } from "../../_lib/db.js";
import { publishTransport, TRANSPORT_PLAN_PERMISSIONS } from "../../_lib/logisticsTransportDomain.js";
import { createLogisticsTransportHandler } from "../../_lib/logisticsTransportHttp.js";
export default createLogisticsTransportHandler({ prismaClient: prisma, methods: ["POST"], permissions: TRANSPORT_PLAN_PERMISSIONS.PUBLISH, status: 201, execute: ({ prisma: db, context, input }) => publishTransport(db, context, input) });
