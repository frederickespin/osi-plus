import { Prisma } from "@prisma/client";
import { normalizeGeoRegionInput, canonicalJson, sha256 } from "./geoNormalization.js";
import {
  LOGISTICS_GEO_PERMISSIONS,
  LogisticsGeoError,
  asDate,
  assertExpectedVersion,
  auditLogistics,
  json,
  newId,
  normalizedCode,
  optionalText,
  payloadHashes,
  requiredText,
  resolveLogisticsActor,
  serializable,
  unwrapRejected,
} from "./logisticsGeoSupport.js";

const STATES = new Set(["DRAFT", "SHADOW", "ACTIVE", "RETIRED"]);
const MODES = new Set(["LEGACY_ONLY", "SHADOW", "ENFORCED"]);
const ALIAS_KINDS = new Set(["CANONICAL", "HISTORICAL", "TYPO_COMPATIBILITY", "EXTERNAL"]);

function regionDto(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, seriesId: row.series_id, version: row.version,
    countryCode: row.country_code, code: row.code, name: row.name,
    administrativeDivision: row.administrative_division, regionType: row.region_type, zoneType: row.zone_type,
    latitude: Number(row.latitude), longitude: Number(row.longitude), slaHours: row.sla_hours,
    geography: row.geography_json, aliases: row.aliases_snapshot_json, state: row.state,
    validFrom: row.valid_from, validTo: row.valid_to, versionHash: row.version_hash,
    replacesRegionId: row.replaces_region_id, source: row.source, rowVersion: row.row_version,
    approvedAt: row.approved_at, activatedAt: row.activated_at, retiredAt: row.retired_at,
    createdByMembershipId: row.created_by_membership_id, approvedByMembershipId: row.approved_by_membership_id,
    requestId: row.request_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function configDto(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, version: row.version, mode: row.mode, state: row.state,
    source: row.source, sourceSnapshot: row.source_snapshot_json, sourceHash: row.source_hash,
    configHash: row.config_hash, validFrom: row.valid_from, validTo: row.valid_to,
    rowVersion: row.row_version, requestId: row.request_id, approvedAt: row.approved_at,
    activatedAt: row.activated_at, retiredAt: row.retired_at, createdAt: row.created_at,
  };
}

function regionVersionMaterial(normalized, input) {
  return {
    ...normalized,
    validFrom: input.validFrom || null,
    validTo: input.validTo || null,
    source: normalizedCode(input.source || "MANUAL", "source"),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
  };
}

export async function createGeoRegionVersion(prisma, context, input, options = {}) {
  const actorPermission = LOGISTICS_GEO_PERMISSIONS.MANAGE;
  let normalized;
  try { normalized = normalizeGeoRegionInput(input); }
  catch (cause) { throw new LogisticsGeoError(cause.message, { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400, cause }); }
  const requestId = requiredText(input?.requestId, "requestId");
  const replacesRegionId = optionalText(input?.replacesRegionId);
  const material = regionVersionMaterial(normalized, input || {});
  const { sanitized, payloadHash } = payloadHashes(material);
  const auditWriter = options.auditWriter;

  return serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, actorPermission);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.tenantId}:geo-request:${requestId}`}))`);
    const existing = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`))[0];
    if (existing) {
      if (existing.payload_hash !== payloadHash) throw new LogisticsGeoError("requestId reutilizado con otro payload.", { code: "LOGISTICS_GEO_IDEMPOTENCY_CONFLICT", status: 409 });
      return { region: regionDto(existing), idempotent: true };
    }
    let previous = null;
    if (replacesRegionId) {
      previous = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${replacesRegionId} LIMIT 1`))[0];
      if (!previous) throw new LogisticsGeoError("Recurso no encontrado.", { code: "LOGISTICS_GEO_NOT_FOUND", status: 404 });
    }
    const id = newId();
    const seriesId = previous?.series_id || id;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.tenantId}:geo:${seriesId}`}))`);
    const maxRow = (await tx.$queryRaw(Prisma.sql`SELECT COALESCE(MAX("version"),0)::int AS "version" FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "series_id"=${seriesId}`))[0];
    const version = Number(maxRow.version) + 1;
    const versionHash = sha256(canonicalJson({ seriesId, version, material: sanitized }));
    const validFrom = asDate(input?.validFrom, "validFrom");
    const validTo = asDate(input?.validTo, "validTo");
    if (validFrom && validTo && validTo <= validFrom) throw new LogisticsGeoError("Vigencia inválida.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."osi_geo_regions"(
        "id","tenant_id","series_id","version","country_code","code","normalized_code","name","normalized_name",
        "administrative_division","region_type","zone_type","latitude","longitude","sla_hours","geography_json","aliases_snapshot_json",
        "valid_from","valid_to","version_hash","replaces_region_id","source","evidence_refs_json","created_by_user_id","created_by_membership_id","request_id","payload_hash"
      ) VALUES (
        ${id},${actor.tenantId},${seriesId},${version},${normalized.countryCode},${normalized.code},${normalized.normalizedCode},${normalized.name},${normalized.normalizedName},
        ${normalized.administrativeDivision},${normalized.regionType},${normalized.zoneType},${normalized.latitude},${normalized.longitude},${normalized.slaHours},CAST(${json(normalized.geography)} AS jsonb),CAST(${json(normalized.aliases)} AS jsonb),
        ${validFrom},${validTo},${versionHash},${replacesRegionId},${material.source},CAST(${json(material.evidenceRefs)} AS jsonb),${actor.userId},${actor.membershipId},${requestId},${payloadHash}
      )
    `);
    for (const alias of normalized.aliases) {
      const kind = ALIAS_KINDS.has(alias.kind) ? alias.kind : "HISTORICAL";
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "osi"."osi_geo_region_aliases"("id","tenant_id","region_id","country_code","alias","normalized_alias","kind")
        VALUES (${newId()},${actor.tenantId},${id},${normalized.countryCode},${alias.alias},${alias.normalizedAlias},CAST(${kind} AS "osi"."GeoRegionAliasKind"))
      `);
    }
    const row = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${id}`))[0];
    await auditLogistics(tx, actor, {
      action: previous ? "GEO_REGION_VERSION_CREATED" : "GEO_REGION_CREATED", entity: "GEO_REGION", entityId: id,
      requestId, afterJson: regionDto(row), metadataJson: { correctionApplied: normalized.correctionApplied, aliasCount: normalized.aliases.length },
    }, auditWriter);
    const previousAliases = new Set((Array.isArray(previous?.aliases_snapshot_json) ? previous.aliases_snapshot_json : []).map((item) => item.normalizedAlias));
    const nextAliases = new Set(normalized.aliases.map((item) => item.normalizedAlias));
    const addedAliases = normalized.aliases.filter((item) => !previousAliases.has(item.normalizedAlias));
    const retiredAliases = [...previousAliases].filter((item) => !nextAliases.has(item));
    if (addedAliases.length) {
      await auditLogistics(tx, actor, {
        action: "GEO_REGION_ALIAS_ADDED", entity: "GEO_REGION", entityId: id,
        requestId: `${requestId}:alias-add`.slice(0, 191), afterJson: addedAliases,
      }, auditWriter);
    }
    if (retiredAliases.length) await auditLogistics(tx, actor, {
      action: "GEO_REGION_ALIAS_RETIRED", entity: "GEO_REGION", entityId: id,
      requestId: `${requestId}:alias-retire`.slice(0, 191), beforeJson: retiredAliases,
    }, auditWriter);
    return { region: regionDto(row), idempotent: false };
  });
}

async function transitionRegion(prisma, context, input, transition, options = {}) {
  const permission = transition === "SHADOW" ? LOGISTICS_GEO_PERMISSIONS.APPROVE
    : transition === "ACTIVE" ? LOGISTICS_GEO_PERMISSIONS.ACTIVATE : LOGISTICS_GEO_PERMISSIONS.RETIRE;
  const requestId = requiredText(input?.requestId, "requestId");
  const id = requiredText(input?.id, "id");
  const outcome = await serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, permission);
    const row = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} FOR UPDATE`))[0];
    assertExpectedVersion(row, Number(input.expectedVersion));
    if (transition === "SHADOW" && row.state !== "DRAFT") throw new LogisticsGeoError("La región no está en borrador.", { code: "LOGISTICS_GEO_STATE_INVALID", status: 409 });
    if (transition === "SHADOW" && row.created_by_membership_id === actor.membershipId && input.requireSeparationOfDuties !== false) {
      throw new LogisticsGeoError("El creador no puede aprobar esta versión.", { code: "LOGISTICS_GEO_SEPARATION_OF_DUTIES", status: 403 });
    }
    if (transition === "ACTIVE" && row.state !== "SHADOW") throw new LogisticsGeoError("La región no está aprobada.", { code: "LOGISTICS_GEO_STATE_INVALID", status: 409 });
    if (transition === "RETIRED" && !new Set(["DRAFT", "SHADOW", "ACTIVE"]).has(row.state)) throw new LogisticsGeoError("Estado no retirable.", { code: "LOGISTICS_GEO_STATE_INVALID", status: 409 });
    if (transition === "ACTIVE") {
      const conflicts = await tx.$queryRaw(Prisma.sql`
        SELECT r."id" FROM "osi"."osi_geo_regions" r WHERE r."tenant_id"=${actor.tenantId} AND r."id"<>${id} AND r."state"='ACTIVE'
          AND r."country_code"=${row.country_code} AND r."normalized_code"=${row.normalized_code} AND r."series_id"<>${row.series_id} LIMIT 1
      `);
      const aliasConflicts = await tx.$queryRaw(Prisma.sql`
        SELECT ar."id" FROM "osi"."osi_geo_region_aliases" candidate
        JOIN "osi"."osi_geo_region_aliases" ar ON ar."tenant_id"=candidate."tenant_id" AND ar."country_code"=candidate."country_code" AND ar."normalized_alias"=candidate."normalized_alias" AND ar."region_id"<>candidate."region_id"
        JOIN "osi"."osi_geo_regions" active ON active."tenant_id"=ar."tenant_id" AND active."id"=ar."region_id" AND active."state"='ACTIVE' AND active."series_id"<>${row.series_id}
        WHERE candidate."tenant_id"=${actor.tenantId} AND candidate."region_id"=${id} LIMIT 1
      `);
      if (conflicts[0] || aliasConflicts[0]) {
        await auditLogistics(tx, actor, { action: "GEO_REGION_CONTRADICTION_DETECTED", entity: "GEO_REGION", entityId: id, requestId, metadataJson: { codeConflict: Boolean(conflicts[0]), aliasConflict: Boolean(aliasConflicts[0]) } }, options.auditWriter);
        return { rejected: new LogisticsGeoError("Código o alias activo en otra región.", { code: "LOGISTICS_GEO_CONTRADICTION", status: 409 }) };
      }
      const activeSameSeries = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "series_id"=${row.series_id} AND "state"='ACTIVE' FOR UPDATE`);
      for (const old of activeSameSeries) await tx.$executeRaw(Prisma.sql`UPDATE "osi"."osi_geo_regions" SET "state"='RETIRED',"retired_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1 WHERE "tenant_id"=${actor.tenantId} AND "id"=${old.id}`);
    }
    const stateFields = transition === "SHADOW"
      ? Prisma.sql`"approved_by_user_id"=${actor.userId},"approved_by_membership_id"=${actor.membershipId},"approved_at"=CURRENT_TIMESTAMP`
      : transition === "ACTIVE" ? Prisma.sql`"activated_at"=CURRENT_TIMESTAMP`
        : Prisma.sql`"retired_at"=CURRENT_TIMESTAMP`;
    await tx.$executeRaw(Prisma.sql`UPDATE "osi"."osi_geo_regions" SET "state"=CAST(${transition} AS "osi"."LogisticsConfigState"),${stateFields},"row_version"="row_version"+1 WHERE "tenant_id"=${actor.tenantId} AND "id"=${id}`);
    const after = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${id}`))[0];
    await auditLogistics(tx, actor, { action: `GEO_REGION_${transition === "SHADOW" ? "APPROVED" : transition}`, entity: "GEO_REGION", entityId: id, requestId, beforeJson: regionDto(row), afterJson: regionDto(after) }, options.auditWriter);
    return { region: regionDto(after) };
  });
  return unwrapRejected(outcome);
}

export function approveGeoRegionVersion(prisma, context, input, options) { return transitionRegion(prisma, context, input, "SHADOW", options); }
export function activateGeoRegionVersion(prisma, context, input, options) { return transitionRegion(prisma, context, input, "ACTIVE", options); }
export function retireGeoRegionVersion(prisma, context, input, options) { return transitionRegion(prisma, context, input, "RETIRED", options); }

export async function resolveGeoRegion(prisma, context, input = {}) {
  const actor = await resolveLogisticsActor(prisma, context, LOGISTICS_GEO_PERMISSIONS.VIEW, { allowSystem: true });
  const countryCode = normalizedCode(input.countryCode || "DO", "countryCode", 2).slice(0, 2);
  const normalized = normalizedCode(input.place, "place", 200);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT DISTINCT r.* FROM "osi"."osi_geo_regions" r LEFT JOIN "osi"."osi_geo_region_aliases" a ON a."tenant_id"=r."tenant_id" AND a."region_id"=r."id"
    WHERE r."tenant_id"=${actor.tenantId} AND r."country_code"=${countryCode} AND r."state"='ACTIVE'
      AND (r."normalized_code"=${normalized} OR r."normalized_name"=${normalized.replace(/_/g, " ")} OR a."normalized_alias"=${normalized})
      AND (r."valid_from" IS NULL OR r."valid_from"<=CURRENT_TIMESTAMP) AND (r."valid_to" IS NULL OR r."valid_to">CURRENT_TIMESTAMP)
    LIMIT 1
  `);
  if (!rows[0]) throw new LogisticsGeoError("Región no encontrada.", { code: "LOGISTICS_GEO_NOT_FOUND", status: 404 });
  return regionDto(rows[0]);
}

export async function listGeoRegions(prisma, context, input = {}) {
  const actor = await resolveLogisticsActor(prisma, context, LOGISTICS_GEO_PERMISSIONS.VIEW, { allowSystem: true });
  const limit = Math.min(100, Math.max(1, Number(input.limit || 50)));
  const cursor = optionalText(input.cursor);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId}
      AND (${input.state ? normalizedCode(input.state, "state") : null}::text IS NULL OR "state"::text=${input.state ? normalizedCode(input.state, "state") : null})
      AND (${cursor}::text IS NULL OR "id">${cursor}) ORDER BY "id" LIMIT ${limit + 1}
  `);
  return { items: rows.slice(0, limit).map(regionDto), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}

export async function createLogisticsConfigurationVersion(prisma, context, input, options = {}) {
  const requestId = requiredText(input?.requestId, "requestId");
  const mode = normalizedCode(input?.mode || "LEGACY_ONLY", "mode");
  if (!MODES.has(mode)) throw new LogisticsGeoError("Modo inválido.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  const source = normalizedCode(input?.source || "MANUAL", "source");
  const sourceSnapshot = input?.sourceSnapshot && typeof input.sourceSnapshot === "object" && !Array.isArray(input.sourceSnapshot) ? input.sourceSnapshot : {};
  const evidenceRefs = Array.isArray(input?.evidenceRefs) ? input.evidenceRefs : [];
  const sourceHash = sha256(canonicalJson(sourceSnapshot));
  const configHash = sha256(canonicalJson({ mode, source, sourceSnapshot, validFrom: input.validFrom || null, validTo: input.validTo || null }));
  const { payloadHash } = payloadHashes({ mode, source, sourceSnapshot, evidenceRefs, configHash });
  return serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, LOGISTICS_GEO_PERMISSIONS.MODE_CHANGE);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.tenantId}:config-request:${requestId}`}))`);
    const prior = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`))[0];
    if (prior) {
      if (prior.payload_hash !== payloadHash) throw new LogisticsGeoError("requestId reutilizado.", { code: "LOGISTICS_GEO_IDEMPOTENCY_CONFLICT", status: 409 });
      return { configuration: configDto(prior), idempotent: true };
    }
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.tenantId}:logistics-config`}))`);
    const max = (await tx.$queryRaw(Prisma.sql`SELECT COALESCE(MAX("version"),0)::int AS "version" FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId}`))[0];
    const id = newId();
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."logistics_configuration_versions"("id","tenant_id","version","mode","source","source_snapshot_json","source_hash","config_hash","valid_from","valid_to","evidence_refs_json","created_by_user_id","created_by_membership_id","request_id","payload_hash")
      VALUES (${id},${actor.tenantId},${Number(max.version) + 1},CAST(${mode} AS "osi"."LogisticsOperationMode"),${source},CAST(${json(sourceSnapshot)} AS jsonb),${sourceHash},${configHash},${asDate(input?.validFrom,"validFrom")},${asDate(input?.validTo,"validTo")},CAST(${json(evidenceRefs)} AS jsonb),${actor.userId},${actor.membershipId},${requestId},${payloadHash})
    `);
    const row = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${id}`))[0];
    await auditLogistics(tx, actor, { action: "LOGISTICS_CONFIGURATION_VERSION_CREATED", entity: "LOGISTICS_CONFIGURATION", entityId: id, requestId, afterJson: configDto(row) }, options.auditWriter);
    return { configuration: configDto(row), idempotent: false };
  });
}

export async function approveLogisticsConfiguration(prisma, context, input, options = {}) {
  return serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, LOGISTICS_GEO_PERMISSIONS.APPROVE);
    const row = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${requiredText(input.id,"id")} FOR UPDATE`))[0];
    assertExpectedVersion(row, Number(input.expectedVersion));
    if (row.state !== "DRAFT") throw new LogisticsGeoError("Configuración no aprobable.", { code: "LOGISTICS_GEO_STATE_INVALID", status: 409 });
    if (row.created_by_membership_id === actor.membershipId && input.requireSeparationOfDuties !== false) throw new LogisticsGeoError("Separación de funciones requerida.", { code: "LOGISTICS_GEO_SEPARATION_OF_DUTIES", status: 403 });
    await tx.$executeRaw(Prisma.sql`UPDATE "osi"."logistics_configuration_versions" SET "state"='SHADOW',"approved_by_user_id"=${actor.userId},"approved_by_membership_id"=${actor.membershipId},"approved_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1 WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.id}`);
    const after = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.id}`))[0];
    await auditLogistics(tx, actor, { action: "LOGISTICS_CONFIGURATION_APPROVED", entity: "LOGISTICS_CONFIGURATION", entityId: row.id, requestId: requiredText(input.requestId,"requestId"), beforeJson: configDto(row), afterJson: configDto(after) }, options.auditWriter);
    return { configuration: configDto(after) };
  });
}

export async function activateLogisticsConfiguration(prisma, context, input, options = {}) {
  return serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, LOGISTICS_GEO_PERMISSIONS.ACTIVATE);
    const row = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${requiredText(input.id,"id")} FOR UPDATE`))[0];
    assertExpectedVersion(row, Number(input.expectedVersion));
    if (row.state !== "SHADOW") throw new LogisticsGeoError("Configuración no aprobada.", { code: "LOGISTICS_GEO_STATE_INVALID", status: 409 });
    if (row.mode !== "LEGACY_ONLY" && options.allowNonLegacyActivation !== true) {
      throw new LogisticsGeoError(`${row.mode} permanece deshabilitado.`, { code: row.mode === "ENFORCED" ? "LOGISTICS_GEO_ENFORCEMENT_DISABLED" : "LOGISTICS_GEO_SHADOW_DISABLED", status: 409 });
    }
    const active = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId} AND "state"='ACTIVE' FOR UPDATE`);
    for (const old of active) await tx.$executeRaw(Prisma.sql`UPDATE "osi"."logistics_configuration_versions" SET "state"='RETIRED',"retired_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1 WHERE "tenant_id"=${actor.tenantId} AND "id"=${old.id}`);
    await tx.$executeRaw(Prisma.sql`UPDATE "osi"."logistics_configuration_versions" SET "state"='ACTIVE',"activated_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1 WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.id}`);
    const after = (await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."logistics_configuration_versions" WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.id}`))[0];
    await auditLogistics(tx, actor, { action: "LOGISTICS_MODE_CHANGED", entity: "LOGISTICS_CONFIGURATION", entityId: row.id, requestId: requiredText(input.requestId,"requestId"), beforeJson: active.map(configDto), afterJson: configDto(after) }, options.auditWriter);
    return { configuration: configDto(after) };
  });
}

export const __geoAdminInternals = Object.freeze({ STATES, MODES, regionDto, configDto });
