import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { FLEET_DRIVER_TIME_ZONE } from "../../shared/adminFleetDrivers.js";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import {
  APPROVAL_PERMISSIONS, createApprovalRequestInTransaction, decideApprovalRequestInTransaction,
  unwrapApprovalRequestTransactionResult,
} from "./approvalRequest.js";
import { authorizeFleetContext, revalidateFleetActor } from "./fleetActor.js";
import {
  fleetDriverFail, fleetDriverReference, fleetDriverVehicleRef, normalizeFleetDriverQuery,
  parseFleetAuthorizationDecision, parseFleetPrimaryCommand, parseFleetTemporaryRequest,
} from "./fleetDriversContract.js";

const SOURCE = "V17_FLEET_DRIVER_AUTHORITY_19F";
const ENTITY = "FLEET_DRIVER_AUTHORIZATION";
const APPROVAL_TYPE = "FLEET_DRIVER_TEMPORARY";
const PERMISSIONS = Object.freeze({ assign: "fleet:drivers:assign", request: "fleet:drivers:request", authorize: "fleet:drivers:authorize" });
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const iso = (value) => value == null ? null : new Date(value).toISOString();
const utcDay = (value) => iso(value)?.slice(0, 10);
const businessDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: FLEET_DRIVER_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
function businessDay(value) {
  const parts = Object.fromEntries(businessDayFormat.formatToParts(value).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const person = (row) => row ? { membershipRef: row.membership_ref, displayName: row.display_name } : null;
const result = (vehicleRef, reference, version, idempotent = false) => ({ vehicleRef, reference, version: Number(version), idempotent });
const permissionDto = (actor) => Object.fromEntries(Object.entries(PERMISSIONS).map(([key, value]) => [key, actor.effective.has(value)]));

export async function fleetDriversTransaction(prisma, work) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
    } catch (error) {
      const sqlState = String(error?.meta?.code || error?.cause?.code || "");
      const rollbackConfirmed = error?.code === "P2034" || ["40001", "40P01"].includes(sqlState);
      if (rollbackConfirmed && attempt < 2) continue;
      if (rollbackConfirmed) fleetDriverFail("VERSION_CONFLICT", 409);
      if (error?.code === "P2002" || sqlState === "23505") fleetDriverFail("REQUEST_CONFLICT", 409);
      throw error; // A connection/commit outcome that is uncertain must never replay a write.
    }
  }
}
async function nowFor(tx) {
  const [row] = await tx.$queryRaw(Prisma.sql`SELECT clock_timestamp() AS "now"`);
  return new Date(row.now);
}
async function actorFor(tx, context, permission = null, lock = false) {
  if (lock) {
    const rows = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."tenants" WHERE "id"=${context.tenantId} FOR UPDATE`);
    if (rows.length !== 1) fleetDriverFail("FORBIDDEN", 403);
  }
  return revalidateFleetActor(tx, context, { permission });
}
async function vehicleFor(tx, actor, vehicleRef, lock = false) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId} AND "id"=${vehicleRef}
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  if (rows.length !== 1) fleetDriverFail("NOT_FOUND", 404);
  return rows[0];
}
function requireMutableVehicle(vehicle) {
  if (vehicle.operational_status === "RETIRED" || vehicle.retired_at) fleetDriverFail("VEHICLE_RETIRED", 409);
}
function eligible(row, at) {
  if (!row || row.membership_role !== "E" || row.membership_status !== "ACTIVE" || String(row.user_status).toUpperCase() !== "ACTIVE") return false;
  if (!row.profile_id) return true;
  // Date-only employment fields retain their calendar date; the instant's
  // calendar day follows the company's configured display timezone.
  const today = businessDay(at);
  return row.employment_status === "ACTIVE"
    && (!row.operational_valid_from || new Date(row.operational_valid_from) <= at)
    && (!row.operational_valid_to || new Date(row.operational_valid_to) > at)
    && (!row.hired_at || utcDay(row.hired_at) <= today)
    && (!row.contract_starts_at || utcDay(row.contract_starts_at) <= today)
    && (!row.contract_ends_at || utcDay(row.contract_ends_at) >= today)
    && (!row.terminated_at || utcDay(row.terminated_at) > today);
}
function personColumns() {
  return Prisma.sql`m."id" AS "membership_id", m."public_ref"::text AS "membership_ref", m."user_id",
    m."role"::text AS "membership_role", m."status"::text AS "membership_status", u."status" AS "user_status",
    COALESCE(NULLIF(BTRIM(i."full_name"), ''), u."name") AS "display_name", p."id" AS "profile_id",
    p."employment_status"::text AS "employment_status", p."operational_valid_from", p."operational_valid_to",
    p."hired_at", p."contract_starts_at", p."contract_ends_at", p."terminated_at"`;
}
function personJoins() {
  return Prisma.sql`FROM "osi"."tenant_memberships" m
    JOIN "osi"."osi_users" u ON u."id"=m."user_id"
    LEFT JOIN "osi"."tenant_user_identities" i ON i."tenant_id"=m."tenant_id" AND i."membership_id"=m."id" AND i."user_id"=m."user_id"
    LEFT JOIN "osi"."employee_profiles" p ON p."tenant_id"=m."tenant_id" AND p."membership_id"=m."id" AND p."user_id"=m."user_id"`;
}
async function peopleFor(tx, tenantId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await tx.$queryRaw(Prisma.sql`SELECT ${personColumns()} ${personJoins()}
    WHERE m."tenant_id"=${tenantId} AND m."id" IN (${Prisma.join(unique)})`);
  return new Map(rows.map((row) => [row.membership_id, row]));
}
async function driverFor(tx, tenantId, reference, at, { byId = false, requireEligible = true, lock = false } = {}) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT ${personColumns()} ${personJoins()}
    WHERE m."tenant_id"=${tenantId} AND ${byId ? Prisma.sql`m."id"=${reference}` : Prisma.sql`m."public_ref"=${reference}::uuid`}
    ${lock ? Prisma.sql`FOR SHARE OF m, u` : Prisma.empty}`);
  if (rows.length !== 1) {
    if (!requireEligible) return null;
    fleetDriverFail("DRIVER_NOT_FOUND", 404);
  }
  const row = rows[0];
  if (lock) {
    const profiles = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."employee_profiles"
      WHERE "tenant_id"=${tenantId} AND "membership_id"=${row.membership_id} FOR SHARE`);
    if (profiles.length > 1) fleetDriverFail("DRIVER_UNAVAILABLE", 409);
  }
  if (requireEligible && !eligible(row, at)) fleetDriverFail("DRIVER_UNAVAILABLE", 409);
  return row;
}
async function audit(tx, actor, event, writer = appendCommercialAudit) {
  await writer(tx, { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId }, {
    source: SOURCE, critical: true, correlationId: event.requestId, ...event,
  });
}
function commandHash(actor, operation, vehicleRef, command, authorizationRef = null) {
  return hash({ tenantId: actor.tenantId, actorMembershipId: actor.membershipId, actorUserId: actor.userId, operation, vehicleRef, authorizationRef, command });
}
function approvalContext(actor, permission) {
  return { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId, permissions: [permission] };
}
async function currentPrimary(tx, tenantId, vehicleId, at = null) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."fleet_driver_primary_events"
    WHERE "tenant_id"=${tenantId} AND "vehicle_id"=${vehicleId} ${at ? Prisma.sql`AND "assigned_at"<=${at}` : Prisma.empty}
    ORDER BY "revision" DESC LIMIT 1`);
  return rows[0] ?? null;
}
function primaryDto(row, people, at) {
  const driver = people.get(row.driver_membership_id);
  return { kind: "PRIMARY", assignmentRef: row.id, revision: Number(row.revision), driver: person(driver), driverEligible: eligible(driver, at),
    assignedBy: person(people.get(row.assigned_by_membership_id)), assignedAt: iso(row.assigned_at), reason: row.reason };
}
function temporarySelect() {
  return Prisma.sql`f.*, a."status"::text AS "approval_status", a."version" AS "approval_version",
    a."request_reason", a."requested_at", a."decider_membership_id", a."decider_user_id", a."decided_at", a."decision_reason",
    a."approval_type", a."entity" AS "approval_entity", a."entity_id" AS "approval_entity_id", a."evaluation_snapshot_json"`;
}
function temporaryFrom() {
  return Prisma.sql`FROM "osi"."fleet_driver_authorizations" f JOIN "osi"."approval_requests" a
    ON a."tenant_id"=f."tenant_id" AND a."id"=f."approval_request_id"`;
}
async function temporaryFor(tx, tenantId, vehicleId, authorizationRef, lock = false) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT ${temporarySelect()} ${temporaryFrom()}
    WHERE f."tenant_id"=${tenantId} AND f."vehicle_id"=${vehicleId} AND f."id"=${authorizationRef}::uuid
    ${lock ? Prisma.sql`FOR UPDATE OF f, a` : Prisma.empty}`);
  if (rows.length !== 1) fleetDriverFail("NOT_FOUND", 404);
  return rows[0];
}
function validSeal(row) {
  return row.approval_status === "APPROVED" && row.decision_action === "APPROVE"
    && Boolean(row.authorized_at && row.authorized_by_membership_id && row.authorized_by_user_id)
    && row.authorized_by_user_id !== row.driver_user_id
    && row.authorized_by_membership_id === row.decider_membership_id && row.authorized_by_user_id === row.decider_user_id
    && Boolean(row.decided_at) && new Date(row.authorized_at) >= new Date(row.decided_at)
    && new Date(row.authorized_at) < new Date(row.ends_at)
    && row.approval_type === APPROVAL_TYPE && row.approval_entity === ENTITY && row.approval_entity_id === row.id
    && row.evaluation_snapshot_json?.fleetDriverScopeHash === row.scope_hash;
}
function temporaryDto(row, people, actor, vehicle, at) {
  const driver = people.get(row.driver_membership_id);
  const driverEligible = eligible(driver, at);
  const expired = new Date(row.ends_at) <= at;
  const status = row.approval_status === "PENDING" && expired ? "EXPIRED" : row.approval_status;
  const retired = vehicle.operational_status === "RETIRED" || Boolean(vehicle.retired_at);
  const sealed = validSeal(row);
  let effectiveStatus;
  if (row.revoked_at) effectiveStatus = "REVOKED";
  else if (["REJECTED", "CANCELLED", "EXPIRED"].includes(status)) effectiveStatus = status;
  else if (expired) effectiveStatus = "EXPIRED";
  else if (status === "PENDING") effectiveStatus = "PENDING";
  else if (!sealed || !driverEligible || retired) effectiveStatus = "UNAVAILABLE";
  else if (new Date(row.starts_at) > at || new Date(row.authorized_at) > at) effectiveStatus = "SCHEDULED";
  else effectiveStatus = "ACTIVE";
  const canDecide = actor.effective.has(PERMISSIONS.authorize) && status === "PENDING" && !retired;
  return { kind: "TEMPORARY", authorizationRef: row.id, driver: person(driver), driverEligible,
    startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), reason: row.request_reason, status, effectiveStatus,
    requestedBy: person(people.get(row.requested_by_membership_id)), requestedAt: iso(row.requested_at),
    decidedBy: person(people.get(row.decider_membership_id)), decidedAt: iso(row.decided_at), decisionReason: row.decision_reason ?? null,
    revokedBy: person(people.get(row.revoked_by_membership_id)), revokedAt: iso(row.revoked_at), revocationReason: row.revocation_reason ?? null,
    version: Number(row.row_version), canApprove: canDecide && driverEligible && actor.userId !== row.driver_user_id,
    canReject: canDecide, canRevoke: actor.effective.has(PERMISSIONS.authorize) && sealed && !row.revoked_at };
}

export async function listFleetDriverOptions(prisma, context, input = {}) {
  authorizeFleetContext(context);
  const query = normalizeFleetDriverQuery(input);
  return fleetDriversTransaction(prisma, async (tx) => {
    const actor = await actorFor(tx, context); const at = await nowFor(tx); const today = businessDay(at);
    const search = `%${query.search.replace(/[\\%_]/gu, "\\$&")}%`;
    const condition = Prisma.sql`m."tenant_id"=${actor.tenantId} AND m."role"='E' AND m."status"='ACTIVE'
      AND UPPER(u."status")='ACTIVE'
      AND (p."id" IS NULL OR (p."employment_status"='ACTIVE'
        AND (p."operational_valid_from" IS NULL OR p."operational_valid_from"<=${at})
        AND (p."operational_valid_to" IS NULL OR p."operational_valid_to">${at})
        AND (p."hired_at" IS NULL OR p."hired_at"<=${today}::date)
        AND (p."contract_starts_at" IS NULL OR p."contract_starts_at"<=${today}::date)
        AND (p."contract_ends_at" IS NULL OR p."contract_ends_at">=${today}::date)
        AND (p."terminated_at" IS NULL OR p."terminated_at">${today}::date)))
      AND COALESCE(NULLIF(BTRIM(i."full_name"), ''), u."name") ILIKE ${search}`;
    const [count] = await tx.$queryRaw(Prisma.sql`SELECT COUNT(*)::integer AS "total" ${personJoins()} WHERE ${condition}`);
    const rows = await tx.$queryRaw(Prisma.sql`SELECT ${personColumns()} ${personJoins()} WHERE ${condition}
      ORDER BY LOWER(COALESCE(NULLIF(BTRIM(i."full_name"), ''), u."name")), m."id" LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    return { data: rows.map(person), total: Number(count.total), page: query.page, pageSize: query.pageSize };
  });
}

export async function getFleetDrivers(prisma, context, vehicleRef, filters = {}) {
  authorizeFleetContext(context);
  const ref = fleetDriverVehicleRef(vehicleRef); const query = normalizeFleetDriverQuery(filters, { allowHistoryKind: true });
  return fleetDriversTransaction(prisma, async (tx) => {
    const actor = await actorFor(tx, context); const vehicle = await vehicleFor(tx, actor, ref); const at = await nowFor(tx);
    const primary = await currentPrimary(tx, actor.tenantId, ref);
    let rows; let total;
    if (query.historyKind === "PRIMARY") {
      const [count] = await tx.$queryRaw(Prisma.sql`SELECT COUNT(*)::integer AS "total" FROM "osi"."fleet_driver_primary_events" WHERE "tenant_id"=${actor.tenantId} AND "vehicle_id"=${ref}`);
      total = Number(count.total);
      rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."fleet_driver_primary_events" WHERE "tenant_id"=${actor.tenantId} AND "vehicle_id"=${ref}
        ORDER BY "revision" DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    } else {
      const [count] = await tx.$queryRaw(Prisma.sql`SELECT COUNT(*)::integer AS "total" FROM "osi"."fleet_driver_authorizations" WHERE "tenant_id"=${actor.tenantId} AND "vehicle_id"=${ref}`);
      total = Number(count.total);
      rows = await tx.$queryRaw(Prisma.sql`SELECT ${temporarySelect()} ${temporaryFrom()} WHERE f."tenant_id"=${actor.tenantId} AND f."vehicle_id"=${ref}
        ORDER BY f."created_at" DESC, f."id" DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    }
    const people = await peopleFor(tx, actor.tenantId, [primary?.driver_membership_id, primary?.assigned_by_membership_id,
      ...rows.flatMap((row) => [row.driver_membership_id, row.assigned_by_membership_id, row.requested_by_membership_id, row.decider_membership_id, row.revoked_by_membership_id])]);
    return { vehicle: { vehicleRef: ref, businessCode: vehicle.business_code, plate: vehicle.plate, operationalStatus: vehicle.operational_status },
      primaryDriver: primary?.driver_membership_id ? primaryDto(primary, people, at) : null, primaryVersion: Number(primary?.revision ?? 0),
      generatedAt: at.toISOString(), historyKind: query.historyKind,
      data: rows.map((row) => query.historyKind === "PRIMARY" ? primaryDto(row, people, at) : temporaryDto(row, people, actor, vehicle, at)),
      total, page: query.page, pageSize: query.pageSize, permissions: permissionDto(actor) };
  });
}

export async function setFleetPrimaryDriver(prisma, context, vehicleRef, input, options = {}) {
  authorizeFleetContext(context, { permission: PERMISSIONS.assign });
  const ref = fleetDriverVehicleRef(vehicleRef); const command = parseFleetPrimaryCommand(input);
  return fleetDriversTransaction(prisma, async (tx) => {
    const actor = await actorFor(tx, context, PERMISSIONS.assign, true); const vehicle = await vehicleFor(tx, actor, ref, true);
    const payloadHash = commandHash(actor, "PRIMARY", ref, command);
    const previous = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."fleet_driver_primary_events" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${command.requestId}::uuid`);
    if (previous[0]) {
      if (previous[0].payload_hash !== payloadHash) fleetDriverFail("REQUEST_CONFLICT", 409);
      return result(ref, previous[0].id, previous[0].revision, true);
    }
    requireMutableVehicle(vehicle);
    const current = await currentPrimary(tx, actor.tenantId, ref); const version = Number(current?.revision ?? 0);
    if (version !== command.expectedVersion) fleetDriverFail("VERSION_CONFLICT", 409);
    const at = await nowFor(tx);
    const driver = command.driverMembershipRef ? await driverFor(tx, actor.tenantId, command.driverMembershipRef, at, { lock: true }) : null;
    const id = randomUUID();
    const rows = await tx.$queryRaw(Prisma.sql`INSERT INTO "osi"."fleet_driver_primary_events"
      ("id", "tenant_id", "vehicle_id", "revision", "driver_membership_id", "driver_user_id", "assigned_by_membership_id", "assigned_by_user_id", "reason", "assigned_at", "request_id", "payload_hash")
      VALUES (${id}::uuid, ${actor.tenantId}, ${ref}, ${version + 1}, ${driver?.membership_id ?? null}, ${driver?.user_id ?? null},
        ${actor.membershipId}, ${actor.userId}, ${command.reason}, ${at}, ${command.requestId}::uuid, ${payloadHash}) RETURNING "id", "revision"`);
    await audit(tx, actor, { action: driver ? "FLEET_PRIMARY_DRIVER_ASSIGNED" : "FLEET_PRIMARY_DRIVER_CLEARED", entity: "FLEET_DRIVER_PRIMARY_EVENT", entityId: id,
      requestId: command.requestId, beforeJson: { revision: version, assignmentRef: current?.id ?? null },
      afterJson: { revision: version + 1, assignmentRef: id, hasDriver: Boolean(driver) }, metadataJson: { vehicleRef: ref } }, options.auditWriter);
    return result(ref, rows[0].id, rows[0].revision);
  });
}

export async function requestFleetDriverAuthorization(prisma, context, vehicleRef, input, options = {}) {
  authorizeFleetContext(context, { permission: PERMISSIONS.request });
  const ref = fleetDriverVehicleRef(vehicleRef); const command = parseFleetTemporaryRequest(input);
  const response = await fleetDriversTransaction(prisma, async (tx) => {
    const actor = await actorFor(tx, context, PERMISSIONS.request, true); const vehicle = await vehicleFor(tx, actor, ref, true);
    const payloadHash = commandHash(actor, "TEMPORARY_REQUEST", ref, command);
    const previous = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."fleet_driver_authorizations" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${command.requestId}::uuid`);
    if (previous[0]) {
      if (previous[0].payload_hash !== payloadHash) fleetDriverFail("REQUEST_CONFLICT", 409);
      return result(ref, previous[0].id, previous[0].row_version, true);
    }
    requireMutableVehicle(vehicle);
    const at = await nowFor(tx); const startsAt = new Date(command.startsAt); const endsAt = new Date(command.endsAt);
    if (endsAt <= at) fleetDriverFail("EXPIRED", 409);
    const driver = await driverFor(tx, actor.tenantId, command.driverMembershipRef, at, { lock: true });
    const id = randomUUID();
    const scopeHash = hash({ tenantId: actor.tenantId, vehicleId: ref, driverMembershipId: driver.membership_id, driverUserId: driver.user_id, startsAt: command.startsAt, endsAt: command.endsAt });
    const approval = await createApprovalRequestInTransaction(tx, approvalContext(actor, APPROVAL_PERMISSIONS.CREATE), {
      approvalType: APPROVAL_TYPE, entity: ENTITY, entityId: id, requestReason: command.reason, requestId: command.requestId, dueAt: endsAt,
      evaluationSnapshot: { fleetDriverScopeHash: scopeHash },
    }, { separationOfDutiesRequired: false, policySnapshot: { policy: "V17-FLEET-DRIVER-AUTHORITY-19F", beneficiaryCannotApprove: true, exactScopeRequired: true } });
    if (approval.rejected) return approval;
    if (approval.idempotent) fleetDriverFail("REQUEST_CONFLICT", 409);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "osi"."fleet_driver_authorizations"
      ("id", "tenant_id", "vehicle_id", "driver_membership_id", "driver_user_id", "approval_request_id", "starts_at", "ends_at", "scope_hash",
       "requested_by_membership_id", "requested_by_user_id", "request_id", "payload_hash")
      VALUES (${id}::uuid, ${actor.tenantId}, ${ref}, ${driver.membership_id}, ${driver.user_id}, ${approval.approval.id}, ${startsAt}, ${endsAt}, ${scopeHash},
        ${actor.membershipId}, ${actor.userId}, ${command.requestId}::uuid, ${payloadHash})`);
    await audit(tx, actor, { action: "FLEET_DRIVER_AUTHORIZATION_REQUESTED", entity: ENTITY, entityId: id, requestId: command.requestId,
      afterJson: { authorizationRef: id, approvalRef: approval.approval.id, version: 1, scopeHash }, metadataJson: { vehicleRef: ref } }, options.auditWriter);
    return result(ref, id, 1);
  });
  return unwrapApprovalRequestTransactionResult(response);
}

export async function decideFleetDriverAuthorization(prisma, context, vehicleRef, authorizationRef, input, options = {}) {
  authorizeFleetContext(context, { permission: PERMISSIONS.authorize });
  const ref = fleetDriverVehicleRef(vehicleRef); const authorizationId = fleetDriverReference(authorizationRef); const command = parseFleetAuthorizationDecision(input);
  const response = await fleetDriversTransaction(prisma, async (tx) => {
    const actor = await actorFor(tx, context, PERMISSIONS.authorize, true); const vehicle = await vehicleFor(tx, actor, ref, true);
    const row = await temporaryFor(tx, actor.tenantId, ref, authorizationId, true);
    const payloadHash = commandHash(actor, "TEMPORARY_DECISION", ref, command, authorizationId);
    const replayId = command.action === "REVOKE" ? row.revocation_request_id : row.decision_request_id;
    const replayHash = command.action === "REVOKE" ? row.revocation_payload_hash : row.decision_payload_hash;
    // Revalidate permission before every replay. Return current state; never undo a later revocation.
    if (replayId === command.requestId) {
      if (replayHash !== payloadHash) fleetDriverFail("REQUEST_CONFLICT", 409);
      return result(ref, row.id, row.row_version, true);
    }
    if (Number(row.row_version) !== command.expectedVersion) fleetDriverFail("VERSION_CONFLICT", 409);
    const at = await nowFor(tx);
    if (command.action === "REVOKE") {
      if (!validSeal(row) || row.revoked_at) fleetDriverFail("STATE_CONFLICT", 409);
      await tx.$executeRaw(Prisma.sql`UPDATE "osi"."fleet_driver_authorizations" SET
        "revoked_at"=${at}, "revoked_by_membership_id"=${actor.membershipId}, "revoked_by_user_id"=${actor.userId},
        "revocation_reason"=${command.reason}, "revocation_request_id"=${command.requestId}::uuid, "revocation_payload_hash"=${payloadHash},
        "row_version"="row_version"+1, "updated_at"=${at}
        WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.id}::uuid AND "row_version"=${command.expectedVersion}`);
    } else {
      requireMutableVehicle(vehicle);
      if (row.approval_status !== "PENDING" || row.decision_action) fleetDriverFail("STATE_CONFLICT", 409);
      if (new Date(row.ends_at) <= at) fleetDriverFail("EXPIRED", 409);
      if (command.action === "APPROVE") {
        if (actor.userId === row.driver_user_id) fleetDriverFail("SELF_AUTHORIZATION_FORBIDDEN", 403);
        await driverFor(tx, actor.tenantId, row.driver_membership_id, at, { byId: true, lock: true });
      }
      const decision = await decideApprovalRequestInTransaction(tx, approvalContext(actor, APPROVAL_PERMISSIONS.DECIDE), {
        id: row.approval_request_id, decision: command.action === "APPROVE" ? "APPROVED" : "REJECTED",
        requestId: command.requestId, reason: command.reason, expectedVersion: Number(row.approval_version),
      });
      if (decision.rejected?.code === "APPROVAL_EXPIRED") fleetDriverFail("EXPIRED", 409);
      if (decision.rejected) return decision;
      if (decision.idempotent) fleetDriverFail("STATE_CONFLICT", 409);
      const approved = command.action === "APPROVE";
      // The generic engine records transaction-start time. The authority seal
      // records the actual decision time, after all waits and revalidation.
      const sealedAt = approved ? await nowFor(tx) : null;
      if (approved && new Date(row.ends_at) <= sealedAt) fleetDriverFail("EXPIRED", 409);
      await tx.$executeRaw(Prisma.sql`UPDATE "osi"."fleet_driver_authorizations" SET
        "decision_action"=${command.action}, "decision_request_id"=${command.requestId}::uuid, "decision_payload_hash"=${payloadHash},
        "authorized_at"=${sealedAt},
        "authorized_by_membership_id"=${approved ? actor.membershipId : null}, "authorized_by_user_id"=${approved ? actor.userId : null},
        "row_version"="row_version"+1, "updated_at"=${sealedAt ?? at}
        WHERE "tenant_id"=${actor.tenantId} AND "id"=${row.id}::uuid AND "row_version"=${command.expectedVersion}`);
    }
    await audit(tx, actor, { action: `FLEET_DRIVER_AUTHORIZATION_${command.action === "APPROVE" ? "APPROVED" : command.action === "REJECT" ? "REJECTED" : "REVOKED"}`,
      entity: ENTITY, entityId: row.id, requestId: command.requestId, beforeJson: { version: Number(row.row_version), revoked: Boolean(row.revoked_at) },
      afterJson: { version: Number(row.row_version) + 1, action: command.action }, metadataJson: { vehicleRef: ref, scopeHash: row.scope_hash } }, options.auditWriter);
    return result(ref, row.id, Number(row.row_version) + 1);
  });
  return unwrapApprovalRequestTransactionResult(response);
}

// Internal authority lookup for canonical consumers. No legacy OSI or mock DriverModule
// claims enforcement. Execution callers must supply their trusted server instant in `at`.
export async function resolveVehicleDriverAuthority(tx, { tenantId, vehicleId, driverMembershipId, at }) {
  const instant = new Date(at);
  if (!tenantId || !vehicleId || !driverMembershipId || !Number.isFinite(instant.getTime())) fleetDriverFail("INPUT_INVALID");
  const unavailable = (reasonCode) => ({ authorized: false, basis: "NONE", reference: null, reasonCode });
  // Take the company lock first, matching all mutation paths. A vehicle-first
  // lock could deadlock with a revocation that already holds the company lock.
  const tenants = await tx.$queryRaw(Prisma.sql`SELECT "status"::text AS "status" FROM "osi"."tenants" WHERE "id"=${tenantId} FOR SHARE`);
  if (tenants.length !== 1 || tenants[0].status !== "ACTIVE") return unavailable("RESOURCE_UNAVAILABLE");
  const vehicles = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicles"
    WHERE "tenant_id"=${tenantId} AND "id"=${vehicleId} FOR SHARE`);
  const vehicle = vehicles[0];
  if (!vehicle) return unavailable("RESOURCE_UNAVAILABLE");
  if (vehicle.operational_status === "RETIRED" || vehicle.retired_at || new Date(vehicle.effective_from) > instant
    || (vehicle.effective_to && new Date(vehicle.effective_to) <= instant)) return unavailable("VEHICLE_UNAVAILABLE");
  const driver = await driverFor(tx, tenantId, driverMembershipId, instant, { byId: true, requireEligible: false, lock: true });
  if (!eligible(driver, instant)) return unavailable("DRIVER_UNAVAILABLE");
  const primary = await currentPrimary(tx, tenantId, vehicleId, instant);
  if (primary?.driver_membership_id === driverMembershipId && primary.driver_user_id === driver.user_id) {
    return { authorized: true, basis: "HABITUAL", reference: primary.id, reasonCode: null };
  }
  const candidates = await tx.$queryRaw(Prisma.sql`SELECT ${temporarySelect()} ${temporaryFrom()}
    WHERE f."tenant_id"=${tenantId} AND f."vehicle_id"=${vehicleId} AND f."driver_membership_id"=${driverMembershipId}
      AND f."driver_user_id"=${driver.user_id} AND f."starts_at"<=${instant} AND f."ends_at">${instant}
      AND f."authorized_at"<=${instant} AND (f."revoked_at" IS NULL OR f."revoked_at">${instant})
    ORDER BY f."authorized_at" DESC, f."id" DESC FOR SHARE OF f, a`);
  const active = candidates.find(validSeal);
  return active ? { authorized: true, basis: "TEMPORARY", reference: active.id, reasonCode: null } : unavailable("NO_CURRENT_AUTHORITY");
}

export const __fleetDriversInternals = Object.freeze({ eligible, validSeal, temporaryDto, hash });
