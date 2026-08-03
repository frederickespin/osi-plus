import { appendCommercialAudit } from "./commercialAuditLog.js";
import { resolveLogisticsActor, serializable } from "./logisticsGeoSupport.js";

export const CRATE_SETTINGS_PERMISSIONS = Object.freeze({
  VIEW: "crate_settings:view",
  MANAGE: "crate_settings:manage",
  APPROVE: "crate_settings:approve",
  ACTIVATE: "crate_settings:activate",
  RETIRE: "crate_settings:retire",
  IMPORT: "crate_settings:import",
  MODE_CHANGE: "crate_settings:mode:change",
  SHADOW_COMPARE: "crate_settings:shadow:compare",
  SNAPSHOT_CREATE: "crate_settings:snapshot:create",
});

export function resolveCrateSettingsActor(db, context, permission, options) {
  return resolveLogisticsActor(db, context, permission, options);
}

export function crateSettingsAuditContext(actor) {
  return actor.kind === "SYSTEM"
    ? { tenantId: actor.tenantId, actorKind: "SYSTEM" }
    : { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId };
}

export function auditCrateSettings(tx, actor, event, writer = appendCommercialAudit) {
  return writer(tx, crateSettingsAuditContext(actor), {
    source: "DB01J_CRATE_SETTINGS",
    critical: true,
    ...event,
  });
}

export { serializable };
