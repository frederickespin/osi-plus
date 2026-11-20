import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { CrmCaseMutationError, hashCrmCaseMutation } from "./crmCaseMutationDomain.js";
import { PERMS, permsForRole } from "./rbac.js";

const PUBLIC_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$/;
const COUNTRY = /^[A-Z]{2}$/;
const DESTINATION_STATUSES = new Set(["CONFIRMED", "APPROXIMATE", "PENDING"]);
const ADDRESS_FIELDS = new Set([
  "sourceAddressRef", "countryCode", "provinceState", "cityMunicipality", "sector",
  "streetAndNumber", "buildingResidential", "floorUnit", "arrivalReference",
  "locationContactName", "locationContactPhone",
]);
const COMMAND_FIELDS = new Set([
  "requestId", "payloadHash", "expectedVersion", "expectedRouteRevision",
  "destinationStatus", "origin", "destination",
]);

function fail(code, status = 400) { throw new CrmCaseMutationError(code, status); }
function exact(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) fail("CRM_CASE_ROUTE_INPUT_INVALID");
}
function text(value, max, optional = false) {
  if ((value === null || value === undefined || value === "") && optional) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max
    || /[\u0000-\u001f\u007f\ufeff]/u.test(value)) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  return value;
}
function publicRef(value) {
  if (typeof value !== "string" || !PUBLIC_REF.test(value)) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return value;
}
function positiveInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  return value;
}
function nullableRef(value) {
  if (value === null) return null;
  return publicRef(value);
}
function normalizeAddress(value) {
  exact(value, ADDRESS_FIELDS);
  const countryCode = text(value.countryCode, 2);
  if (!COUNTRY.test(countryCode)) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  return Object.freeze({
    sourceAddressRef: nullableRef(value.sourceAddressRef),
    countryCode,
    provinceState: text(value.provinceState, 160, true),
    cityMunicipality: text(value.cityMunicipality, 160),
    sector: text(value.sector, 160, true),
    streetAndNumber: text(value.streetAndNumber, 240, true),
    buildingResidential: text(value.buildingResidential, 160, true),
    floorUnit: text(value.floorUnit, 80, true),
    arrivalReference: text(value.arrivalReference, 320, true),
    locationContactName: text(value.locationContactName, 160, true),
    locationContactPhone: text(value.locationContactPhone, 40, true),
  });
}
function normalizeCommand(input) {
  exact(input, COMMAND_FIELDS);
  const destinationStatus = text(input.destinationStatus, 32);
  if (!DESTINATION_STATUSES.has(destinationStatus)) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  const destination = input.destination === null ? null : normalizeAddress(input.destination);
  if ((destinationStatus === "PENDING") !== (destination === null)) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  const normalized = Object.freeze({
    operation: "UPDATE_CASE_ROUTE",
    requestId: text(input.requestId, 191),
    expectedVersion: positiveInteger(input.expectedVersion),
    expectedRouteRevision: positiveInteger(input.expectedRouteRevision),
    destinationStatus,
    origin: normalizeAddress(input.origin),
    destination,
  });
  if (!REQUEST_ID.test(normalized.requestId) || typeof input.payloadHash !== "string" || !HASH.test(input.payloadHash)
    || hashCrmCaseMutation(normalized) !== input.payloadHash) fail("CRM_PIPELINE_PAYLOAD_HASH_INVALID");
  return Object.freeze({ ...normalized, payloadHash: input.payloadHash });
}
function effectivePermissions(role, granted, denied) {
  const blocked = new Set((denied || []).map(String));
  return new Set([...permsForRole(role), ...(granted || []).map(String)].filter((permission) => !blocked.has(permission)));
}
async function actor(tx, context) {
  const tenantId = text(context?.tenantId, 191);
  const membershipId = text(context?.membershipId, 191);
  const userId = text(context?.userId, 191);
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT m."id",m."tenant_id",m."user_id",m."role"::text AS "role",m."status"::text AS "membership_status",
      m."granted_permissions",m."denied_permissions",u."status" AS "user_status",u."name",t."status"::text AS "tenant_status"
    FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    JOIN "osi"."tenants" t ON t."id"=m."tenant_id"
    WHERE m."tenant_id"=${tenantId} AND m."id"=${membershipId} AND m."user_id"=${userId}
    LIMIT 1 FOR UPDATE OF m
  `);
  const row = rows[0];
  if (!row) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  const role = String(row.role || "").toUpperCase();
  const denied = new Set((row.denied_permissions || []).map(String));
  const permissions = effectivePermissions(role, row.granted_permissions, row.denied_permissions);
  const permission = role === "A" ? PERMS.PIPELINE_UPDATE_ANY : PERMS.PIPELINE_UPDATE_OWN;
  if (!new Set(["A", "V"]).has(role) || String(row.user_status).toUpperCase() !== "ACTIVE"
    || row.membership_status !== "ACTIVE" || row.tenant_status !== "ACTIVE"
    || denied.has(permission) || !permissions.has(permission)) fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
  return Object.freeze({ tenantId, membershipId: row.id, userId: row.user_id, role, name: String(row.name || "Usuario") });
}
function addressDto(row) {
  return Object.freeze({
    sourceAddressRef: row.sourceAddressRef ?? row.addressRef ?? null,
    countryCode: row.countryCode,
    provinceState: row.provinceState,
    cityMunicipality: row.cityMunicipality,
    sector: row.sector,
    streetAndNumber: row.streetAndNumber,
    buildingResidential: row.buildingResidential,
    floorUnit: row.floorUnit,
    arrivalReference: row.arrivalReference,
    locationContactName: row.locationContactName,
    locationContactPhone: row.locationContactPhone,
  });
}
function compactAddress(row) {
  return [row.streetAndNumber, row.buildingResidential, row.floorUnit, row.sector, row.cityMunicipality, row.provinceState, row.countryCode]
    .filter(Boolean).join(", ");
}
function optionKey(row) {
  return [row.countryCode, row.provinceState, row.cityMunicipality, row.sector, row.streetAndNumber, row.buildingResidential, row.floorUnit]
    .map((value) => String(value || "").trim().toLocaleLowerCase("es-DO")).join("|");
}
async function routeOptions(tx, tenantId, clientId, excludedCaseId = null) {
  const registered = await tx.clientAddress.findMany({
    where: { tenantId, clientId, status: "ACTIVE" },
    orderBy: [{ updatedAt: "desc" }, { label: "asc" }],
    take: 20,
  });
  const recentCases = await tx.pipelineCase.findMany({
    where: { tenantId, clientId, routeRevision: { gt: 0 }, ...(excludedCaseId ? { id: { not: excludedCaseId } } : {}) },
    select: { id: true, caseCode: true, routeRevision: true, updatedAt: true, serviceType: true },
    orderBy: { updatedAt: "desc" },
    take: 2,
  });
  const recent = [];
  for (const item of recentCases) {
    const rows = await tx.pipelineCaseRouteSnapshot.findMany({
      where: { tenantId, pipelineCaseId: item.id, routeVersion: item.routeRevision, role: { in: ["ORIGIN", "DESTINATION"] } },
      orderBy: [{ role: "asc" }, { stopOrder: "asc" }],
    });
    for (const row of rows) recent.push({ row, item });
  }
  const seen = new Set();
  const options = [];
  for (const row of registered) {
    const key = optionKey(row); if (seen.has(key)) continue; seen.add(key);
    options.push(Object.freeze({ optionId: `REGISTERED:${row.addressRef}`, source: "REGISTERED", label: row.label || "Dirección registrada", caseCode: null, serviceType: null, usedAt: row.updatedAt, address: addressDto(row) }));
  }
  for (const { row, item } of recent) {
    const key = optionKey(row); if (seen.has(key)) continue; seen.add(key);
    options.push(Object.freeze({ optionId: `RECENT:${item.id}:${row.role}`, source: "RECENT_SERVICE", label: `${row.role === "ORIGIN" ? "Origen" : "Destino"} · ${item.caseCode}`, caseCode: item.caseCode, serviceType: item.serviceType, usedAt: item.updatedAt, address: addressDto({ ...row, sourceAddressRef: null }) }));
  }
  return Object.freeze(options);
}
async function caseAuthority(database, context, ref) {
  const item = await database.pipelineCase.findFirst({
    where: { tenantId: context.tenantId, publicRef: publicRef(ref) },
    select: { id: true, publicRef: true, caseCode: true, clientId: true, version: true, routeRevision: true, destinationStatus: true, status: true, ownerMembershipId: true, ownerUserId: true },
  });
  if (!item || (context.role === "V" && (item.ownerMembershipId !== context.membershipId || item.ownerUserId !== context.userId))) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return item;
}
async function currentRoute(database, tenantId, item) {
  const rows = await database.pipelineCaseRouteSnapshot.findMany({
    where: { tenantId, pipelineCaseId: item.id, routeVersion: item.routeRevision },
    orderBy: [{ role: "asc" }, { stopOrder: "asc" }],
  });
  const origin = rows.find((row) => row.role === "ORIGIN");
  const destination = rows.find((row) => row.role === "DESTINATION");
  if (!origin || (item.destinationStatus !== "PENDING" && !destination)) fail("CRM_ICP_STATE_CONFLICT", 409);
  return Object.freeze({
    revision: item.routeRevision,
    destinationStatus: item.destinationStatus,
    origin: addressDto(origin),
    destination: destination ? addressDto(destination) : null,
  });
}

export async function getClientCaseRouteOptions(context, ref, database = prisma) {
  const client = await database.client.findFirst({ where: { tenantId: context.tenantId, publicRef: publicRef(ref), status: "ACTIVE" }, select: { id: true, publicRef: true } });
  if (!client) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
  return Object.freeze({ clientRef: client.publicRef, options: await routeOptions(database, context.tenantId, client.id) });
}

export async function getCaseRouteEditor(context, ref, database = prisma) {
  const item = await caseAuthority(database, context, ref);
  return Object.freeze({
    caseRef: item.publicRef,
    caseCode: item.caseCode,
    version: item.version,
    route: await currentRoute(database, context.tenantId, item),
    options: item.clientId ? await routeOptions(database, context.tenantId, item.clientId, item.id) : Object.freeze([]),
  });
}

export async function getCaseRouteCoverage(context, ref, { longitude, latitude }, database = prisma) {
  if (typeof longitude !== "string" || typeof latitude !== "string"
    || !/^-?\d{1,3}(?:\.\d{1,8})?$/.test(longitude) || !/^-?\d{1,3}(?:\.\d{1,8})?$/.test(latitude)
    || Math.abs(Number(longitude)) > 180 || Math.abs(Number(latitude)) > 90) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  await caseAuthority(database, context, ref);
  const { transportCoverageAt } = await import("./logisticsTransportZones.js");
  return { areas: await transportCoverageAt(database, context.tenantId, [Number(longitude), Number(latitude)]) };
}

export async function getCaseRouteTravel(context, ref, { baseAddress, localTerminalAddress }, database = prisma) {
  for (const value of [baseAddress, localTerminalAddress]) {
    if (value !== undefined && (typeof value !== "string" || value.length > 240)) fail("CRM_CASE_ROUTE_INPUT_INVALID");
  }
  const item = await caseAuthority(database, context, ref);
  const [{ caseDailyTravel }, { loadTransportZones }, route] = await Promise.all([
    import("./caseDailyTravel.js"), import("./logisticsTransportZones.js"), currentRoute(database, context.tenantId, item),
  ]);
  return caseDailyTravel(await loadTransportZones(database, context.tenantId, new Date()), route, { baseAddress, localTerminalAddress });
}

async function materializeAddress(tx, actorRow, clientId, address) {
  if (!address.sourceAddressRef) return address;
  const registered = await tx.clientAddress.findFirst({ where: { tenantId: actorRow.tenantId, clientId, addressRef: address.sourceAddressRef, status: "ACTIVE" } });
  if (!registered) fail("CRM_CASE_ROUTE_ADDRESS_UNAVAILABLE", 409);
  return addressDto(registered);
}
function snapshotData(address, role) {
  return { role, stopOrder: 0, ...address };
}
function deriveMode(origin, destination) {
  if (!destination || (origin.countryCode === "DO" && destination.countryCode === "DO")) return "LOCAL";
  return origin.countryCode === "DO" ? "EXPORT" : "IMPORT";
}

export async function updateCaseRoute(context, ref, input, database = prisma) {
  const command = normalizeCommand(input);
  try {
    return await database.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '250ms'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      const who = await actor(tx, context);
      const lock = await tx.$queryRaw(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`CRM-CASE-ROUTE:${who.tenantId}:${ref}`},0)) AS "ok"`);
      if (lock[0]?.ok !== true) fail("CRM_PIPELINE_COMMAND_IN_PROGRESS", 409);
      const item = await tx.pipelineCase.findFirst({ where: { tenantId: who.tenantId, publicRef: publicRef(ref) } });
      if (!item) fail("CRM_PIPELINE_RESOURCE_NOT_FOUND", 404);
      if (who.role === "V" && (item.ownerMembershipId !== who.membershipId || item.ownerUserId !== who.userId)) fail("CRM_PIPELINE_PERMISSION_FORBIDDEN", 403);
      const prior = await tx.pipelineCaseCommand.findFirst({ where: { tenantId: who.tenantId, requestId: command.requestId } });
      if (prior) {
        if (prior.pipelineCaseId !== item.id || prior.commandType !== "UPDATE" || prior.payloadHash !== command.payloadHash) fail("CRM_PIPELINE_IDEMPOTENCY_CONFLICT", 409);
        return getCaseRouteEditor(context, ref, tx);
      }
      if (item.version !== command.expectedVersion || item.routeRevision !== command.expectedRouteRevision) fail("CRM_PIPELINE_VERSION_CONFLICT", 409);
      if (!item.clientId) fail("CRM_CASE_ROUTE_CLIENT_REQUIRED", 409);
      const origin = await materializeAddress(tx, who, item.clientId, command.origin);
      const destination = command.destination ? await materializeAddress(tx, who, item.clientId, command.destination) : null;
      const existingStops = await tx.pipelineCaseRouteSnapshot.findMany({ where: { tenantId: who.tenantId, pipelineCaseId: item.id, routeVersion: item.routeRevision, role: "ADDITIONAL_STOP" }, orderBy: { stopOrder: "asc" } });
      const routeRevision = item.routeRevision + 1;
      const version = item.version + 1;
      await tx.pipelineCaseRouteSnapshot.createMany({ data: [
        { tenantId: who.tenantId, pipelineCaseId: item.id, routeVersion: routeRevision, ...snapshotData(origin, "ORIGIN") },
        ...(destination ? [{ tenantId: who.tenantId, pipelineCaseId: item.id, routeVersion: routeRevision, ...snapshotData(destination, "DESTINATION") }] : []),
        ...existingStops.map((stop) => ({ tenantId: who.tenantId, pipelineCaseId: item.id, routeVersion: routeRevision, role: "ADDITIONAL_STOP", stopOrder: stop.stopOrder, sourceAddressRef: stop.sourceAddressRef, countryCode: stop.countryCode, provinceState: stop.provinceState, cityMunicipality: stop.cityMunicipality, sector: stop.sector, streetAndNumber: stop.streetAndNumber, buildingResidential: stop.buildingResidential, floorUnit: stop.floorUnit, arrivalReference: stop.arrivalReference, locationContactName: stop.locationContactName, locationContactPhone: stop.locationContactPhone })),
      ] });
      const changed = await tx.pipelineCase.updateMany({
        where: { id: item.id, tenantId: who.tenantId, version: item.version, routeRevision: item.routeRevision },
        data: { version, routeRevision, destinationStatus: command.destinationStatus, mode: deriveMode(origin, destination), originLocation: compactAddress(origin), destinationLocation: destination ? compactAddress(destination) : "PENDING" },
      });
      if (changed.count !== 1) fail("CRM_PIPELINE_VERSION_CONFLICT", 409);
      await tx.pipelineCaseCommand.create({ data: { tenantId: who.tenantId, pipelineCaseId: item.id, requestId: command.requestId, commandType: "UPDATE", payloadHash: command.payloadHash, expectedVersion: item.version, resultingVersion: version, previousStatus: item.status, resultingStatus: item.status, previousOwnerMembershipId: item.ownerMembershipId, previousOwnerUserId: item.ownerUserId, resultingOwnerMembershipId: item.ownerMembershipId, resultingOwnerUserId: item.ownerUserId, actorMembershipId: who.membershipId, actorUserId: who.userId, actorRole: who.role } });
      await appendCommercialAudit(tx, { tenantId: who.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: who.membershipId }, { source: "CRM_CASE_ROUTE", action: "CRM_CASE_ROUTE_UPDATED", entity: "PIPELINE_CASE", entityId: item.id, requestId: command.requestId, correlationId: command.requestId, beforeJson: { version: item.version, routeRevision: item.routeRevision }, afterJson: { version, routeRevision, destinationStatus: command.destinationStatus }, metadataJson: { recalculationRequired: true } });
      return getCaseRouteEditor(context, ref, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof CrmCaseMutationError) throw error;
    throw new CrmCaseMutationError("CRM_PIPELINE_DATABASE_UNAVAILABLE", 503, undefined, { cause: error });
  }
}
