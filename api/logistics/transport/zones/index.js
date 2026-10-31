import { prisma } from "../../../_lib/db.js";
import { createLogisticsTransportHandler } from "../../../_lib/logisticsTransportHttp.js";
import {
  listTransportZones, TRANSPORT_ZONE_PERMISSIONS, versionTransportZone,
} from "../../../_lib/logisticsTransportZones.js";

export default createLogisticsTransportHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permissions: (method) => method === "GET" ? TRANSPORT_ZONE_PERMISSIONS.VIEW : TRANSPORT_ZONE_PERMISSIONS.MANAGE,
  status: (method) => method === "POST" ? 201 : 200,
  execute: ({ prisma: db, context, input, req, method }) => method === "GET"
    ? listTransportZones(db, context, req.query)
    : versionTransportZone(db, context, input),
});
