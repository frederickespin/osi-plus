import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { createCrm01b1LocalPrisma, validateCrm01b1LocalUrl } from "./crm-01b1-local-target.mjs";
import { createFleetDriversPg17LocalPrisma } from "./v17-fleet-drivers-pg17-local-target.mjs";
import { CATALOG_SQL, CANONICAL_40_WAREHOUSE_ROUTES_CATALOG, summarizeCrm01b1Catalog } from "./crm-01b1-sql-drift-baseline.mjs";
import { normalizePreviewSnapshotSchema, selectPreviewDriverCatalogProfile } from "./v17-fleet-drivers-preview-migrate.mjs";
import { createAdminFleetVehicle, getAdminFleetVehicle, updateAdminFleetVehicle } from "../api/_lib/adminFleetDomain.js";
import { APPROVAL_PERMISSIONS, decideApprovalRequest } from "../api/_lib/approvalRequest.js";
import {
  getFleetDrivers, listFleetDriverOptions, requestFleetDriverAuthorization, setFleetPrimaryDriver,
  decideFleetDriverAuthorization, resolveVehicleDriverAuthority,
} from "../api/_lib/fleetDriversDomain.js";

// Both modes are disposable local databases with independent strict guards.
// No dotenv, DATABASE_URL fallback, Preview identity, migrations or remote data.
const compatibilityMode = process.env.V17_FLEET_DRIVERS_LOCAL_COMPAT;
assert.ok(compatibilityMode === undefined || compatibilityMode === "PG17", "unsupported fleet compatibility mode");
const pg17Compatibility = compatibilityMode === "PG17";
const rawLocalUrl = pg17Compatibility ? process.env.V17_FLEET_DRIVERS_PG17_DATABASE_URL : process.env.CRM01B1_TEST_DATABASE_URL;
const createLocalPrisma = pg17Compatibility ? createFleetDriversPg17LocalPrisma : createCrm01b1LocalPrisma;
let expectedCatalog = CANONICAL_40_WAREHOUSE_ROUTES_CATALOG;
if (pg17Compatibility) {
  const fixture = JSON.parse(readFileSync(new URL("../tests/crm-01b1/fleet-drivers-19f-pg17-catalog.json", import.meta.url), "utf8"));
  selectPreviewDriverCatalogProfile("170011", { 17: fixture });
  expectedCatalog = fixture.catalog;
} else {
  assert.equal(process.env.CANONICAL_DB_VALIDATION, "true", "19F DB suite requires disposable canonical CI");
  assert.equal(validateCrm01b1LocalUrl(rawLocalUrl).database, "osi_db01n_ci");
}
const { prisma } = await createLocalPrisma(rawLocalUrl);
const suffix = randomUUID().slice(0, 8);
const SOURCE = "V17_FLEET_DRIVER_AUTHORITY_19F";
const FULL = ["fleet:view", "fleet:edit", "fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize"];
const results = [];
function check(name, condition) { assert.ok(condition, name); results.push({ name, passed: true }); }
async function rejects(name, operation, code) { await assert.rejects(operation, (error) => error.code === code, name); results.push({ name, passed: true }); }
async function account(tenant, label, role = "A", permissions = FULL, status = "active") {
  const email = `f19f-${suffix}-${label}@example.invalid`;
  const user = await prisma.user.create({ data: { id: randomUUID(), code: `F19F-${suffix}-${label}`.toUpperCase(), name: `Synthetic ${label}`,
    email, normalizedEmail: email, phone: "+18095550000", role, status, joinDate: "2026-10-31", passwordHash: await bcrypt.hash("Synthetic-Fleet-19F-123!", 4) } });
  const member = await prisma.tenantMembership.create({ data: { id: randomUUID(), tenantId: tenant.id, userId: user.id, role,
    status: "ACTIVE", grantedPermissions: permissions, deniedPermissions: [], isDefault: true } });
  const context = { tenantId: tenant.id, userId: user.id, membershipId: member.id, role, permissions, effectivePermissions: permissions, deniedPermissions: [] };
  return { user, member, context };
}
async function createVehicle(actor, label) {
  return (await createAdminFleetVehicle(prisma, actor.context, { requestId: randomUUID(), businessCode: `F19F-${suffix}-${label}`, vehicleType: "TRUCK",
    effectiveFrom: "2026-01-01T00:00:00.000Z", plate: `${suffix}${label}` })).vehicle;
}
const assignment = (expectedVersion, driverMembershipRef, reason = "Asignación de prueba") => ({ requestId: randomUUID(), expectedVersion, driverMembershipRef, reason });
const decision = (expectedVersion, action = "APPROVE", reason) => ({ requestId: randomUUID(), expectedVersion, action, ...(reason ? { reason } : {}) });
const failAudit = async () => { throw new Error("synthetic fleet driver audit failure"); };
async function databaseNow() { const [row] = await prisma.$queryRaw(Prisma.sql`SELECT clock_timestamp() AS "now"`); return new Date(row.now); }
async function afterTenantLockWait(tenant, operation) {
  let ready; let release;
  const acquired = new Promise((resolve) => { ready = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  const blocker = prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."tenants" WHERE "id"=${tenant.id} FOR UPDATE`);
    ready(); await held;
  }, { timeout: 10000 });
  await acquired;
  const completion = operation().then((value) => ({ value }), (error) => ({ error }));
  let blockedAt;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [state] = await prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::integer AS "total" FROM pg_stat_activity
        WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'
        AND query LIKE '%"tenants"%' AND query LIKE '%FOR UPDATE%'`);
      if (Number(state.total) > 0) { blockedAt = await databaseNow(); break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(blockedAt, "approval must be observed waiting on the company lock");
  } finally { release(); await blocker; }
  const completed = await completion;
  if (completed.error) throw completed.error;
  return { value: completed.value, blockedAt };
}
async function authority(tenant, vehicle, driver, at) {
  return prisma.$transaction((tx) => resolveVehicleDriverAuthority(tx, { tenantId: tenant.id, vehicleId: vehicle.vehicleRef, driverMembershipId: driver.member.id, at }), { isolationLevel: "Serializable" });
}
async function storedAuthorization(tenant, id) {
  const [row] = await prisma.$queryRaw(Prisma.sql`SELECT f.*, a."status"::text AS "approval_status", a."version" AS "approval_version", a."separation_of_duties_required"
    FROM "osi"."fleet_driver_authorizations" f JOIN "osi"."approval_requests" a ON a."tenant_id"=f."tenant_id" AND a."id"=f."approval_request_id"
    WHERE f."tenant_id"=${tenant.id} AND f."id"=${id}::uuid`);
  return row;
}
async function history(actor, vehicle, kind = "TEMPORARY") { return getFleetDrivers(prisma, actor.context, vehicle.vehicleRef, { historyKind: kind, pageSize: 50 }); }
async function request(actor, vehicle, driver, extra = {}, options = {}) {
  const at = await databaseNow();
  const command = { requestId: randomUUID(), driverMembershipRef: driver.member.publicRef, startsAt: new Date(at.getTime() - 60000).toISOString(),
    endsAt: new Date(at.getTime() + 3600000).toISOString(), reason: "Servicio temporal sintético", ...extra };
  return { command, result: await requestFleetDriverAuthorization(prisma, actor.context, vehicle.vehicleRef, command, options) };
}

async function verifyPreviewSnapshotSchema() {
  const localUrl = new URL(rawLocalUrl);
  localUrl.searchParams.set("connection_limit", "1");
  const { prisma: schemaPrisma } = await createLocalPrisma(localUrl.toString());
  const sessionState = async (client) => (await client.$queryRawUnsafe("SELECT pg_backend_pid() AS pid, current_database() AS database, current_setting('neon.branch_id', true) AS branch, current_setting('search_path') AS path, current_schema() AS schema, current_setting('transaction_read_only') = 'on' AS read_only"))[0];
  try {
    const original = await sessionState(schemaPrisma);
    await schemaPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      // Start outside osi using only the built-in catalog, without changing the guarded URL,
      // role/database defaults, or any setting outside this test transaction.
      await tx.$executeRawUnsafe("SET LOCAL search_path = pg_catalog");
      const initial = await sessionState(tx);
      check("schema regression begins outside osi inside a read-only transaction", initial.schema === "pg_catalog" && initial.read_only);
      const normalized = await normalizePreviewSnapshotSchema(tx);
      const selected = await sessionState(tx);
      check("snapshot selects osi and reports normalization while staying read-only", normalized.searchPathNormalized === true && selected.schema === "osi" && selected.read_only);
      check("schema normalization preserves the actual database, branch and connection", [initial, selected].every((state) => state.database === original.database && state.branch === original.branch && state.pid === original.pid));
      const catalog = summarizeCrm01b1Catalog(await tx.$queryRawUnsafe(CATALOG_SQL));
      assert.deepEqual(catalog, expectedCatalog);
      check(`normalized snapshot preserves the exact ${pg17Compatibility ? "PG17 compatibility" : "canonical 40"} catalog`, true);
    }, { isolationLevel: "RepeatableRead", timeout: 35000 });
    assert.deepEqual(await sessionState(schemaPrisma), original);
    check("schema selection restores the same connection state after commit", true);
    const rollback = new Error("synthetic schema snapshot rollback");
    await assert.rejects(() => schemaPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL search_path = pg_catalog");
      await normalizePreviewSnapshotSchema(tx);
      throw rollback;
    }), (error) => error === rollback);
    assert.deepEqual(await sessionState(schemaPrisma), original);
    check("schema selection restores the same connection state after rollback", true);
  } finally { await schemaPrisma.$disconnect(); }
}

try {
  await verifyPreviewSnapshotSchema();
  const tenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `F19F-${suffix}`.toUpperCase(), name: "Fleet driver QA" } });
  const foreignTenant = await prisma.tenant.create({ data: { id: randomUUID(), code: `F19FX-${suffix}`.toUpperCase(), name: "Foreign fleet driver QA" } });
  const manager = await account(tenant, "manager"); const operations = await account(tenant, "operations", "B");
  const undesignated = await account(tenant, "undesignated", "B", ["fleet:view"]);
  const firstDriver = await account(tenant, "driver-one", "E", []); const secondDriver = await account(tenant, "driver-two", "E", []);
  const inactiveDriver = await account(tenant, "driver-inactive", "E", [], "inactive");
  const foreignManager = await account(foreignTenant, "foreign-manager"); const foreignDriver = await account(foreignTenant, "foreign-driver", "E", []);
  await prisma.tenantUserIdentity.create({ data: { tenantId: tenant.id, membershipId: firstDriver.member.id, userId: firstDriver.user.id, fullName: "Nombre empresarial del chofer" } });
  const vehicle = await createVehicle(manager, "001"); const foreignVehicle = await createVehicle(foreignManager, "002");
  const options = await listFleetDriverOptions(prisma, operations.context, { pageSize: 50 });
  check("driver options contain only active company role E memberships", options.total === 2 && options.data.length === 2
    && options.data.every((row) => [firstDriver.member.publicRef, secondDriver.member.publicRef].includes(row.membershipRef)));
  check("driver name comes from company identity and exposes only a public reference", options.data.find((row) => row.membershipRef === firstDriver.member.publicRef).displayName === "Nombre empresarial del chofer"
    && options.data.every((row) => Object.keys(row).sort().join(",") === "displayName,membershipRef"));
  check("literal wildcard search cannot enumerate unrelated names", (await listFleetDriverOptions(prisma, manager.context, { search: "%" })).total === 0);
  await rejects("undesignated operations cannot read fleet driver data", () => listFleetDriverOptions(prisma, undesignated.context), "ADMIN_FLEET_FORBIDDEN");
  await rejects("a driver cannot use administration endpoints", () => listFleetDriverOptions(prisma, firstDriver.context), "ADMIN_FLEET_FORBIDDEN");
  await rejects("foreign vehicle has a nondisclosing response", () => history(manager, foreignVehicle), "FLEET_DRIVERS_NOT_FOUND");
  await rejects("foreign driver reference cannot be assigned", () => setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, assignment(0, foreignDriver.member.publicRef)), "FLEET_DRIVERS_DRIVER_NOT_FOUND");
  await rejects("foreign driver reference cannot receive temporary authority", () => request(manager, vehicle, foreignDriver), "FLEET_DRIVERS_DRIVER_NOT_FOUND");
  await rejects("inactive account cannot become habitual driver", () => setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, assignment(0, inactiveDriver.member.publicRef)), "FLEET_DRIVERS_DRIVER_UNAVAILABLE");

  const initialCommand = assignment(0, firstDriver.member.publicRef);
  const initial = await setFleetPrimaryDriver(prisma, operations.context, vehicle.vehicleRef, initialCommand);
  check("designated operations creates first habitual revision", initial.version === 1 && !initial.idempotent);
  const initialReplay = await setFleetPrimaryDriver(prisma, operations.context, vehicle.vehicleRef, initialCommand);
  check("habitual replay precedes version checking and returns the original event", initialReplay.idempotent && initialReplay.reference === initial.reference && initialReplay.version === 1);
  await rejects("habitual idempotency is bound to the actual actor", () => setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, initialCommand), "FLEET_DRIVERS_REQUEST_CONFLICT");
  await rejects("habitual request cannot change its payload", () => setFleetPrimaryDriver(prisma, operations.context, vehicle.vehicleRef, { ...initialCommand, driverMembershipRef: secondDriver.member.publicRef }), "FLEET_DRIVERS_REQUEST_CONFLICT");
  let panel = await history(manager, vehicle, "PRIMARY");
  check("habitual panel preserves names, public refs and independent revision", panel.primaryVersion === 1 && panel.primaryDriver.driver.membershipRef === firstDriver.member.publicRef
    && panel.primaryDriver.driver.displayName === "Nombre empresarial del chofer" && panel.data.length === 1);
  check("primary assignment is real authority", (await authority(tenant, vehicle, firstDriver, await databaseNow())).basis === "HABITUAL");
  await rejects("stale habitual revision cannot replace current driver", () => setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, assignment(0, secondDriver.member.publicRef)), "FLEET_DRIVERS_VERSION_CONFLICT");
  const primaryRace = await Promise.allSettled([
    setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, assignment(1, secondDriver.member.publicRef)),
    setFleetPrimaryDriver(prisma, operations.context, vehicle.vehicleRef, assignment(1, null)),
  ]);
  check("concurrent habitual commands commit exactly once", primaryRace.filter((entry) => entry.status === "fulfilled").length === 1
    && primaryRace.filter((entry) => entry.status === "rejected" && entry.reason.code === "FLEET_DRIVERS_VERSION_CONFLICT").length === 1);
  const cleared = await setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, assignment(2, null, "Sin conductor habitual"));
  panel = await history(manager, vehicle, "PRIMARY");
  check("clearing appends an event and keeps prior history", cleared.version === 3 && panel.primaryVersion === 3 && panel.primaryDriver === null
    && panel.total === 3 && panel.data[0].driver === null && panel.data.some((row) => row.assignmentRef === initial.reference));
  check("clearing removes current habitual authority", !(await authority(tenant, vehicle, firstDriver, await databaseNow())).authorized);
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`UPDATE "osi"."fleet_driver_primary_events" SET "reason"='overwrite' WHERE "id"=${initial.reference}::uuid`), /immutable/);
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`DELETE FROM "osi"."fleet_driver_primary_events" WHERE "id"=${initial.reference}::uuid`), /immutable/);
  check("database preserves immutable habitual history", (await history(manager, vehicle, "PRIMARY")).total === 3);
  const rollbackPrimary = assignment(3, firstDriver.member.publicRef);
  await assert.rejects(() => setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, rollbackPrimary, { auditWriter: failAudit }), { message: "synthetic fleet driver audit failure" });
  check("critical audit failure rolls back the habitual event and revision", (await history(manager, vehicle, "PRIMARY")).primaryVersion === 3);
  await prisma.tenantMembership.update({ where: { id: operations.member.id }, data: { grantedPermissions: FULL.filter((permission) => permission !== "fleet:drivers:assign"), deniedPermissions: ["fleet:drivers:assign"] } });
  await rejects("database revocation blocks an otherwise matching habitual replay", () => setFleetPrimaryDriver(prisma, operations.context, vehicle.vehicleRef, initialCommand), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: operations.member.id }, data: { grantedPermissions: FULL, deniedPermissions: [] } });

  const expiryClock = await databaseNow(); const expiryEnd = new Date(expiryClock.getTime() + 2000);
  const expiring = await request(manager, vehicle, secondDriver, { endsAt: expiryEnd.toISOString() });
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, expiryEnd.getTime() - Date.now() + 5)));
  const expiredDto = (await history(manager, vehicle)).data.find((row) => row.authorizationRef === expiring.result.reference);
  check("pending expiration is derived without a database transition", expiredDto.status === "EXPIRED" && expiredDto.effectiveStatus === "EXPIRED"
    && !expiredDto.canApprove && !expiredDto.canReject && (await storedAuthorization(tenant, expiring.result.reference)).approval_status === "PENDING");
  await rejects("an expired pending request cannot be approved", () => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, expiring.result.reference, decision(1)), "FLEET_DRIVERS_EXPIRED");
  check("expired decision attempt keeps the request and own version untouched", Number((await storedAuthorization(tenant, expiring.result.reference)).row_version) === 1
    && (await storedAuthorization(tenant, expiring.result.reference)).approval_status === "PENDING");
  await rejects("new temporary request must end in the future", () => request(manager, vehicle, secondDriver, { endsAt: expiryEnd.toISOString() }), "FLEET_DRIVERS_EXPIRED");

  const requested = await request(manager, vehicle, secondDriver);
  const pendingRef = requested.result.reference;
  check("temporary request persists pending without granting authority", requested.result.version === 1 && !(await authority(tenant, vehicle, secondDriver, await databaseNow())).authorized);
  check("temporary request repeats idempotently", (await requestFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, requested.command)).idempotent);
  await rejects("temporary request detects changed payload with same UUID", () => requestFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, { ...requested.command, reason: "Different reason" }), "FLEET_DRIVERS_REQUEST_CONFLICT");
  await rejects("foreign company cannot decide a known authorization", () => decideFleetDriverAuthorization(prisma, foreignManager.context, vehicle.vehicleRef, pendingRef, decision(1)), "FLEET_DRIVERS_NOT_FOUND");
  const approvalCommand = decision(1);
  const delayedApproval = await afterTenantLockWait(tenant, () => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, pendingRef, approvalCommand));
  const approved = delayedApproval.value;
  const storedApproved = await storedAuthorization(tenant, pendingRef);
  check("responsible requester can approve a third-party administrative request", approved.version === 2 && storedApproved.approval_status === "APPROVED"
    && storedApproved.separation_of_duties_required === false && storedApproved.authorized_by_membership_id === manager.member.id);
  check("approval persists an authority seal without modifying scope", storedApproved.decision_action === "APPROVE" && storedApproved.authorized_at
    && iso(storedApproved.starts_at) === requested.command.startsAt && iso(storedApproved.ends_at) === requested.command.endsAt);
  check("approved temporary authority is effective", (await authority(tenant, vehicle, secondDriver, await databaseNow())).basis === "TEMPORARY");
  check("approval is not retroactive", !(await authority(tenant, vehicle, secondDriver, new Date(new Date(storedApproved.authorized_at).getTime() - 1))).authorized);
  check("authority does not predate lock waits even when the generic engine uses transaction-start time", new Date(storedApproved.authorized_at) >= delayedApproval.blockedAt
    && !(await authority(tenant, vehicle, secondDriver, delayedApproval.blockedAt)).authorized);
  check("approval instant is inclusive", (await authority(tenant, vehicle, secondDriver, storedApproved.authorized_at)).authorized);
  check("approval retry is idempotent", (await decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, pendingRef, approvalCommand)).idempotent);
  await prisma.tenantMembership.update({ where: { id: manager.member.id }, data: { grantedPermissions: FULL.filter((permission) => permission !== "fleet:drivers:authorize"), deniedPermissions: ["fleet:drivers:authorize"] } });
  await rejects("an approval replay revalidates the current database permission", () => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, pendingRef, approvalCommand), "ADMIN_FLEET_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: manager.member.id }, data: { grantedPermissions: FULL, deniedPermissions: [] } });
  await prisma.user.update({ where: { id: manager.user.id }, data: { status: "inactive" } });
  await rejects("inactive actor cannot replay a prior approval", () => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, pendingRef, approvalCommand), "ADMIN_FLEET_FORBIDDEN");
  await prisma.user.update({ where: { id: manager.user.id }, data: { status: "active" } });
  const revocationCommand = decision(2, "REVOKE", "Servicio cancelado");
  await assert.rejects(() => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, pendingRef, revocationCommand, { auditWriter: failAudit }), { message: "synthetic fleet driver audit failure" });
  check("revocation audit failure preserves current authority", (await storedAuthorization(tenant, pendingRef)).revoked_at === null
    && (await authority(tenant, vehicle, secondDriver, await databaseNow())).authorized);
  const revoked = await decideFleetDriverAuthorization(prisma, operations.context, vehicle.vehicleRef, pendingRef, { ...revocationCommand, requestId: randomUUID() });
  const storedRevoked = await storedAuthorization(tenant, pendingRef);
  check("revocation preserves approved history and increments own version", revoked.version === 3 && storedRevoked.approval_status === "APPROVED" && storedRevoked.revoked_at !== null);
  check("revocation instant excludes current use", !(await authority(tenant, vehicle, secondDriver, storedRevoked.revoked_at)).authorized);
  const approvalAfterRevocation = await decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, pendingRef, approvalCommand);
  check("old approval replay cannot reactivate a revoked authorization", approvalAfterRevocation.idempotent && approvalAfterRevocation.version === 3
    && !(await authority(tenant, vehicle, secondDriver, await databaseNow())).authorized);
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`UPDATE "osi"."fleet_driver_authorizations" SET "ends_at"="ends_at" + INTERVAL '1 hour', "row_version"="row_version"+1 WHERE "id"=${pendingRef}::uuid`), /immutable/);
  await assert.rejects(() => prisma.$executeRaw(Prisma.sql`DELETE FROM "osi"."fleet_driver_authorizations" WHERE "id"=${pendingRef}::uuid`), /cannot be deleted/);
  check("database prevents scope rewriting or deletion of temporary history", Boolean(await storedAuthorization(tenant, pendingRef)));

  const future = await databaseNow(); const startsAt = new Date(future.getTime() + 3600000); const endsAt = new Date(future.getTime() + 7200000);
  const scheduled = await request(manager, vehicle, secondDriver, { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  await decideFleetDriverAuthorization(prisma, operations.context, vehicle.vehicleRef, scheduled.result.reference, decision(1));
  panel = await history(manager, vehicle);
  check("future authorization is scheduled until its start", panel.data.find((row) => row.authorizationRef === scheduled.result.reference).effectiveStatus === "SCHEDULED");
  check("temporary interval excludes the instant before start", !(await authority(tenant, vehicle, secondDriver, new Date(startsAt.getTime() - 1))).authorized);
  check("temporary interval includes exact UTC start", (await authority(tenant, vehicle, secondDriver, startsAt)).authorized);
  check("temporary interval includes last millisecond", (await authority(tenant, vehicle, secondDriver, new Date(endsAt.getTime() - 1))).authorized);
  check("temporary interval excludes exact UTC end", !(await authority(tenant, vehicle, secondDriver, endsAt)).authorized);
  await prisma.user.update({ where: { id: secondDriver.user.id }, data: { status: "inactive" } });
  panel = await history(manager, vehicle);
  const inactiveHistory = panel.data.find((row) => row.authorizationRef === scheduled.result.reference);
  check("inactive driver is excluded from options but remains named in history", !inactiveHistory.driverEligible && inactiveHistory.driver.displayName === secondDriver.user.name
    && !(await listFleetDriverOptions(prisma, manager.context)).data.some((row) => row.membershipRef === secondDriver.member.publicRef));
  check("inactive driver cannot consume earlier approved authority", !(await authority(tenant, vehicle, secondDriver, startsAt)).authorized);
  await prisma.user.update({ where: { id: secondDriver.user.id }, data: { status: "active" } });
  await prisma.employeeProfile.create({ data: { id: randomUUID(), tenantId: tenant.id, membershipId: firstDriver.member.id, userId: firstDriver.user.id,
    employeeCode: `F19F-${suffix}`.toUpperCase(), normalizedEmployeeCode: `F19F-${suffix}`.toUpperCase(), employmentStatus: "ACTIVE", availabilityStatus: "AVAILABLE",
    operationalValidTo: new Date(future.getTime() - 1000) } });
  await rejects("existing expired employee profile prevents assigning a driver", () => setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, assignment(3, firstDriver.member.publicRef)), "FLEET_DRIVERS_DRIVER_UNAVAILABLE");
  check("expired employee profile also disappears from selector", !(await listFleetDriverOptions(prisma, manager.context)).data.some((row) => row.membershipRef === firstDriver.member.publicRef));

  const generic = await request(manager, vehicle, secondDriver);
  const genericStored = await storedAuthorization(tenant, generic.result.reference);
  await decideApprovalRequest(prisma, { tenantId: tenant.id, actorMembershipId: manager.member.id, permissions: [APPROVAL_PERMISSIONS.DECIDE] }, {
    id: genericStored.approval_request_id, decision: "APPROVED", requestId: randomUUID(), expectedVersion: 1, reason: "Generic engine decision only" });
  const genericDto = (await history(manager, vehicle)).data.find((row) => row.authorizationRef === generic.result.reference);
  check("generic approval without a fleet domain seal does not grant authority", genericDto.status === "APPROVED" && genericDto.effectiveStatus === "UNAVAILABLE"
    && !genericDto.canRevoke && !(await authority(tenant, vehicle, secondDriver, await databaseNow())).authorized);
  await rejects("generic terminal approval cannot be retroactively sealed", () => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, generic.result.reference, decision(1)), "FLEET_DRIVERS_STATE_CONFLICT");

  const self = await request(manager, vehicle, secondDriver);
  await prisma.tenantMembership.update({ where: { id: secondDriver.member.id }, data: { role: "B", grantedPermissions: FULL } });
  const beneficiaryContext = { ...secondDriver.context, role: "B", permissions: FULL, effectivePermissions: FULL };
  await rejects("designated responsible cannot authorize himself as beneficiary", () => decideFleetDriverAuthorization(prisma, beneficiaryContext, vehicle.vehicleRef, self.result.reference, decision(1)), "FLEET_DRIVERS_SELF_AUTHORIZATION_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: secondDriver.member.id }, data: { role: "E", grantedPermissions: [] } });

  const rollbackRequestId = randomUUID();
  await assert.rejects(() => request(manager, vehicle, secondDriver, { requestId: rollbackRequestId }, { auditWriter: failAudit }), { message: "synthetic fleet driver audit failure" });
  const [rollbackCount] = await prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::integer AS "total" FROM "osi"."fleet_driver_authorizations" WHERE "tenant_id"=${tenant.id} AND "request_id"=${rollbackRequestId}::uuid`);
  check("request audit failure rolls back both request and authorization", Number(rollbackCount.total) === 0 && await prisma.approvalRequest.count({ where: { tenant_id: tenant.id, request_id: rollbackRequestId } }) === 0);
  const rollbackDecision = await request(manager, vehicle, secondDriver);
  const failDecisionCommand = decision(1);
  await assert.rejects(() => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, rollbackDecision.result.reference, failDecisionCommand, { auditWriter: failAudit }), { message: "synthetic fleet driver audit failure" });
  const afterFailedDecision = await storedAuthorization(tenant, rollbackDecision.result.reference);
  check("decision audit failure rolls back approval, seal and both versions", afterFailedDecision.approval_status === "PENDING" && Number(afterFailedDecision.approval_version) === 1
    && Number(afterFailedDecision.row_version) === 1 && afterFailedDecision.authorized_at === null);
  const rejected = await decideFleetDriverAuthorization(prisma, operations.context, vehicle.vehicleRef, rollbackDecision.result.reference, decision(1, "REJECT", "No corresponde"));
  const rejectedDto = (await history(manager, vehicle)).data.find((row) => row.authorizationRef === rejected.reference);
  check("rejection is persistent and never creates a fleet authority seal", rejected.version === 2 && rejectedDto.status === "REJECTED" && rejectedDto.effectiveStatus === "REJECTED"
    && (await storedAuthorization(tenant, rejected.reference)).authorized_at === null);

  const raceRequest = await request(manager, vehicle, secondDriver);
  const decisionRace = await Promise.allSettled([
    decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, raceRequest.result.reference, decision(1)),
    decideFleetDriverAuthorization(prisma, operations.context, vehicle.vehicleRef, raceRequest.result.reference, decision(1, "REJECT", "Conflicto de planificación")),
  ]);
  check("simultaneous approval and rejection have only one winner", decisionRace.filter((entry) => entry.status === "fulfilled").length === 1
    && decisionRace.filter((entry) => entry.status === "rejected" && entry.reason.code === "FLEET_DRIVERS_VERSION_CONFLICT").length === 1
    && Number((await storedAuthorization(tenant, raceRequest.result.reference)).row_version) === 2);
  const raceCommand = { ...requested.command, requestId: randomUUID() };
  const requestRace = await Promise.all([
    requestFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, raceCommand),
    requestFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, raceCommand),
  ]);
  check("identical simultaneous requests create one row and one replay", requestRace[0].reference === requestRace[1].reference && requestRace.filter((entry) => entry.idempotent).length === 1);
  check("request race records exactly one critical domain event", await prisma.commercialAuditLog.count({ where: { tenant_id: tenant.id, source: SOURCE, request_id: raceCommand.requestId } }) === 1);
  check("driver assignments never mutate vehicle technical version", (await getAdminFleetVehicle(prisma, manager.context, vehicle.vehicleRef)).rowVersion === 1);
  await updateAdminFleetVehicle(prisma, manager.context, vehicle.vehicleRef, { requestId: randomUUID(), expectedVersion: 1, changes: { operationalStatus: "RETIRED" } });
  await rejects("retired vehicle rejects a new habitual assignment", () => setFleetPrimaryDriver(prisma, manager.context, vehicle.vehicleRef, assignment(3, secondDriver.member.publicRef)), "FLEET_DRIVERS_VEHICLE_RETIRED");
  await rejects("retired vehicle rejects a new temporary request", () => request(manager, vehicle, secondDriver), "FLEET_DRIVERS_VEHICLE_RETIRED");
  await rejects("retired vehicle rejects a pending approval", () => decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, requestRace[0].reference, decision(1)), "FLEET_DRIVERS_VEHICLE_RETIRED");
  check("retired vehicle cannot consume approved driver authority", !(await authority(tenant, vehicle, secondDriver, startsAt)).authorized);
  check("approved history on a retired vehicle remains revocable", (await history(manager, vehicle)).data.find((row) => row.authorizationRef === scheduled.result.reference).canRevoke);
  const retiredRevoke = decision(2, "REVOKE", "Vehículo retirado");
  const retiredRevoked = await decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, scheduled.result.reference, retiredRevoke);
  check("revocation works after vehicle retirement and is idempotent", retiredRevoked.version === 3
    && (await decideFleetDriverAuthorization(prisma, manager.context, vehicle.vehicleRef, scheduled.result.reference, retiredRevoke)).idempotent);
  const audits = await prisma.commercialAuditLog.findMany({ where: { tenant_id: tenant.id, source: SOURCE } });
  check("domain audit is critical and contains no copied names, plates or email", audits.length > 0 && audits.every((event) => event.critical)
    && ![manager.user.email, firstDriver.user.name, "Nombre empresarial del chofer", vehicle.plate].some((value) => JSON.stringify(audits.map((event) => [event.before_json, event.after_json, event.metadata_json])).includes(value)));
  process.stdout.write(JSON.stringify({ ok: true, assertions: results.length, results }, null, 2) + "\n");
} finally {
  await prisma.$disconnect();
}

function iso(value) { return new Date(value).toISOString(); }
