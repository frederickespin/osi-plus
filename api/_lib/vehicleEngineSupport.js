import { appendCommercialAudit } from "./commercialAuditLog.js";
import { resolveLogisticsActor, serializable } from "./logisticsGeoSupport.js";

export const VEHICLE_PERMISSIONS = Object.freeze({
  VIEW: "vehicle:view",
  MANAGE: "vehicle:manage",
  STATUS: "vehicle:status",
  IMPORT: "vehicle:import",
  SETTINGS_MANAGE: "vehicle_engine:manage",
  SETTINGS_APPROVE: "vehicle_engine:approve",
  SETTINGS_ACTIVATE: "vehicle_engine:activate",
  SETTINGS_RETIRE: "vehicle_engine:retire",
  MODE_CHANGE: "vehicle_engine:mode:change",
  SHADOW_COMPARE: "vehicle_engine:shadow:compare",
});

export function resolveVehicleActor(db, context, permission, options) {
  return resolveLogisticsActor(db, context, permission, options);
}

export function vehicleAuditContext(actor) {
  return actor.kind === "SYSTEM" ? { tenantId: actor.tenantId, actorKind: "SYSTEM" } : { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId };
}

export function auditVehicle(tx, actor, event, writer = appendCommercialAudit) {
  return writer(tx, vehicleAuditContext(actor), { source: "DB01I_VEHICLE_ENGINE", critical: true, ...event });
}

export { serializable };
