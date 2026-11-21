import { prisma } from "../../_lib/db.js";
import { createLogisticsHandler } from "../../_lib/logisticsEngineHttp.js";
import {
  getLogisticsGeography,
  LOGISTICS_GEOGRAPHY_PERMISSIONS,
  saveLogisticsGeography,
} from "../../_lib/logisticsGeography.js";

export default createLogisticsHandler({
  prismaClient: prisma,
  methods: ["GET", "POST"],
  permission: (method) => method === "GET" ? LOGISTICS_GEOGRAPHY_PERMISSIONS.VIEW : LOGISTICS_GEOGRAPHY_PERMISSIONS.MANAGE,
  status: (method) => method === "POST" ? 201 : 200,
  execute: ({ prisma: db, context, input, req, method }) => method === "GET"
    ? getLogisticsGeography(db, context, req.query)
    : saveLogisticsGeography(db, context, input),
});
