import { Prisma } from "@prisma/client";
import { canonicalJson, normalizeGeoToken, sha256 } from "./geoNormalization.js";
import {
  LOGISTICS_GEO_PERMISSIONS,
  LogisticsGeoError,
  asDate,
  asNumber,
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

export const ZONE_RULE_KINDS = Object.freeze(["ZONE_TYPE_BASE", "REGION_OVERRIDE", "DISTANCE_REVIEW", "DISTANCE_BLOCK", "ROUTE_SURCHARGE"]);
export const TRANSPORT_RULE_SCOPES = Object.freeze(["ZONE_TYPE", "REGION", "ROUTE", "DISTANCE_BAND"]);

function nullableCode(value, max = 80) {
  return value == null || String(value).trim() === "" ? null : normalizeGeoToken(String(value)).slice(0, max);
}

function currencyCode(value) {
  if (value == null || String(value).trim() === "") return null;
  const normalized = normalizeGeoToken(String(value));
  if (!/^[A-Z]{3}$/.test(normalized)) throw new LogisticsGeoError("Moneda ISO inválida.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return normalized;
}

function validity(input) {
  const validFrom = asDate(input?.validFrom, "validFrom");
  const validTo = asDate(input?.validTo, "validTo");
  if (validFrom && validTo && validTo <= validFrom) throw new LogisticsGeoError("Vigencia inválida.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return { validFrom, validTo };
}

function commonRule(input, allowed, discriminator) {
  const kind = normalizedCode(input?.[discriminator], discriminator);
  if (!allowed.includes(kind)) throw new LogisticsGeoError(`${discriminator} no soportado.`, { code: "LOGISTICS_GEO_RULE_UNSUPPORTED", status: 400 });
  const priority = asNumber(input?.priority ?? 100, "priority", { nullable: false, min: 0, max: 100000 });
  const distanceMinKm = asNumber(input?.distanceMinKm, "distanceMinKm", { min: 0 });
  const distanceMaxKm = asNumber(input?.distanceMaxKm, "distanceMaxKm", { min: 0 });
  if (distanceMinKm != null && distanceMaxKm != null && distanceMaxKm < distanceMinKm) throw new LogisticsGeoError("Rango de distancia inválido.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  return {
    discriminator: kind,
    code: normalizedCode(input?.code, "code", 100),
    name: requiredText(input?.name, "name", 180),
    priority,
    countryCode: nullableCode(input?.countryCode, 2),
    zoneType: nullableCode(input?.zoneType),
    regionId: optionalText(input?.regionId),
    originRegionId: optionalText(input?.originRegionId),
    destinationRegionId: optionalText(input?.destinationRegionId),
    distanceMinKm,
    distanceMaxKm,
    source: normalizedCode(input?.source || "MANUAL", "source"),
    evidenceRefs: Array.isArray(input?.evidenceRefs) ? input.evidenceRefs : [],
    riskRuleId: optionalText(input?.riskRuleId),
    riskRuleHash: optionalText(input?.riskRuleHash, 64),
    ...validity(input),
  };
}

function normalizeZoneRule(input) {
  const base = commonRule(input, ZONE_RULE_KINDS, "kind");
  const currency = currencyCode(input?.currencyCode);
  const kmRateUnit = input?.kmRateUnit == null ? null : normalizedCode(input.kmRateUnit, "kmRateUnit", 32);
  const output = {
    freeKm: asNumber(input?.freeKm, "freeKm", { min: 0 }),
    kmRate: asNumber(input?.kmRate, "kmRate", { min: 0 }),
    surchargePercent: asNumber(input?.surchargePercent, "surchargePercent", { min: -100, max: 10000 }),
    slaHours: asNumber(input?.slaHours, "slaHours", { min: 1, max: 100000 }),
    weekendSurchargePercent: asNumber(input?.weekendSurchargePercent, "weekendSurchargePercent", { min: -100, max: 10000 }),
    afterHoursSurchargePercent: asNumber(input?.afterHoursSurchargePercent, "afterHoursSurchargePercent", { min: -100, max: 10000 }),
    currencyCode: currency,
    kmRateUnit,
  };
  if (output.kmRate != null && (!currency || kmRateUnit !== "AMOUNT_PER_KM")) {
    throw new LogisticsGeoError("kmRate requiere moneda ISO y unidad AMOUNT_PER_KM.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  }
  if (base.discriminator === "ZONE_TYPE_BASE" && !base.zoneType) throw new LogisticsGeoError("ZONE_TYPE_BASE requiere zoneType.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  if (base.discriminator === "REGION_OVERRIDE" && !base.regionId) throw new LogisticsGeoError("REGION_OVERRIDE requiere regionId.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  if (base.discriminator.startsWith("DISTANCE_") && base.distanceMinKm == null) throw new LogisticsGeoError("La regla de distancia requiere distanceMinKm.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  const scopeKey = [base.discriminator, base.countryCode || "*", base.zoneType || "*", base.regionId || "*", base.originRegionId || "*", base.destinationRegionId || "*"].join(":");
  return { ...base, ...output, scopeKey, resultHash: sha256(canonicalJson(output)) };
}

function normalizeTransportRule(input) {
  const base = commonRule(input, TRANSPORT_RULE_SCOPES, "scope");
  const serviceMode = nullableCode(input?.serviceMode);
  const currency = currencyCode(input?.currencyCode);
  const output = {
    kmMultiplier: asNumber(input?.kmMultiplier ?? 1, "kmMultiplier", { nullable: false, min: 0.000001 }),
    volumeMultiplier: asNumber(input?.volumeMultiplier ?? 1, "volumeMultiplier", { nullable: false, min: 0.000001 }),
    surchargePercent: asNumber(input?.surchargePercent ?? 0, "surchargePercent", { nullable: false, min: -100, max: 10000 }),
    minimumCharge: asNumber(input?.minimumCharge, "minimumCharge", { min: 0 }),
    currencyCode: currency,
  };
  if (output.minimumCharge != null && !currency) {
    throw new LogisticsGeoError("minimumCharge requiere moneda ISO.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  }
  if (base.discriminator === "ZONE_TYPE" && !base.zoneType) throw new LogisticsGeoError("ZONE_TYPE requiere zoneType.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  if (base.discriminator === "REGION" && !base.originRegionId) throw new LogisticsGeoError("REGION requiere originRegionId.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  if (base.discriminator === "ROUTE" && (!base.originRegionId || !base.destinationRegionId)) throw new LogisticsGeoError("ROUTE requiere origen y destino.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  if (base.discriminator === "DISTANCE_BAND" && base.distanceMinKm == null) throw new LogisticsGeoError("DISTANCE_BAND requiere distanceMinKm.", { code: "LOGISTICS_GEO_INPUT_INVALID", status: 400 });
  const scopeKey = [base.discriminator, base.countryCode || "*", serviceMode || "*", base.zoneType || "*", base.originRegionId || "*", base.destinationRegionId || "*"].join(":");
  return { ...base, ...output, serviceMode, scopeKey, resultHash: sha256(canonicalJson(output)) };
}

async function verifyReferences(tx, actor, rule) {
  const ids = [...new Set([rule.regionId, rule.originRegionId, rule.destinationRegionId].filter(Boolean))];
  if (ids.length) {
    const rows = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."osi_geo_regions" WHERE "tenant_id"=${actor.tenantId} AND "id" IN (${Prisma.join(ids)})`);
    if (rows.length !== ids.length) throw new LogisticsGeoError("Región relacionada no encontrada.", { code: "LOGISTICS_GEO_NOT_FOUND", status: 404 });
  }
  if (rule.riskRuleId) {
    const rows = await tx.$queryRaw(Prisma.sql`SELECT "id","version_hash" FROM "osi"."risk_engine_rules" WHERE "tenant_id"=${actor.tenantId} AND "id"=${rule.riskRuleId} LIMIT 1`);
    if (!rows[0] || (rule.riskRuleHash && rows[0].version_hash !== rule.riskRuleHash)) throw new LogisticsGeoError("RiskEngineRule relacionada no corresponde.", { code: "LOGISTICS_GEO_RISK_LINK_INVALID", status: 409 });
    rule.riskRuleHash = rows[0].version_hash;
  }
}

function ruleDto(row, type) {
  if (!row) return null;
  const transport = type === "TRANSPORT";
  return {
    id: row.id, tenantId: row.tenant_id, seriesId: row.series_id, code: row.code, version: row.version,
    name: row.name, type, kind: transport ? undefined : row.kind, scope: transport ? row.scope : undefined,
    priority: row.priority, scopeKey: row.scope_key, countryCode: row.country_code, serviceMode: row.service_mode,
    zoneType: row.zone_type, regionId: row.region_id, originRegionId: row.origin_region_id, destinationRegionId: row.destination_region_id,
    distanceMinKm: row.distance_min_km == null ? null : Number(row.distance_min_km), distanceMaxKm: row.distance_max_km == null ? null : Number(row.distance_max_km),
    freeKm: row.free_km == null ? undefined : Number(row.free_km), kmRate: row.km_rate == null ? undefined : Number(row.km_rate),
    currencyCode: row.currency_code || undefined, kmRateUnit: row.km_rate_unit || undefined,
    kmMultiplier: row.km_multiplier == null ? undefined : Number(row.km_multiplier), volumeMultiplier: row.volume_multiplier == null ? undefined : Number(row.volume_multiplier),
    surchargePercent: row.surcharge_percent == null ? undefined : Number(row.surcharge_percent), minimumCharge: row.minimum_charge == null ? undefined : Number(row.minimum_charge),
    slaHours: row.sla_hours, weekendSurchargePercent: row.weekend_surcharge_percent == null ? undefined : Number(row.weekend_surcharge_percent),
    afterHoursSurchargePercent: row.after_hours_surcharge_percent == null ? undefined : Number(row.after_hours_surcharge_percent),
    resultHash: row.result_hash, state: row.state, validFrom: row.valid_from, validTo: row.valid_to,
    versionHash: row.version_hash, replacesRuleId: row.replaces_rule_id, riskRuleId: row.risk_rule_id, riskRuleHash: row.risk_rule_hash,
    source: row.source, rowVersion: row.row_version, approvedAt: row.approved_at, activatedAt: row.activated_at, retiredAt: row.retired_at,
    requestId: row.request_id, createdByMembershipId: row.created_by_membership_id, approvedByMembershipId: row.approved_by_membership_id,
  };
}

async function createRule(prisma, context, input, type, options = {}) {
  const normalized = type === "ZONE" ? normalizeZoneRule(input) : normalizeTransportRule(input);
  const requestId = requiredText(input?.requestId, "requestId");
  const replacesRuleId = optionalText(input?.replacesRuleId);
  const { sanitized, payloadHash } = payloadHashes({ ...normalized, replacesRuleId });
  const table = type === "ZONE" ? "osi_zone_rules" : "osi_transport_zone_rules";
  return serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, LOGISTICS_GEO_PERMISSIONS.MANAGE);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.tenantId}:${table}:request:${requestId}`}))`);
    const prior = await tx.$queryRawUnsafe(`SELECT * FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "request_id"=$2 LIMIT 1`, actor.tenantId, requestId);
    if (prior[0]) {
      if (prior[0].payload_hash !== payloadHash) throw new LogisticsGeoError("requestId reutilizado con otro payload.", { code: "LOGISTICS_GEO_IDEMPOTENCY_CONFLICT", status: 409 });
      return { rule: ruleDto(prior[0], type), idempotent: true };
    }
    await verifyReferences(tx, actor, normalized);
    let previous = null;
    if (replacesRuleId) {
      const rows = await tx.$queryRawUnsafe(`SELECT * FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "id"=$2 LIMIT 1`, actor.tenantId, replacesRuleId);
      previous = rows[0];
      if (!previous) throw new LogisticsGeoError("Regla anterior no encontrada.", { code: "LOGISTICS_GEO_NOT_FOUND", status: 404 });
    }
    const id = newId();
    const seriesId = previous?.series_id || id;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.tenantId}:${table}:${seriesId}`}))`);
    const max = await tx.$queryRawUnsafe(`SELECT COALESCE(MAX("version"),0)::int AS "version" FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "series_id"=$2`, actor.tenantId, seriesId);
    const version = Number(max[0].version) + 1;
    const versionHash = sha256(canonicalJson({ seriesId, version, normalized: sanitized }));
    if (type === "ZONE") {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "osi"."osi_zone_rules"("id","tenant_id","series_id","code","version","name","kind","priority","scope_key","country_code","zone_type","region_id","origin_region_id","destination_region_id","distance_min_km","distance_max_km","free_km","km_rate","currency_code","km_rate_unit","surcharge_percent","sla_hours","weekend_surcharge_percent","after_hours_surcharge_percent","result_hash","valid_from","valid_to","version_hash","replaces_rule_id","risk_rule_id","risk_rule_hash","source","evidence_refs_json","created_by_user_id","created_by_membership_id","request_id","payload_hash")
        VALUES (${id},${actor.tenantId},${seriesId},${normalized.code},${version},${normalized.name},CAST(${normalized.discriminator} AS "osi"."ZoneRuleKind"),${normalized.priority},${normalized.scopeKey},${normalized.countryCode},${normalized.zoneType},${normalized.regionId},${normalized.originRegionId},${normalized.destinationRegionId},${normalized.distanceMinKm},${normalized.distanceMaxKm},${normalized.freeKm},${normalized.kmRate},${normalized.currencyCode},${normalized.kmRateUnit},${normalized.surchargePercent},${normalized.slaHours},${normalized.weekendSurchargePercent},${normalized.afterHoursSurchargePercent},${normalized.resultHash},${normalized.validFrom},${normalized.validTo},${versionHash},${replacesRuleId},${normalized.riskRuleId},${normalized.riskRuleHash},${normalized.source},CAST(${json(normalized.evidenceRefs)} AS jsonb),${actor.userId},${actor.membershipId},${requestId},${payloadHash})
      `);
    } else {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "osi"."osi_transport_zone_rules"("id","tenant_id","series_id","code","version","name","scope","priority","scope_key","country_code","service_mode","zone_type","origin_region_id","destination_region_id","distance_min_km","distance_max_km","km_multiplier","volume_multiplier","surcharge_percent","minimum_charge","currency_code","result_hash","valid_from","valid_to","version_hash","replaces_rule_id","risk_rule_id","risk_rule_hash","source","evidence_refs_json","created_by_user_id","created_by_membership_id","request_id","payload_hash")
        VALUES (${id},${actor.tenantId},${seriesId},${normalized.code},${version},${normalized.name},CAST(${normalized.discriminator} AS "osi"."TransportRuleScope"),${normalized.priority},${normalized.scopeKey},${normalized.countryCode},${normalized.serviceMode},${normalized.zoneType},${normalized.originRegionId},${normalized.destinationRegionId},${normalized.distanceMinKm},${normalized.distanceMaxKm},${normalized.kmMultiplier},${normalized.volumeMultiplier},${normalized.surchargePercent},${normalized.minimumCharge},${normalized.currencyCode},${normalized.resultHash},${normalized.validFrom},${normalized.validTo},${versionHash},${replacesRuleId},${normalized.riskRuleId},${normalized.riskRuleHash},${normalized.source},CAST(${json(normalized.evidenceRefs)} AS jsonb),${actor.userId},${actor.membershipId},${requestId},${payloadHash})
      `);
    }
    const row = (await tx.$queryRawUnsafe(`SELECT * FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "id"=$2`, actor.tenantId, id))[0];
    await auditLogistics(tx, actor, { action: `${type}_RULE_VERSION_CREATED`, entity: `${type}_RULE`, entityId: id, requestId, afterJson: ruleDto(row, type) }, options.auditWriter);
    return { rule: ruleDto(row, type), idempotent: false };
  });
}

export function createZoneRuleVersion(prisma, context, input, options) { return createRule(prisma, context, input, "ZONE", options); }
export function createTransportZoneRuleVersion(prisma, context, input, options) { return createRule(prisma, context, input, "TRANSPORT", options); }

async function transitionRule(prisma, context, input, type, transition, options = {}) {
  const table = type === "ZONE" ? "osi_zone_rules" : "osi_transport_zone_rules";
  const discriminator = type === "ZONE" ? "kind" : "scope";
  const permission = transition === "SHADOW" ? LOGISTICS_GEO_PERMISSIONS.APPROVE : transition === "ACTIVE" ? LOGISTICS_GEO_PERMISSIONS.ACTIVATE : LOGISTICS_GEO_PERMISSIONS.RETIRE;
  const requestId = requiredText(input?.requestId, "requestId");
  const result = await serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, permission);
    const rows = await tx.$queryRawUnsafe(`SELECT * FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "id"=$2 FOR UPDATE`, actor.tenantId, requiredText(input?.id, "id"));
    const row = rows[0];
    assertExpectedVersion(row, Number(input.expectedVersion));
    if (transition === "SHADOW" && row.state !== "DRAFT") throw new LogisticsGeoError("Regla no aprobable.", { code: "LOGISTICS_GEO_STATE_INVALID", status: 409 });
    if (transition === "SHADOW" && row.created_by_membership_id === actor.membershipId && input.requireSeparationOfDuties !== false) throw new LogisticsGeoError("Separación de funciones requerida.", { code: "LOGISTICS_GEO_SEPARATION_OF_DUTIES", status: 403 });
    if (transition === "ACTIVE" && row.state !== "SHADOW") throw new LogisticsGeoError("Regla no aprobada.", { code: "LOGISTICS_GEO_STATE_INVALID", status: 409 });
    if (transition === "ACTIVE") {
      const conflicts = await tx.$queryRawUnsafe(`
        SELECT "id" FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "id"<>$2 AND "state"='ACTIVE'
          AND "${discriminator}"=$3::"osi"."${type === "ZONE" ? "ZoneRuleKind" : "TransportRuleScope"}" AND "scope_key"=$4 AND "priority"=$5
          AND COALESCE("distance_min_km",-1e12)<=COALESCE($6::decimal,1e12) AND COALESCE($7::decimal,-1e12)<=COALESCE("distance_max_km",1e12)
          AND COALESCE("valid_from",'-infinity')<COALESCE($8::timestamp,'infinity') AND COALESCE($9::timestamp,'-infinity')<COALESCE("valid_to",'infinity') LIMIT 1
      `, actor.tenantId, row.id, row[discriminator], row.scope_key, row.priority, row.distance_max_km, row.distance_min_km, row.valid_to, row.valid_from);
      if (conflicts[0]) {
        await auditLogistics(tx, actor, { action: `${type}_RULE_CONTRADICTION_DETECTED`, entity: `${type}_RULE`, entityId: row.id, requestId, metadataJson: { conflictingRuleId: conflicts[0].id, scopeKey: row.scope_key, priority: row.priority } }, options.auditWriter);
        return { rejected: new LogisticsGeoError("Reglas activas superpuestas con igual prioridad.", { code: "LOGISTICS_GEO_RULE_CONTRADICTION", status: 409 }) };
      }
      const activeSeries = await tx.$queryRawUnsafe(`SELECT * FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "series_id"=$2 AND "state"='ACTIVE' FOR UPDATE`, actor.tenantId, row.series_id);
      for (const old of activeSeries) await tx.$executeRawUnsafe(`UPDATE "osi"."${table}" SET "state"='RETIRED',"retired_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1 WHERE "tenant_id"=$1 AND "id"=$2`, actor.tenantId, old.id);
    }
    const fields = transition === "SHADOW"
      ? `"approved_by_user_id"=$3,"approved_by_membership_id"=$4,"approved_at"=CURRENT_TIMESTAMP`
      : transition === "ACTIVE" ? `"activated_at"=CURRENT_TIMESTAMP` : `"retired_at"=CURRENT_TIMESTAMP`;
    const parameters = transition === "SHADOW" ? [actor.tenantId, row.id, actor.userId, actor.membershipId] : [actor.tenantId, row.id];
    await tx.$executeRawUnsafe(`UPDATE "osi"."${table}" SET "state"='${transition}',${fields},"row_version"="row_version"+1 WHERE "tenant_id"=$1 AND "id"=$2`, ...parameters);
    const after = (await tx.$queryRawUnsafe(`SELECT * FROM "osi"."${table}" WHERE "tenant_id"=$1 AND "id"=$2`, actor.tenantId, row.id))[0];
    await auditLogistics(tx, actor, { action: `${type}_RULE_${transition === "SHADOW" ? "APPROVED" : transition}`, entity: `${type}_RULE`, entityId: row.id, requestId, beforeJson: ruleDto(row, type), afterJson: ruleDto(after, type) }, options.auditWriter);
    return { rule: ruleDto(after, type) };
  });
  return unwrapRejected(result);
}

export function approveZoneRuleVersion(prisma, context, input, options) { return transitionRule(prisma, context, input, "ZONE", "SHADOW", options); }
export function activateZoneRuleVersion(prisma, context, input, options) { return transitionRule(prisma, context, input, "ZONE", "ACTIVE", options); }
export function retireZoneRuleVersion(prisma, context, input, options) { return transitionRule(prisma, context, input, "ZONE", "RETIRED", options); }
export function approveTransportZoneRuleVersion(prisma, context, input, options) { return transitionRule(prisma, context, input, "TRANSPORT", "SHADOW", options); }
export function activateTransportZoneRuleVersion(prisma, context, input, options) { return transitionRule(prisma, context, input, "TRANSPORT", "ACTIVE", options); }
export function retireTransportZoneRuleVersion(prisma, context, input, options) { return transitionRule(prisma, context, input, "TRANSPORT", "RETIRED", options); }

function ruleMatches(row, input, type) {
  const now = input.at ? new Date(input.at) : new Date();
  if ((row.valid_from && new Date(row.valid_from) > now) || (row.valid_to && new Date(row.valid_to) <= now)) return false;
  const distance = Number(input.distanceKm || 0);
  if (row.distance_min_km != null && distance < Number(row.distance_min_km)) return false;
  if (row.distance_max_km != null && distance > Number(row.distance_max_km)) return false;
  if (row.country_code && row.country_code !== nullableCode(input.countryCode, 2)) return false;
  if (row.zone_type && row.zone_type !== nullableCode(input.zoneType)) return false;
  if (row.origin_region_id && row.origin_region_id !== input.originRegionId) return false;
  if (row.destination_region_id && row.destination_region_id !== input.destinationRegionId) return false;
  if (type === "ZONE" && row.region_id && !new Set([input.originRegionId, input.destinationRegionId]).has(row.region_id)) return false;
  if (type === "TRANSPORT" && row.service_mode && row.service_mode !== nullableCode(input.serviceMode)) return false;
  return true;
}

function specificity(row, type) {
  return [row.country_code, row.zone_type, row.region_id, row.origin_region_id, row.destination_region_id, type === "TRANSPORT" ? row.service_mode : null, row.distance_min_km, row.distance_max_km].filter((item) => item != null).length;
}

function selectDeterministic(rows, type) {
  return [...rows].sort((a, b) => Number(a.priority) - Number(b.priority) || specificity(b, type) - specificity(a, type) || String(a.code).localeCompare(String(b.code)) || Number(b.version) - Number(a.version));
}

export async function resolveRelationalLogisticsRules(prisma, context, input = {}) {
  const actor = await resolveLogisticsActor(prisma, context, LOGISTICS_GEO_PERMISSIONS.VIEW, { allowSystem: true });
  const [zoneRows, transportRows] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_zone_rules" WHERE "tenant_id"=${actor.tenantId} AND "state" IN ('ACTIVE','SHADOW')`),
    prisma.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_transport_zone_rules" WHERE "tenant_id"=${actor.tenantId} AND "state" IN ('ACTIVE','SHADOW')`),
  ]);
  const zones = selectDeterministic(zoneRows.filter((row) => ruleMatches(row, input, "ZONE")), "ZONE");
  const transports = selectDeterministic(transportRows.filter((row) => ruleMatches(row, input, "TRANSPORT")), "TRANSPORT");
  const selectedByKind = new Map();
  for (const row of zones) {
    if (!selectedByKind.has(row.kind)) selectedByKind.set(row.kind, row);
  }
  const selectedZones = [...selectedByKind.values()].map((row) => ruleDto(row, "ZONE"));
  const selectedTransport = transports[0] ? ruleDto(transports[0], "TRANSPORT") : null;
  return { mode: "RELATIONAL_PREVIEW", blocking: false, selectedZones, selectedTransport, candidateCounts: { zones: zones.length, transport: transports.length } };
}

function comparableResult(value = {}) {
  const pick = (input, key) => input?.[key] == null ? null : Number(input[key]);
  return {
    freeKm: pick(value, "freeKm"), kmRate: pick(value, "kmRate"), surchargePercent: pick(value, "surchargePercent"),
    slaHours: pick(value, "slaHours"), kmMultiplier: pick(value, "kmMultiplier"), volumeMultiplier: pick(value, "volumeMultiplier"),
    transportSurchargePercent: pick(value, "transportSurchargePercent"), minimumCharge: pick(value, "minimumCharge"),
  };
}

export function compareLegacyToShadow(legacyResult, relationalResult) {
  const legacy = comparableResult(legacyResult);
  const relational = comparableResult(relationalResult);
  const differences = Object.keys(legacy).filter((key) => legacy[key] !== relational[key]).map((key) => ({ field: key, legacy: legacy[key], relational: relational[key] }));
  return { mode: "SHADOW_PREVIEW_ONLY", effectsApplied: false, legacy, relational, equivalent: differences.length === 0, differences, comparisonHash: sha256(canonicalJson({ legacy, relational })) };
}

export async function recordLogisticsImportDecision(prisma, context, input, options = {}) {
  return serializable(prisma, async (tx) => {
    const actor = await resolveLogisticsActor(tx, context, LOGISTICS_GEO_PERMISSIONS.IMPORT);
    const accepted = input?.accepted === true;
    const requestId = requiredText(input?.requestId, "requestId");
    const summary = input?.summary && typeof input.summary === "object" ? input.summary : {};
    await auditLogistics(tx, actor, {
      action: accepted ? "LOGISTICS_CONFIGURATION_IMPORTED" : "LOGISTICS_CONFIGURATION_IMPORT_REJECTED",
      entity: "LOGISTICS_IMPORT", entityId: requiredText(input?.importId, "importId"), requestId,
      metadataJson: { dryRunRequired: true, accepted, summary },
    }, options.auditWriter);
    return { accepted, persistedConfiguration: false };
  });
}

export const __zoneRuleInternals = Object.freeze({ normalizeZoneRule, normalizeTransportRule, ruleMatches, selectDeterministic, comparableResult });
