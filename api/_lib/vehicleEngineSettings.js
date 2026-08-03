import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { canonicalJson, sha256 } from "./geoNormalization.js";
import { LogisticsGeoError, asDate, asNumber, json, optionalText, requiredText } from "./logisticsGeoSupport.js";
import { VEHICLE_PERMISSIONS, auditVehicle, resolveVehicleActor, serializable } from "./vehicleEngineSupport.js";

function normalize(input = {}) {
  const scopeKey = requiredText(input.scopeKey || "GLOBAL", "scopeKey", 120).toUpperCase();
  const operationMode = String(input.operationMode || "LEGACY_ONLY").toUpperCase();
  if (!["LEGACY_ONLY", "SHADOW", "ENFORCED"].includes(operationMode)) throw new LogisticsGeoError("Modo inválido.", { code: "VEHICLE_SETTINGS_INPUT_INVALID", status: 400 });
  const weightUnit = String(input.weightUnit || "KG").toUpperCase();
  const volumeUnit = String(input.volumeUnit || "CBM").toUpperCase();
  const distanceUnit = String(input.distanceUnit || "KM").toUpperCase();
  if (!["KG", "LB"].includes(weightUnit) || !["CBM", "CFT"].includes(volumeUnit) || !["KM", "MI"].includes(distanceUnit)) throw new LogisticsGeoError("Unidades inválidas.", { code: "VEHICLE_SETTINGS_INPUT_INVALID", status: 400 });
  const settings = {
    allowManualOverride: input.allowManualOverride !== false,
    requireApprovalIfOverride: input.requireApprovalIfOverride === true,
    distributeWearAutomatically: input.distributeWearAutomatically !== false,
    considerUpcomingMaintenance: input.considerUpcomingMaintenance !== false,
    blockIfNoVehicle: input.blockIfNoVehicle === true,
    capacityUtilizationPercent: asNumber(input.capacityUtilizationPercent ?? 85, "capacityUtilizationPercent", { nullable: false, min: 0.001, max: 100 }),
    weightUnit, volumeUnit, distanceUnit,
    parameters: input.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters) ? input.parameters : {},
  };
  const validFrom = asDate(input.validFrom, "validFrom");
  const validTo = asDate(input.validTo, "validTo");
  if (validFrom && validTo && validTo <= validFrom) throw new LogisticsGeoError("Vigencia inválida.", { code: "VEHICLE_SETTINGS_INPUT_INVALID", status: 400 });
  const settingsHash = sha256(canonicalJson(settings));
  return {
    scopeKey, operationMode, settings, settingsHash, validFrom, validTo,
    name: requiredText(input.name || `Motor de vehículos ${scopeKey}`, "name", 160),
    source: requiredText(input.source || "ADMIN", "source", 80).toUpperCase(),
    evidence: input.evidence && typeof input.evidence === "object" && !Array.isArray(input.evidence) ? input.evidence : {},
  };
}

function dto(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, seriesId: row.series_id, scopeKey: row.scope_key, version: row.version,
    name: row.name, state: row.state, operationMode: row.operation_mode, allowManualOverride: row.allow_manual_override,
    requireApprovalIfOverride: row.require_approval_if_override, distributeWearAutomatically: row.distribute_wear_automatically,
    considerUpcomingMaintenance: row.consider_upcoming_maintenance, blockIfNoVehicle: row.block_if_no_vehicle,
    capacityUtilizationPercent: Number(row.capacity_utilization_percent), weightUnit: row.weight_unit, volumeUnit: row.volume_unit,
    distanceUnit: row.distance_unit, parameters: row.settings_json, settingsHash: row.settings_hash, validFrom: row.valid_from,
    validTo: row.valid_to, versionHash: row.version_hash, replacesSettingsId: row.replaces_settings_id, source: row.source,
    evidence: row.evidence_json, rowVersion: row.row_version, approvedAt: row.approved_at, activatedAt: row.activated_at,
    retiredAt: row.retired_at, requestId: row.request_id, createdByMembershipId: row.created_by_membership_id,
    approvedByMembershipId: row.approved_by_membership_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function createVehicleEngineSettingsVersion(prisma, context, input, options = {}) {
  const normalized = normalize(input);
  const requestId = requiredText(input.requestId, "requestId", 191);
  return serializable(prisma, async (tx) => {
    const actor = await resolveVehicleActor(tx, context, VEHICLE_PERMISSIONS.SETTINGS_MANAGE);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:vehicle-settings:${requestId}`}, 0))`);
    const previousRequest = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicle_engine_settings" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`);
    const payloadHash = sha256(canonicalJson(normalized));
    if (previousRequest[0]) {
      if (previousRequest[0].payload_hash !== payloadHash) throw new LogisticsGeoError("requestId reutilizado con otra configuración.", { code: "VEHICLE_SETTINGS_IDEMPOTENCY_CONFLICT", status: 409 });
      return { settings: dto(previousRequest[0]), idempotent: true };
    }
    const replacesSettingsId = optionalText(input.replacesSettingsId, 191);
    let seriesId = randomUUID();
    let version = 1;
    let replacedSettings = null;
    if (replacesSettingsId) {
      const replaced = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicle_engine_settings" WHERE "tenant_id"=${actor.tenantId} AND "id"=${replacesSettingsId} LIMIT 1`);
      if (!replaced[0]) throw new LogisticsGeoError("Configuración anterior no encontrada.", { code: "VEHICLE_SETTINGS_NOT_FOUND", status: 404 });
      replacedSettings = replaced[0];
      seriesId = replacedSettings.series_id;
      version = Number(replacedSettings.version) + 1;
      if (replacedSettings.operation_mode !== normalized.operationMode) {
        await resolveVehicleActor(tx, context, VEHICLE_PERMISSIONS.MODE_CHANGE);
      }
    }
    const id = randomUUID();
    const versionHash = sha256(canonicalJson({ tenantId: actor.tenantId, seriesId, version, normalized }));
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."osi_vehicle_engine_settings"(
        "id","tenant_id","series_id","scope_key","version","name","operation_mode","allow_manual_override","require_approval_if_override",
        "distribute_wear_automatically","consider_upcoming_maintenance","block_if_no_vehicle","capacity_utilization_percent","weight_unit","volume_unit",
        "distance_unit","settings_json","settings_hash","valid_from","valid_to","version_hash","replaces_settings_id","source","evidence_json",
        "created_by_user_id","created_by_membership_id","request_id","payload_hash"
      ) VALUES (
        ${id},${actor.tenantId},${seriesId},${normalized.scopeKey},${version},${normalized.name},CAST(${normalized.operationMode} AS "osi"."LogisticsOperationMode"),
        ${normalized.settings.allowManualOverride},${normalized.settings.requireApprovalIfOverride},${normalized.settings.distributeWearAutomatically},
        ${normalized.settings.considerUpcomingMaintenance},${normalized.settings.blockIfNoVehicle},${normalized.settings.capacityUtilizationPercent},
        ${normalized.settings.weightUnit},${normalized.settings.volumeUnit},${normalized.settings.distanceUnit},CAST(${json(normalized.settings.parameters)} AS jsonb),
        ${normalized.settingsHash},${normalized.validFrom},${normalized.validTo},${versionHash},${replacesSettingsId},${normalized.source},CAST(${json(normalized.evidence)} AS jsonb),
        ${actor.userId},${actor.membershipId},${requestId},${payloadHash}
      ) RETURNING *
    `);
    await auditVehicle(tx, actor, { action: "VEHICLE_SETTINGS_VERSION_CREATED", entity: "VEHICLE_ENGINE_SETTINGS", entityId: id, requestId, afterJson: dto(rows[0]) }, options.auditWriter);
    if (replacedSettings && replacedSettings.operation_mode !== normalized.operationMode) {
      await auditVehicle(tx, actor, {
        action: "VEHICLE_ENGINE_MODE_CHANGED",
        entity: "VEHICLE_ENGINE_SETTINGS",
        entityId: id,
        requestId,
        beforeJson: { operationMode: replacedSettings.operation_mode, settingsId: replacedSettings.id },
        afterJson: { operationMode: normalized.operationMode, settingsId: id },
      }, options.auditWriter);
    }
    return { settings: dto(rows[0]), idempotent: false };
  });
}

async function transition(prisma, context, input, target, options = {}) {
  const permission = target === "ACTIVE" || target === "SHADOW" ? VEHICLE_PERMISSIONS.SETTINGS_ACTIVATE : target === "RETIRED" ? VEHICLE_PERMISSIONS.SETTINGS_RETIRE : VEHICLE_PERMISSIONS.SETTINGS_APPROVE;
  return serializable(prisma, async (tx) => {
    const actor = await resolveVehicleActor(tx, context, permission);
    const id = requiredText(input.id, "id");
    const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicle_engine_settings" WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} FOR UPDATE`);
    const current = rows[0];
    if (!current) throw new LogisticsGeoError("Configuración no encontrada.", { code: "VEHICLE_SETTINGS_NOT_FOUND", status: 404 });
    if (Number(current.row_version) !== Number(input.expectedVersion)) throw new LogisticsGeoError("La configuración cambió.", { code: "VEHICLE_SETTINGS_VERSION_CONFLICT", status: 409 });
    if (target === "APPROVED" && (current.state !== "DRAFT" || current.approved_at)) throw new LogisticsGeoError("Transición inválida.", { code: "VEHICLE_SETTINGS_STATE_INVALID", status: 409 });
    if (target === "APPROVED" && current.created_by_membership_id === actor.membershipId) throw new LogisticsGeoError("El creador no puede aprobar.", { code: "VEHICLE_SETTINGS_SEPARATION_OF_DUTIES", status: 403 });
    if (["ACTIVE", "SHADOW"].includes(target) && (current.state !== "DRAFT" || !current.approved_at)) throw new LogisticsGeoError("La configuración debe estar aprobada.", { code: "VEHICLE_SETTINGS_STATE_INVALID", status: 409 });
    if (target === "SHADOW" && options.allowShadowActivation !== true) throw new LogisticsGeoError("SHADOW permanece deshabilitado.", { code: "VEHICLE_ENGINE_SHADOW_DISABLED", status: 409 });
    if (target === "ACTIVE" && current.operation_mode === "ENFORCED") throw new LogisticsGeoError("ENFORCED permanece deshabilitado.", { code: "VEHICLE_ENGINE_ENFORCED_DISABLED", status: 409 });
    if (target === "ACTIVE" && current.operation_mode === "SHADOW" && options.allowShadowActivation !== true) throw new LogisticsGeoError("SHADOW permanece deshabilitado.", { code: "VEHICLE_ENGINE_SHADOW_DISABLED", status: 409 });
    if (target === "RETIRED" && !["DRAFT", "SHADOW", "ACTIVE"].includes(current.state)) throw new LogisticsGeoError("Transición inválida.", { code: "VEHICLE_SETTINGS_STATE_INVALID", status: 409 });
    if (target === "ACTIVE") {
      const active = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicle_engine_settings" WHERE "tenant_id"=${actor.tenantId} AND "scope_key"=${current.scope_key} AND "state"='ACTIVE' AND "id"<>${id} LIMIT 1 FOR UPDATE`);
      if (active[0]) {
        if (input.replaceActive !== true || current.replaces_settings_id !== active[0].id) {
          await auditVehicle(tx, actor, { action: "VEHICLE_SETTINGS_CONTRADICTION_DETECTED", entity: "VEHICLE_ENGINE_SETTINGS", entityId: id, requestId: requiredText(input.requestId, "requestId"), metadataJson: { activeId: active[0].id, scopeKey: current.scope_key } }, options.auditWriter);
          return { rejected: new LogisticsGeoError("Ya existe una configuración activa para el alcance.", { code: "VEHICLE_SETTINGS_CONTRADICTION", status: 409 }) };
        }
        await tx.$executeRaw(Prisma.sql`UPDATE "osi"."osi_vehicle_engine_settings" SET "state"='RETIRED',"retired_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1,"updated_at"=CURRENT_TIMESTAMP WHERE "tenant_id"=${actor.tenantId} AND "id"=${active[0].id}`);
      }
    }
    const requestId = requiredText(input.requestId, "requestId");
    const databaseState = target === "APPROVED" ? current.state : target;
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."osi_vehicle_engine_settings" SET "state"=CAST(${databaseState} AS "osi"."LogisticsConfigState"),
        "approved_by_user_id"=CASE WHEN ${target}='APPROVED' THEN ${actor.userId} ELSE "approved_by_user_id" END,
        "approved_by_membership_id"=CASE WHEN ${target}='APPROVED' THEN ${actor.membershipId} ELSE "approved_by_membership_id" END,
        "approved_at"=CASE WHEN ${target}='APPROVED' THEN CURRENT_TIMESTAMP ELSE "approved_at" END,
        "activated_at"=CASE WHEN ${target} IN ('ACTIVE','SHADOW') THEN CURRENT_TIMESTAMP ELSE "activated_at" END,
        "retired_at"=CASE WHEN ${target}='RETIRED' THEN CURRENT_TIMESTAMP ELSE "retired_at" END,
        "row_version"="row_version"+1,"updated_at"=CURRENT_TIMESTAMP WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} RETURNING *
    `);
    await auditVehicle(tx, actor, { action: `VEHICLE_SETTINGS_${target}`, entity: "VEHICLE_ENGINE_SETTINGS", entityId: id, requestId, beforeJson: dto(current), afterJson: dto(updated[0]) }, options.auditWriter);
    return { settings: dto(updated[0]) };
  }).then((result) => { if (result?.rejected) throw result.rejected; return result; });
}

export function approveVehicleEngineSettings(prisma, context, input, options) { return transition(prisma, context, input, "APPROVED", options); }
export function activateVehicleEngineSettings(prisma, context, input, options) { return transition(prisma, context, input, "ACTIVE", options); }
export function activateVehicleEngineShadow(prisma, context, input, options) { return transition(prisma, context, input, "SHADOW", options); }
export function retireVehicleEngineSettings(prisma, context, input, options) { return transition(prisma, context, input, "RETIRED", options); }

export function compareVehicleEngineShadow(legacy, relational) {
  const keys = ["blockIfNoVehicle", "allowManualOverride", "requireApprovalIfOverride", "distributeWearAutomatically", "considerUpcomingMaintenance", "capacityUtilizationPercent"];
  const differences = keys.filter((key) => legacy?.[key] !== relational?.[key]).map((key) => ({ field: key, legacy: legacy?.[key] ?? null, relational: relational?.[key] ?? null }));
  return { mode: "SHADOW_PREVIEW_ONLY", authority: "LEGACY", effectsApplied: false, equivalent: differences.length === 0, differences, comparisonHash: sha256(canonicalJson({ legacy, relational })) };
}

export const __vehicleSettingsInternals = Object.freeze({ normalize, dto });
