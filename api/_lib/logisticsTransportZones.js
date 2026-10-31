import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { canonicalHash, logisticsFail } from "./logisticsEngineContract.js";
import { normalizeTransportZone, normalizeTransportZonePayload, TRANSPORT_CONTRACT } from "./logisticsTransportContract.js";
import { effectivePermissionsFor } from "./rbac.js";

export const TRANSPORT_ZONE_PERMISSIONS = Object.freeze({
  VIEW: Object.freeze(["logistics:rules:view", "costing:rules:view"]),
  MANAGE: Object.freeze(["logistics:rules:manage", "costing:rules:manage"]),
});
const MAX_ZONES = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ZONE_STATES = new Set(["DRAFT", "ACTIVE", "INACTIVE"]);
const POLICY_KEYS = ["kind", "contract", "zoneType", "purposes", "geometry", "mode", "factor", "currency", "kmPerGallon", "gallonUnit", "fuelType", "includedConcepts", "components"];
const COMPONENT_KEYS = ["code", "label", "kind", "basis", "includedConcepts", "costRuleRef", "costRuleVersion"];

function fail(code, status = 409) { logisticsFail(`LOGISTICS_TRANSPORT_${code}`, status); }
function identifier(value) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 191) fail("FORBIDDEN", 403);
  return value;
}
function permissionList(permissions) {
  const result = Array.isArray(permissions) ? permissions : [permissions];
  if (!result.length || result.some((permission) => typeof permission !== "string" || !permission)) fail("CONFIGURATION_INVALID", 503);
  return result;
}
export function authorizeTransportContext(context, permissions) {
  identifier(context?.tenantId); identifier(context?.membershipId); identifier(context?.userId);
  if ((context.tenantStatus !== undefined && context.tenantStatus !== "ACTIVE")
    || (context.membershipStatus !== undefined && context.membershipStatus !== "ACTIVE")
    || (context.userStatus !== undefined && String(context.userStatus).toUpperCase() !== "ACTIVE")
    || permissionList(permissions).some((permission) => !context.effectivePermissions?.includes(permission) || context.deniedPermissions?.includes(permission))) {
    fail("FORBIDDEN", 403);
  }
}

// Recheck current grants under a lock held until the calculation or mutation
// commits. A cached token/context cannot keep a revoked authority alive.
export async function revalidateTransportActor(tx, context, permissions) {
  authorizeTransportContext(context, permissions);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id", m."public_ref", m."tenant_id", m."user_id", m."role"::text AS "role", m."status"::text AS "status",
           m."granted_permissions", m."denied_permissions", u."status" AS "user_status", t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${context.tenantId} AND m."id"=${context.membershipId} AND m."user_id"=${context.userId}
    FOR SHARE OF m, u, t
  `);
  const row = rows[0];
  if (rows.length !== 1 || row.id !== context.membershipId || row.tenant_id !== context.tenantId || row.user_id !== context.userId
    || row.status !== "ACTIVE" || String(row.user_status).toUpperCase() !== "ACTIVE" || row.tenant_status !== "ACTIVE") fail("FORBIDDEN", 403);
  const grantedPermissions = Array.isArray(row.granted_permissions) ? row.granted_permissions : [];
  const deniedPermissions = Array.isArray(row.denied_permissions) ? row.denied_permissions : [];
  const effectivePermissions = effectivePermissionsFor(row.role, grantedPermissions, deniedPermissions);
  const fresh = Object.freeze({ ...context, role: row.role, membershipRef: row.public_ref,
    tenantStatus: "ACTIVE", membershipStatus: "ACTIVE", userStatus: "ACTIVE",
    grantedPermissions: Object.freeze([...grantedPermissions]), deniedPermissions: Object.freeze([...deniedPermissions]), effectivePermissions });
  authorizeTransportContext(fresh, permissions);
  return fresh;
}

function databaseCode(error) { return error?.meta?.code ?? error?.cause?.code ?? error?.code; }
export async function withTransportTransaction(prisma, work, { retryUnique = false, timeout = 30_000 } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout }); }
    catch (error) {
      const code = databaseCode(error);
      const serialization = error?.code === "P2034" || code === "40001" || code === "40P01";
      const unique = error?.code === "P2002" || code === "23505";
      if ((serialization || (retryUnique && unique)) && attempt < 2) continue;
      if (serialization) fail("VERSION_CONFLICT");
      if (unique) fail("REQUEST_CONFLICT");
      if (code === "23P01") fail("RULE_CONFLICT");
      throw error;
    }
  }
}

function namespaceWhere(tenantId) {
  return { tenantId, family: "ZONE", conditions: { path: ["transportContract"], equals: TRANSPORT_CONTRACT } };
}
function tariffWhere(tenantId, seriesRef) {
  return { tenantId, source: "MOTOR", AND: [
    { conditions: { path: ["transportContract"], equals: TRANSPORT_CONTRACT } },
    { conditions: { path: ["zoneSeriesRef"], equals: seriesRef } },
  ] };
}
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function periodContains(row, at) {
  return (row.validFrom == null || new Date(row.validFrom) <= at) && (row.validTo == null || new Date(row.validTo) > at);
}
function asIso(value) { return value == null ? null : new Date(value).toISOString(); }
function tariffFamily(component) { return ["PER_DIEM", "ALLOWANCE"].includes(component.kind) ? "TRAVEL" : "TRANSPORT"; }
function closeVersion(row, at) {
  // Two writes can share a millisecond. The state closes applicability even
  // where setting an equal endpoint would violate the strict DB period check.
  return { state: "SUPERSEDED", ...(row.validFrom == null || new Date(row.validFrom) < at ? { validTo: at } : {}) };
}
function assertZoneIdentity(row, tenantId) {
  if (row.tenantId !== tenantId || row.family !== "ZONE" || !UUID.test(row.ruleRef) || !UUID.test(row.seriesRef)
    || !Number.isSafeInteger(row.version) || row.version < 1
    || !exactKeys(row.conditions, ["transportContract", "zoneSeriesRef", "vehicleType"])
    || row.conditions.transportContract !== TRANSPORT_CONTRACT || row.conditions.zoneSeriesRef !== row.seriesRef
    || row.conditionHash !== canonicalHash(row.conditions)
    || !exactKeys(row.result, POLICY_KEYS) || row.result.kind !== "TRANSPORT_ZONE_POLICY" || row.result.contract !== TRANSPORT_CONTRACT
    || !Array.isArray(row.result.components)
    || row.result.components.some((component) => !exactKeys(component, COMPONENT_KEYS) || !UUID.test(component.costRuleRef)
      || !Number.isSafeInteger(component.costRuleVersion) || component.costRuleVersion < 1)
    || new Set(row.result.components.map((component) => component.costRuleRef)).size !== row.result.components.length) fail("ZONE_INTEGRITY");
}
function assertTariff(row, zone, component, at = null) {
  assertTariffIdentity(row, zone.tenantId, zone.seriesRef, component.code);
  if (row.ruleRef !== component.costRuleRef || row.version !== component.costRuleVersion
    || row.family !== tariffFamily(component) || row.currency !== zone.result.currency || row.state !== zone.state
    || (at && (row.state !== "ACTIVE" || !periodContains(row, at)))) fail("TARIFF_INTEGRITY");
}
function assertTariffIdentity(row, tenantId, zoneSeriesRef, componentCode) {
  const conditions = { transportContract: TRANSPORT_CONTRACT, zoneSeriesRef, componentCode };
  const keys = ["transportContract", "zoneSeriesRef", "componentCode"];
  if (!row || row.tenantId !== tenantId || !UUID.test(row.ruleRef) || !UUID.test(row.seriesRef) || !Number.isSafeInteger(row.version) || row.version < 1
    || row.source !== "MOTOR" || !["TRANSPORT", "TRAVEL"].includes(row.family)
    || row.code !== `TZ_${canonicalHash({ zoneSeriesRef, componentCode }).slice(0, 40)}`
    || !exactKeys(row.conditions, keys) || !exactKeys(row.result, keys)
    || canonicalHash(row.conditions) !== canonicalHash(conditions) || row.conditionHash !== canonicalHash(conditions)
    || canonicalHash(row.result) !== canonicalHash(conditions)) fail("TARIFF_INTEGRITY");
}

function zoneDto(row, tariffs, at = null) {
  assertZoneIdentity(row, row.tenantId);
  const policy = row.result;
  const components = policy.components.map((component) => {
    const tariff = tariffs.get(component.costRuleRef);
    assertTariff(tariff, row, component, at);
    return { ...component, unitCost: tariff.unitCost == null ? null : String(tariff.unitCost), classification: tariff.classification,
      minimumMarginBps: tariff.minimumMarginBps, recommendedMarginBps: tariff.recommendedMarginBps };
  });
  const input = { seriesRef: row.seriesRef, expectedVersion: row.version, code: row.code, name: row.name, zoneType: policy.zoneType,
    priority: row.priority, vehicleType: row.conditions.vehicleType, purposes: policy.purposes, geometry: policy.geometry,
    mode: policy.mode, factor: policy.factor, currency: policy.currency, kmPerGallon: policy.kmPerGallon, gallonUnit: policy.gallonUnit,
    fuelType: policy.fuelType, includedConcepts: policy.includedConcepts,
    components: components.map(({ costRuleRef, costRuleVersion, ...component }) => component), state: row.state };
  // Persisted JSON is a named contract, never an open bag of ignored fields.
  try {
    normalizeTransportZonePayload(input);
  } catch { fail("ZONE_INTEGRITY"); }
  const { expectedVersion, ...dto } = input;
  return Object.freeze({ ...dto, ruleRef: row.ruleRef, version: row.version, components,
    validFrom: asIso(row.validFrom), validTo: asIso(row.validTo) });
}

async function hydrateZones(tx, tenantId, rows, at = null) {
  if (rows.length > MAX_ZONES) fail("ZONE_LIMIT");
  for (const row of rows) assertZoneIdentity(row, tenantId);
  const refs = [...new Set(rows.flatMap((row) => row.result.components.map((component) => component.costRuleRef)))];
  const tariffs = refs.length ? await tx.costingRule.findMany({ where: { tenantId, ruleRef: { in: refs } } }) : [];
  const byRef = new Map(tariffs.map((row) => [row.ruleRef, row]));
  return rows.map((row) => zoneDto(row, byRef, at));
}

// Internal reader: callers revalidate their own purpose-specific authority in
// the same transaction. Only actually active zone/tariff versions enter math.
export async function loadTransportZones(tx, tenantId, at) {
  identifier(tenantId);
  const instant = new Date(at);
  if (!Number.isFinite(instant.getTime())) fail("PERIOD_INVALID", 400);
  const rows = await tx.logisticsRule.findMany({ where: { ...namespaceWhere(tenantId), state: "ACTIVE", AND: [
    { OR: [{ validFrom: null }, { validFrom: { lte: instant } }] },
    { OR: [{ validTo: null }, { validTo: { gt: instant } }] },
  ] }, orderBy: [{ priority: "desc" }, { specificity: "desc" }, { code: "asc" }], take: MAX_ZONES + 1 });
  return hydrateZones(tx, tenantId, rows, instant);
}

function parseListQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query) || Object.keys(query).some((key) => !["seriesRef", "state"].includes(key))) fail("QUERY_INVALID", 400);
  const { seriesRef, state } = query;
  if ((seriesRef !== undefined && (typeof seriesRef !== "string" || !UUID.test(seriesRef)))
    || (state !== undefined && (typeof state !== "string" || !ZONE_STATES.has(state)))) fail("QUERY_INVALID", 400);
  return { seriesRef, state };
}
export async function listTransportZones(prisma, context, query = {}) {
  authorizeTransportContext(context, TRANSPORT_ZONE_PERMISSIONS.VIEW);
  const filter = parseListQuery(query);
  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, TRANSPORT_ZONE_PERMISSIONS.VIEW);
    const rows = await tx.logisticsRule.findMany({ where: { ...namespaceWhere(actor.tenantId), ...(filter.seriesRef ? { seriesRef: filter.seriesRef } : {}) },
      distinct: ["seriesRef"], orderBy: [{ seriesRef: "asc" }, { version: "desc" }], take: MAX_ZONES + 1 });
    if (rows.length > MAX_ZONES) fail("ZONE_LIMIT");
    const selected = filter.state ? rows.filter((row) => row.state === filter.state) : rows;
    return hydrateZones(tx, actor.tenantId, selected);
  });
}

function actorData(context) { return { actorMembershipId: context.membershipId, actorUserId: context.userId }; }
function auditData(context, input, entity, entityId, action, after) {
  return { tenant_id: context.tenantId, actor_user_id: context.userId, actor_membership_id: context.membershipId,
    role_snapshot: context.role, action, entity, entityId: String(entityId), after_json: after,
    source: "V17_LOGISTICS_TRANSPORT", request_id: input.requestId, correlation_id: input.requestId, critical: true };
}
async function replayCommand(tx, actor, input) {
  const command = await tx.logisticsMutationCommand.findUnique({ where: { tenantId_requestId: { tenantId: actor.tenantId, requestId: input.requestId } } });
  if (!command) return null;
  if (command.operation !== input.operation || command.payloadHash !== input.payloadHash) fail("IDEMPOTENCY_CONFLICT");
  return Object.freeze(command.resultJson);
}

export async function versionTransportZone(prisma, context, raw) {
  authorizeTransportContext(context, TRANSPORT_ZONE_PERMISSIONS.MANAGE);
  const input = normalizeTransportZone(raw);
  const seriesRef = input.seriesRef || randomUUID();
  return withTransportTransaction(prisma, async (tx) => {
    const actor = await revalidateTransportActor(tx, context, TRANSPORT_ZONE_PERMISSIONS.MANAGE);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${input.requestId}:logistics-transport-command`}, 0))`);
    const prior = await replayCommand(tx, actor, input);
    if (prior) return prior;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:transport-zones`}, 0))`);
    const current = await tx.logisticsRule.findFirst({ where: { tenantId: actor.tenantId, seriesRef }, orderBy: { version: "desc" } });
    if (input.seriesRef && !current) fail("ZONE_NOT_FOUND", 404);
    if (current) assertZoneIdentity(current, actor.tenantId);
    if ((current?.version ?? null) !== input.expectedVersion) fail("VERSION_CONFLICT");
    const codeConflict = await tx.logisticsRule.findFirst({ where: { ...namespaceWhere(actor.tenantId), code: { equals: input.code, mode: "insensitive" }, seriesRef: { not: seriesRef } } });
    if (codeConflict) fail("ZONE_CODE_CONFLICT");
    if (!current) {
      const series = await tx.logisticsRule.findMany({ where: namespaceWhere(actor.tenantId), distinct: ["seriesRef"], select: { seriesRef: true }, take: MAX_ZONES });
      if (series.length >= MAX_ZONES) fail("ZONE_LIMIT");
    }
    const at = new Date();
    const previousTariffs = current?.result.components.length
      ? await tx.costingRule.findMany({ where: { tenantId: actor.tenantId, ruleRef: { in: current.result.components.map((component) => component.costRuleRef) } } }) : [];
    const previousByRef = new Map(previousTariffs.map((row) => [row.ruleRef, row]));
    if (current) for (const component of current.result.components) assertTariff(previousByRef.get(component.costRuleRef), current, component);
    if (input.state !== "DRAFT") {
      const activeZones = await tx.logisticsRule.findMany({ where: { ...namespaceWhere(actor.tenantId), seriesRef, state: "ACTIVE" } });
      for (const row of activeZones) {
        assertZoneIdentity(row, actor.tenantId);
        await tx.logisticsRule.update({ where: { tenantId_id: { tenantId: actor.tenantId, id: row.id } }, data: closeVersion(row, at) });
      }
      const activeTariffs = await tx.costingRule.findMany({ where: { ...tariffWhere(actor.tenantId, seriesRef), state: "ACTIVE" } });
      for (const row of activeTariffs) await tx.costingRule.update({ where: { tenantId_id: { tenantId: actor.tenantId, id: row.id } }, data: closeVersion(row, at) });
    }
    if (current && current.state !== "ACTIVE") {
      await tx.logisticsRule.update({ where: { tenantId_id: { tenantId: actor.tenantId, id: current.id } }, data: closeVersion(current, at) });
    }
    for (const row of previousTariffs.filter((tariff) => tariff.state !== "ACTIVE")) {
      await tx.costingRule.update({ where: { tenantId_id: { tenantId: actor.tenantId, id: row.id } }, data: closeVersion(row, at) });
    }
    const tariffs = [];
    for (const component of input.components) {
      const conditions = { transportContract: TRANSPORT_CONTRACT, zoneSeriesRef: seriesRef, componentCode: component.code };
      const previous = await tx.costingRule.findFirst({ where: { ...tariffWhere(actor.tenantId, seriesRef),
        AND: [...tariffWhere(actor.tenantId, seriesRef).AND, { conditions: { path: ["componentCode"], equals: component.code } }] }, orderBy: { version: "desc" } });
      if (previous) assertTariffIdentity(previous, actor.tenantId, seriesRef, component.code);
      const tariff = await tx.costingRule.create({ data: { tenantId: actor.tenantId, ruleRef: randomUUID(), seriesRef: previous?.seriesRef || randomUUID(),
        family: tariffFamily(component), code: `TZ_${canonicalHash({ zoneSeriesRef: seriesRef, componentCode: component.code }).slice(0, 40)}`,
        name: component.label, classification: component.classification, source: "MOTOR", priority: input.priority,
        specificity: input.vehicleType ? 1 : 0, conditions, conditionHash: canonicalHash(conditions), unitCost: component.unitCost,
        currency: input.currency, minimumMarginBps: component.minimumMarginBps, recommendedMarginBps: component.recommendedMarginBps,
        result: conditions, state: input.state, version: (previous?.version || 0) + 1, validFrom: at, validTo: null,
        replacesRuleId: previous?.id || null, requestId: `${input.requestId}:TZ:${canonicalHash(component.code).slice(0, 32)}`,
        payloadHash: input.payloadHash, ...actorData(actor) } });
      tariffs.push(tariff);
    }
    const conditions = { transportContract: TRANSPORT_CONTRACT, zoneSeriesRef: seriesRef, vehicleType: input.vehicleType };
    const policy = { kind: "TRANSPORT_ZONE_POLICY", contract: TRANSPORT_CONTRACT, zoneType: input.zoneType, purposes: input.purposes,
      geometry: input.geometry, mode: input.mode, factor: input.factor, currency: input.currency, kmPerGallon: input.kmPerGallon,
      gallonUnit: input.gallonUnit, fuelType: input.fuelType, includedConcepts: input.includedConcepts,
      components: input.components.map((component, index) => ({ code: component.code, label: component.label, kind: component.kind,
        basis: component.basis, includedConcepts: component.includedConcepts, costRuleRef: tariffs[index].ruleRef, costRuleVersion: tariffs[index].version })) };
    const row = await tx.logisticsRule.create({ data: { tenantId: actor.tenantId, ruleRef: randomUUID(), seriesRef, family: "ZONE",
      code: input.code, name: input.name, priority: input.priority, specificity: input.vehicleType ? 1 : 0,
      conditions, conditionHash: canonicalHash(conditions), result: policy, state: input.state, version: (current?.version || 0) + 1,
      validFrom: at, validTo: null, replacesRuleId: current?.id || null, requestId: input.requestId, payloadHash: input.payloadHash, ...actorData(actor) } });
    const result = zoneDto(row, new Map(tariffs.map((tariff) => [tariff.ruleRef, tariff])));
    await tx.logisticsMutationCommand.create({ data: { tenantId: actor.tenantId, requestId: input.requestId, operation: input.operation,
      payloadHash: input.payloadHash, targetRef: row.ruleRef, resultJson: result, ...actorData(actor) } });
    await tx.commercialAuditLog.create({ data: auditData(actor, input, "LogisticsRule", row.ruleRef,
      current ? "TRANSPORT_ZONE_VERSION" : "TRANSPORT_ZONE_CREATE",
      { ruleRef: row.ruleRef, seriesRef, version: row.version, state: row.state, code: row.code, payloadHash: input.payloadHash,
        tariffs: tariffs.map((tariff) => ({ ruleRef: tariff.ruleRef, seriesRef: tariff.seriesRef, version: tariff.version })) }) });
    for (const tariff of tariffs) {
      await tx.commercialAuditLog.create({ data: auditData(actor, input, "CostingRule", tariff.ruleRef, "TRANSPORT_TARIFF_VERSION",
        { ruleRef: tariff.ruleRef, seriesRef: tariff.seriesRef, version: tariff.version, zoneSeriesRef: seriesRef, componentCode: tariff.conditions.componentCode, payloadHash: input.payloadHash }) });
    }
    return result;
  }, { retryUnique: true });
}
