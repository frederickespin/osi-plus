import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { canonicalJson, sha256 } from "./geoNormalization.js";
import { LogisticsGeoError, json, requiredText } from "./logisticsGeoSupport.js";
import { normalizeCrateSettingsInput } from "./crateSettingsValidation.js";
import { CRATE_SETTINGS_PERMISSIONS, auditCrateSettings, resolveCrateSettingsActor } from "./crateSettingsSupport.js";

const SETTINGS_TABLE = Prisma.raw('"osi"."crate_settings_versions"');
const SNAPSHOT_TABLE = Prisma.raw('"osi"."crate_calculation_snapshots"');

function dto(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, seriesId: row.series_id, code: row.code, name: row.name, scope: row.scope,
    schemaVersion: Number(row.schema_version), businessVersion: Number(row.business_version), state: row.state,
    operationMode: row.operation_mode, technical: row.technical_json, economic: row.economic_json,
    catalogRefs: row.catalog_refs_json, units: row.units_json, currencyCode: row.currency_code,
    configuration: row.configuration_json, configurationHash: row.configuration_hash, versionHash: row.version_hash,
    validFrom: row.valid_from, validTo: row.valid_to, replacesSettingsId: row.replaces_settings_id,
    source: row.source, evidence: row.evidence_json, createdByUserId: row.created_by_user_id,
    createdByMembershipId: row.created_by_membership_id, approvedByUserId: row.approved_by_user_id,
    approvedByMembershipId: row.approved_by_membership_id, approvedAt: row.approved_at,
    activatedAt: row.activated_at, retiredAt: row.retired_at, requestId: row.request_id,
    rowVersion: Number(row.row_version), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function snapshotDto(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, calculationRef: row.calculation_ref, sourceEntity: row.source_entity,
    sourceEntityId: row.source_entity_id, settingsId: row.settings_id, settingsBusinessVersion: Number(row.settings_business_version),
    settingsHash: row.settings_hash, technicalSnapshot: row.technical_snapshot_json, economicSnapshot: row.economic_snapshot_json,
    unitsSnapshot: row.units_snapshot_json, currencyCode: row.currency_code, calculationInputHash: row.calculation_input_hash,
    calculationOutputHash: row.calculation_output_hash, source: row.source, requestId: row.request_id, createdAt: row.created_at,
  };
}

function error(message, code, status = 409) {
  return new LogisticsGeoError(message, { code, status });
}

function readCommitted(prisma, work) {
  return prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

function isUniqueViolation(cause) {
  return cause?.code === "P2010" && String(cause?.meta?.code || "") === "23505";
}

async function lockRequest(tx, tenantId, namespace, requestId) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${namespace}:${requestId}`}, 0))`);
}

export async function insertCrateSettingsDraft(tx, actor, normalized, input, options = {}) {
  const requestId = requiredText(input.requestId, "requestId", 191);
  await lockRequest(tx, actor.tenantId, "crate-settings", requestId);
  const payloadHash = sha256(canonicalJson(normalized));
  const previous = await tx.$queryRaw(Prisma.sql`SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`);
  if (previous[0]) {
    if (previous[0].payload_hash !== payloadHash) throw error("requestId reutilizado con otra configuración.", "CRATE_SETTINGS_IDEMPOTENCY_CONFLICT");
    return { settings: dto(previous[0]), idempotent: true };
  }
  let seriesId = randomUUID();
  let businessVersion = 1;
  let replaced = null;
  if (normalized.replacesSettingsId) {
    const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "id"=${normalized.replacesSettingsId} LIMIT 1`);
    replaced = rows[0];
    if (!replaced) throw error("Configuración anterior no encontrada.", "CRATE_SETTINGS_NOT_FOUND", 404);
    seriesId = replaced.series_id;
    businessVersion = Number(replaced.business_version) + 1;
    if (replaced.operation_mode !== normalized.operationMode) {
      await resolveCrateSettingsActor(tx, options.context, CRATE_SETTINGS_PERMISSIONS.MODE_CHANGE);
    }
  }
  const id = randomUUID();
  const versionHash = sha256(canonicalJson({ tenantId: actor.tenantId, seriesId, businessVersion, configurationHash: normalized.configurationHash }));
  let rows;
  try {
    rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO ${SETTINGS_TABLE}(
      "id","tenant_id","series_id","code","normalized_code","name","scope","schema_version","business_version","operation_mode",
      "technical_json","economic_json","catalog_refs_json","units_json","currency_code","configuration_json","configuration_hash","version_hash",
      "valid_from","valid_to","replaces_settings_id","source","evidence_json","created_by_user_id","created_by_membership_id","request_id","payload_hash"
    ) VALUES (
      ${id},${actor.tenantId},${seriesId},${normalized.code},${normalized.normalizedCode},${normalized.name},${normalized.scope},${normalized.schemaVersion},${businessVersion},
      CAST(${normalized.operationMode} AS "osi"."LogisticsOperationMode"),CAST(${json(normalized.technical)} AS jsonb),CAST(${json(normalized.economic)} AS jsonb),
      CAST(${json(normalized.catalogRefs)} AS jsonb),CAST(${json(normalized.units)} AS jsonb),${normalized.currencyCode},CAST(${json(normalized.configuration)} AS jsonb),
      ${normalized.configurationHash},${versionHash},${normalized.validFrom},${normalized.validTo},${normalized.replacesSettingsId},${normalized.source},
      CAST(${json(normalized.evidence)} AS jsonb),${actor.userId},${actor.membershipId},${requestId},${payloadHash}
      ) RETURNING *
    `);
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new LogisticsGeoError("El código y la versión ya existen en esta empresa.", {
        code: "CRATE_SETTINGS_DUPLICATE", status: 409, cause,
      });
    }
    throw cause;
  }
  await auditCrateSettings(tx, actor, { action: "CRATE_SETTINGS_DRAFT_CREATED", entity: "CRATE_SETTINGS", entityId: id, requestId, afterJson: dto(rows[0]) }, options.auditWriter);
  if (replaced && replaced.configuration_hash !== normalized.configurationHash) {
    await auditCrateSettings(tx, actor, {
      action: "CRATE_SETTINGS_PARAMETERS_CHANGED", entity: "CRATE_SETTINGS", entityId: id, requestId,
      beforeJson: { settingsId: replaced.id, configurationHash: replaced.configuration_hash },
      afterJson: { settingsId: id, configurationHash: normalized.configurationHash },
    }, options.auditWriter);
  }
  if (replaced && replaced.operation_mode !== normalized.operationMode) {
    await auditCrateSettings(tx, actor, {
      action: "CRATE_SETTINGS_MODE_CHANGED", entity: "CRATE_SETTINGS", entityId: id, requestId,
      beforeJson: { settingsId: replaced.id, operationMode: replaced.operation_mode },
      afterJson: { settingsId: id, operationMode: normalized.operationMode },
    }, options.auditWriter);
  }
  return { settings: dto(rows[0]), idempotent: false };
}

export function createCrateSettingsVersion(prisma, context, input, options = {}) {
  const normalized = normalizeCrateSettingsInput(input);
  // READ COMMITTED lets a waiter observe the transaction that released the requestId lock.
  return readCommitted(prisma, async (tx) => {
    const actor = await resolveCrateSettingsActor(tx, context, CRATE_SETTINGS_PERMISSIONS.MANAGE);
    return insertCrateSettingsDraft(tx, actor, normalized, input, { ...options, context });
  });
}

async function priorTransition(tx, actor, input, action) {
  if (!input.requestId) return null;
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT "entity_id" FROM "osi"."commercial_audit_logs"
    WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${input.requestId} AND "action"=${action}
      AND "entity"='CRATE_SETTINGS' AND "entity_id"=${input.id} LIMIT 1
  `);
  if (!rows[0]) return null;
  const settings = await tx.$queryRaw(Prisma.sql`SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "id"=${input.id} LIMIT 1`);
  return settings[0] ? { settings: dto(settings[0]), idempotent: true } : null;
}

async function transition(prisma, context, input, target, options = {}) {
  const permission = target === "APPROVED" ? CRATE_SETTINGS_PERMISSIONS.APPROVE
    : target === "RETIRED" ? CRATE_SETTINGS_PERMISSIONS.RETIRE : CRATE_SETTINGS_PERMISSIONS.ACTIVATE;
  const action = `CRATE_SETTINGS_${target}`;
  return readCommitted(prisma, async (tx) => {
    const actor = await resolveCrateSettingsActor(tx, context, permission);
    const id = requiredText(input.id, "id", 191);
    const requestId = requiredText(input.requestId, "requestId", 191);
    await lockRequest(tx, actor.tenantId, `crate-transition:${target}`, requestId);
    const prior = await priorTransition(tx, actor, { ...input, id }, action);
    if (prior) return prior;
    const initialRows = await tx.$queryRaw(Prisma.sql`SELECT "id","scope" FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} LIMIT 1`);
    if (!initialRows[0]) throw error("Configuración no encontrada.", "CRATE_SETTINGS_NOT_FOUND", 404);
    if (target === "ACTIVE") {
      await lockRequest(tx, actor.tenantId, "crate-active-scope", initialRows[0].scope);
    }
    // This read happens after any wait on the scope lock and therefore sees the committed winner.
    const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} FOR UPDATE`);
    const current = rows[0];
    if (!current) throw error("Configuración no encontrada.", "CRATE_SETTINGS_NOT_FOUND", 404);
    if (Number(current.row_version) !== Number(input.expectedVersion)) throw error("La configuración cambió; vuelva a cargar.", "CRATE_SETTINGS_VERSION_CONFLICT");
    if (target === "APPROVED") {
      if (current.state !== "DRAFT" || current.approved_at) throw error("La configuración no puede aprobarse.", "CRATE_SETTINGS_STATE_INVALID");
      if (current.created_by_membership_id === actor.membershipId) throw error("El creador no puede aprobar su configuración.", "CRATE_SETTINGS_SEPARATION_OF_DUTIES", 403);
    } else if (["ACTIVE", "SHADOW"].includes(target)) {
      if (current.state !== "DRAFT" || !current.approved_at) throw error("La configuración debe estar aprobada.", "CRATE_SETTINGS_STATE_INVALID");
      if (target === "SHADOW" && options.allowShadowActivation !== true) throw error("SHADOW permanece deshabilitado.", "CRATE_SETTINGS_SHADOW_DISABLED");
      if (current.operation_mode === "ENFORCED") throw error("ENFORCED permanece deshabilitado.", "CRATE_SETTINGS_ENFORCED_DISABLED");
      if (current.operation_mode === "SHADOW" && options.allowShadowActivation !== true) throw error("SHADOW permanece deshabilitado.", "CRATE_SETTINGS_SHADOW_DISABLED");
    } else if (target === "RETIRED" && !["DRAFT", "SHADOW", "ACTIVE"].includes(current.state)) {
      throw error("La configuración no puede retirarse.", "CRATE_SETTINGS_STATE_INVALID");
    }
    if (target === "ACTIVE") {
      const activeRows = await tx.$queryRaw(Prisma.sql`SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "scope"=${current.scope} AND "state"='ACTIVE' AND "id"<>${id} LIMIT 1 FOR UPDATE`);
      const active = activeRows[0];
      if (active) {
        if (input.replaceActive !== true || current.replaces_settings_id !== active.id) {
          await auditCrateSettings(tx, actor, { action: "CRATE_SETTINGS_CONFLICT_REJECTED", entity: "CRATE_SETTINGS", entityId: id, requestId, metadataJson: { activeId: active.id, scope: current.scope } }, options.auditWriter);
          return { rejected: error("Ya existe una configuración activa para el alcance.", "CRATE_SETTINGS_ACTIVE_CONFLICT") };
        }
        await tx.$executeRaw(Prisma.sql`UPDATE ${SETTINGS_TABLE} SET "state"='RETIRED',"retired_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1,"updated_at"=CURRENT_TIMESTAMP WHERE "tenant_id"=${actor.tenantId} AND "id"=${active.id}`);
        await auditCrateSettings(tx, actor, { action: "CRATE_SETTINGS_RETIRED", entity: "CRATE_SETTINGS", entityId: active.id, requestId: `${requestId}:replaced`, beforeJson: dto(active), metadataJson: { replacementId: id } }, options.auditWriter);
      }
    }
    const databaseState = target === "APPROVED" ? current.state : target;
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE ${SETTINGS_TABLE} SET "state"=CAST(${databaseState} AS "osi"."LogisticsConfigState"),
        "approved_by_user_id"=CASE WHEN ${target}='APPROVED' THEN ${actor.userId} ELSE "approved_by_user_id" END,
        "approved_by_membership_id"=CASE WHEN ${target}='APPROVED' THEN ${actor.membershipId} ELSE "approved_by_membership_id" END,
        "approved_at"=CASE WHEN ${target}='APPROVED' THEN CURRENT_TIMESTAMP ELSE "approved_at" END,
        "activated_at"=CASE WHEN ${target} IN ('ACTIVE','SHADOW') THEN CURRENT_TIMESTAMP ELSE "activated_at" END,
        "retired_at"=CASE WHEN ${target}='RETIRED' THEN CURRENT_TIMESTAMP ELSE "retired_at" END,
        "row_version"="row_version"+1,"updated_at"=CURRENT_TIMESTAMP
      WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} RETURNING *
    `);
    await auditCrateSettings(tx, actor, { action, entity: "CRATE_SETTINGS", entityId: id, requestId, beforeJson: dto(current), afterJson: dto(updated[0]) }, options.auditWriter);
    return { settings: dto(updated[0]), idempotent: false };
  }).then((result) => { if (result?.rejected) throw result.rejected; return result; });
}

export function approveCrateSettings(prisma, context, input, options) { return transition(prisma, context, input, "APPROVED", options); }
export function activateCrateSettings(prisma, context, input, options) { return transition(prisma, context, input, "ACTIVE", options); }
export function activateCrateSettingsShadow(prisma, context, input, options) { return transition(prisma, context, input, "SHADOW", options); }
export function retireCrateSettings(prisma, context, input, options) { return transition(prisma, context, input, "RETIRED", options); }

export async function getCrateSettings(prisma, context, id) {
  const actor = await resolveCrateSettingsActor(prisma, context, CRATE_SETTINGS_PERMISSIONS.VIEW);
  const rows = await prisma.$queryRaw(Prisma.sql`SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "id"=${requiredText(id, "id")} LIMIT 1`);
  if (!rows[0]) throw error("Configuración no encontrada.", "CRATE_SETTINGS_NOT_FOUND", 404);
  return dto(rows[0]);
}

export async function listCrateSettings(prisma, context, filters = {}) {
  const actor = await resolveCrateSettingsActor(prisma, context, CRATE_SETTINGS_PERMISSIONS.VIEW);
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
  const cursor = filters.cursor ? String(filters.cursor) : null;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId}
      AND (${filters.scope ? String(filters.scope).toUpperCase() : null}::text IS NULL OR "scope"=${filters.scope ? String(filters.scope).toUpperCase() : null})
      AND (${filters.state ? String(filters.state).toUpperCase() : null}::text IS NULL OR "state"::text=${filters.state ? String(filters.state).toUpperCase() : null})
      AND (${cursor}::text IS NULL OR "id" < ${cursor}) ORDER BY "id" DESC LIMIT ${limit + 1}
  `);
  return { items: rows.slice(0, limit).map(dto), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}

export function createCrateCalculationSnapshot(prisma, context, input, options = {}) {
  // Snapshot idempotency has the same post-lock visibility requirement as settings creation.
  return readCommitted(prisma, async (tx) => {
    const actor = await resolveCrateSettingsActor(tx, context, CRATE_SETTINGS_PERMISSIONS.SNAPSHOT_CREATE, { allowSystem: true });
    const requestId = requiredText(input.requestId, "requestId", 191);
    await lockRequest(tx, actor.tenantId, "crate-snapshot", requestId);
    const inputHash = sha256(canonicalJson(input.calculationInput ?? null));
    const outputHash = sha256(canonicalJson(input.calculationOutput ?? null));
    const prior = await tx.$queryRaw(Prisma.sql`SELECT * FROM ${SNAPSHOT_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`);
    if (prior[0]) {
      if (prior[0].calculation_input_hash !== inputHash || prior[0].calculation_output_hash !== outputHash) throw error("requestId reutilizado con otro cálculo.", "CRATE_SNAPSHOT_IDEMPOTENCY_CONFLICT");
      return { snapshot: snapshotDto(prior[0]), idempotent: true };
    }
    const settingsId = requiredText(input.settingsId, "settingsId", 191);
    const settingsRows = await tx.$queryRaw(Prisma.sql`SELECT * FROM ${SETTINGS_TABLE} WHERE "tenant_id"=${actor.tenantId} AND "id"=${settingsId} LIMIT 1`);
    const settings = settingsRows[0];
    if (!settings) throw error("Configuración no encontrada.", "CRATE_SETTINGS_NOT_FOUND", 404);
    const id = randomUUID();
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO ${SNAPSHOT_TABLE}(
        "id","tenant_id","calculation_ref","source_entity","source_entity_id","settings_id","settings_business_version","settings_hash",
        "technical_snapshot_json","economic_snapshot_json","units_snapshot_json","currency_code","calculation_input_hash","calculation_output_hash",
        "source","created_by_user_id","created_by_membership_id","request_id"
      ) VALUES (
        ${id},${actor.tenantId},${requiredText(input.calculationRef, "calculationRef", 191)},${requiredText(input.sourceEntity, "sourceEntity", 80).toUpperCase()},
        ${requiredText(input.sourceEntityId, "sourceEntityId", 191)},${settings.id},${settings.business_version},${settings.configuration_hash},
        CAST(${json(settings.technical_json)} AS jsonb),CAST(${json(settings.economic_json)} AS jsonb),CAST(${json(settings.units_json)} AS jsonb),${settings.currency_code},
        ${inputHash},${outputHash},${requiredText(input.source || "CRATE_ENGINE", "source", 120).toUpperCase()},${actor.userId},${actor.membershipId},${requestId}
      ) RETURNING *
    `);
    await auditCrateSettings(tx, actor, { action: "CRATE_CALCULATION_SNAPSHOT_CREATED", entity: "CRATE_CALCULATION_SNAPSHOT", entityId: id, requestId, afterJson: snapshotDto(rows[0]) }, options.auditWriter);
    return { snapshot: snapshotDto(rows[0]), idempotent: false };
  });
}

export function compareCrateSettingsShadow(legacy, relational) {
  const legacyHash = sha256(canonicalJson(legacy ?? null));
  const relationalHash = sha256(canonicalJson(relational ?? null));
  return {
    mode: "SHADOW_PREVIEW_ONLY", authority: "LEGACY", effectsApplied: false, equivalent: legacyHash === relationalHash,
    legacyHash, relationalHash, comparisonHash: sha256(canonicalJson({ legacyHash, relationalHash })),
  };
}

export const __crateSettingsInternals = Object.freeze({ dto, snapshotDto, lockRequest, readCommitted, isUniqueViolation });
