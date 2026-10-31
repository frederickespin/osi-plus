import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  adminFleetTransaction, createAdminFleetVehicle, getAdminFleetVehicle, listAdminFleetVehicles, updateAdminFleetVehicle,
} from "../api/_lib/adminFleetDomain.js";
import { parseAdminFleetCreate } from "../api/_lib/adminFleetContract.js";

const results = [];
const check = (name, value) => { assert.ok(value, name); results.push({ name, passed: true }); };
const context = { tenantId: "synthetic-tenant", membershipId: "synthetic-member", userId: "synthetic-user", role: "A", effectivePermissions: ["fleet:view", "fleet:edit"], deniedPermissions: [] };
const actor = { role: "A", status: "ACTIVE", user_status: "active", tenant_status: "ACTIVE", granted_permissions: [], denied_permissions: [], authorization_version: 1 };
const baseRow = {
  id: "synthetic-vehicle-cuid", tenant_id: context.tenantId, business_code: "TR-1", normalized_code: "TR-1", plate: "A-123", normalized_plate: "A123", vin: "VIN12345", normalized_vin: "VIN12345",
  vehicle_type: "TRUCK", brand: null, model: null, model_year: null, capacity_weight: 1000, capacity_volume: null,
  usable_length: null, usable_width: null, usable_height: null, weight_unit: "KG", volume_unit: "CBM", dimension_unit: "M",
  operational_status: "AVAILABLE", available_for_calculation: true, effective_from: new Date("2026-01-01T00:00:00Z"), effective_to: null, hub_code: null,
  source: "V17_ADMINISTRATION_FLEET_19D", request_id: randomUUID(), payload_hash: "original-creation-fingerprint", source_stable_id: null,
  row_version: 1, updated_at: new Date("2026-10-31T00:00:00Z"), retired_at: null, calculation_locked_at: null,
};
function fixture({ currentActor = actor, row = baseRow, existing = [], usedRequest = false, duplicate = false, writeResult = null, failAudit = false } = {}) {
  const queries = []; const audits = []; let committedWrites = 0; let rolledBack = false;
  const tx = { async $queryRaw(query) {
    queries.push(query);
    const sql = query.sql;
    // This is a query-spy fixture, not a SQL engine. The separate PostgreSQL suite verifies actual constraints/rollback.
    if (sql.includes('FROM "osi"."tenants"') && sql.includes("FOR UPDATE")) return [{ id: context.tenantId }];
    if (sql.includes('FROM "osi"."tenant_memberships" tm')) return currentActor ? [currentActor] : [];
    if (sql.includes("UNION ALL")) return usedRequest ? [{ id: "prior-request" }] : [];
    if (sql.includes('SELECT * FROM "osi"."osi_vehicles"') && sql.includes('"request_id"=')) return existing;
    if (sql.includes('SELECT "id" FROM "osi"."osi_vehicles"') && sql.includes('"normalized_code"=')) return duplicate ? [{ id: "duplicate" }] : [];
    if (sql.includes("COUNT(*)")) return [{ total: row ? 1 : 0 }];
    if (sql.includes('SELECT * FROM "osi"."osi_vehicles"')) return row ? [row] : [];
    if (sql.includes('INSERT INTO "osi"."osi_vehicles"') || sql.includes('UPDATE "osi"."osi_vehicles" SET')) {
      committedWrites += 1; return writeResult ? [writeResult] : [];
    }
    throw new Error("Unexpected synthetic query");
  } };
  const prisma = { async $transaction(work, options) {
    assert.equal(options.isolationLevel, "Serializable");
    const snapshot = committedWrites;
    try { return await work(tx); } catch (error) { committedWrites = snapshot; rolledBack = true; throw error; }
  } };
  const auditWriter = async (db, auditContext, event) => {
    assert.equal(db, tx); assert.equal(auditContext.tenantId, context.tenantId); assert.equal(auditContext.actorMembershipId, context.membershipId);
    if (failAudit) throw new Error("synthetic audit failure");
    audits.push(event); return { id: "synthetic-audit" };
  };
  return { prisma, queries, audits, auditWriter, writes: () => committedWrites, rolledBack: () => rolledBack };
}
function patch(changes, expectedVersion = 1) { return { requestId: randomUUID(), expectedVersion, changes }; }
const rejects = (work, code) => assert.rejects(work, (error) => error.code === `ADMIN_FLEET_${code}`);

for (const rollbackError of [{ code: "P2034" }, { code: "P2010", meta: { code: "40001" } }, { code: "P2010", meta: { code: "40P01" } }]) {
  let attempts = 0;
  const result = await adminFleetTransaction({ async $transaction(work, options) {
    assert.equal(options.isolationLevel, "Serializable"); attempts += 1;
    if (attempts === 1) throw rollbackError;
    return work({ synthetic: true });
  } }, async (tx) => tx.synthetic);
  check(`retries confirmed rollback ${rollbackError.meta?.code || rollbackError.code}`, result === true && attempts === 2);
}
for (const code of ["P1001", "P1017", "P2028", "AUDIT_IDEMPOTENCY_CONFLICT", "ADMIN_FLEET_VERSION_CONFLICT"]) {
  let attempts = 0; const failure = Object.assign(new Error("synthetic uncertain failure"), { code });
  await assert.rejects(() => adminFleetTransaction({ async $transaction() { attempts += 1; throw failure; } }, async () => true), (error) => error === failure);
  check(`never replays uncertain/non-serialization failure ${code}`, attempts === 1);
}
for (const duplicateError of [{ code: "P2002" }, { code: "P2010", meta: { code: "23505" } }]) {
  let attempts = 0;
  await rejects(() => adminFleetTransaction({ async $transaction() { attempts += 1; throw duplicateError; } }, async () => true), "DUPLICATE");
  check("database uniqueness is mapped without retries", attempts === 1);
}
for (const duplicateError of [{ code: "P2002" }, { code: "P2010", meta: { code: "23505" } }]) {
  let attempts = 0;
  const result = await adminFleetTransaction({ async $transaction(work) {
    attempts += 1;
    if (attempts === 1) throw duplicateError;
    return work({ synthetic: true });
  } }, async (tx) => tx.synthetic, { retryUnique: true });
  check("creation may retry a confirmed unique rollback with a new snapshot", result === true && attempts === 2);
}
for (const code of ["P1001", "P1017", "P2028"]) {
  let attempts = 0; const failure = Object.assign(new Error("uncertain create result"), { code });
  await assert.rejects(() => adminFleetTransaction({ async $transaction() { attempts += 1; throw failure; } }, async () => true, { retryUnique: true }), (error) => error === failure);
  check(`creation never replays uncertain ${code}`, attempts === 1);
}
let attempts = 0;
await rejects(() => adminFleetTransaction({ async $transaction() { attempts += 1; throw { code: "P2034" }; } }, async () => true), "VERSION_CONFLICT");
check("serialization retries stop after three confirmed rollbacks", attempts === 3);

for (const staleActor of [null, { ...actor, role: "V" }, { ...actor, status: "SUSPENDED" }, { ...actor, user_status: "inactive" }, { ...actor, tenant_status: "SUSPENDED" }, { ...actor, denied_permissions: ["fleet:edit"], granted_permissions: ["fleet:edit"] }]) {
  const f = fixture({ currentActor: staleActor });
  await rejects(() => updateAdminFleetVehicle(f.prisma, context, baseRow.id, patch({ brand: "Updated" }), { auditWriter: f.auditWriter }), "FORBIDDEN");
  check(`fresh actor authority refuses ${staleActor ? JSON.stringify(staleActor) : "missing membership"}`, f.writes() === 0 && f.audits.length === 0 && !f.queries.some((q) => q.sql.includes('SELECT * FROM "osi"."osi_vehicles"')));
}
for (const deniedContext of [
  { ...context, role: "V" }, { ...context, deniedPermissions: ["fleet:edit"] }, { ...context, effectivePermissions: ["vehicle:manage", "vehicle:view"] }, { ...context, effectivePermissions: ["fleet:view"] },
]) {
  const f = fixture();
  await rejects(() => updateAdminFleetVehicle(f.prisma, deniedContext, baseRow.id, patch({ brand: "Updated" }), { auditWriter: f.auditWriter }), "FORBIDDEN");
  check("context permission refusal precedes transaction and no vehicle:* bridge exists", f.queries.length === 0 && f.writes() === 0);
}
for (const operation of [listAdminFleetVehicles, (db, ctx) => getAdminFleetVehicle(db, ctx, baseRow.id)]) {
  const f = fixture({ currentActor: { ...actor, denied_permissions: ["fleet:view"] } });
  await rejects(() => operation(f.prisma, context), "FORBIDDEN");
  check("read revalidates persisted fleet:view deny", !f.queries.some((query) => query.sql.includes('FROM "osi"."osi_vehicles"')));
}
{
  const f = fixture();
  const list = await listAdminFleetVehicles(f.prisma, context, { search: "%_\\", operationalStatus: "AVAILABLE", page: "2", pageSize: "10" });
  check("list uses authoritative transaction and explicit pagination", list.total === 1 && list.page === 2 && list.pageSize === 10 && f.queries[0].sql.includes("FOR SHARE OF tm, u, t"));
  const fleetQueries = f.queries.filter((q) => q.sql.includes('FROM "osi"."osi_vehicles"'));
  check("list queries bind tenant and escape wildcard search literals", fleetQueries.every((q) => q.values.includes(context.tenantId) && q.values.includes("%\\%\\_\\\\%")));
}
{
  const f = fixture({ row: null });
  await rejects(() => getAdminFleetVehicle(f.prisma, context, "another-tenant-vehicle"), "NOT_FOUND");
  check("detail reference remains scoped to actor tenant", f.queries.some((q) => q.sql.includes('"tenant_id"=') && q.values.includes(context.tenantId) && q.values.includes("another-tenant-vehicle")));
}
{
  const f = fixture();
  const same = await updateAdminFleetVehicle(f.prisma, context, baseRow.id, patch({ brand: null }), { auditWriter: f.auditWriter });
  check("no-op does not write, audit or increment version", same.rowVersion === 1 && f.writes() === 0 && f.audits.length === 0);
  check("write lock order is tenant then actor then target", f.queries[0].sql.includes('"tenants"') && f.queries[0].sql.includes("FOR UPDATE") && f.queries[1].sql.includes("FOR SHARE OF tm, u, t") && f.queries[2].sql.includes('"osi_vehicles"') && f.queries[2].sql.includes("FOR UPDATE"));
}
for (const [name, fixtureOptions, changes, version, code] of [
  ["stale version", {}, { brand: "Changed" }, 2, "VERSION_CONFLICT"],
  ["retired vehicle", { row: { ...baseRow, operational_status: "RETIRED", retired_at: new Date(), available_for_calculation: false } }, { operationalStatus: "AVAILABLE" }, 1, "RETIRED"],
  ["locked capacity", { row: { ...baseRow, calculation_locked_at: new Date() } }, { capacityWeight: 2000 }, 1, "CALCULATION_LOCKED"],
  ["locked units", { row: { ...baseRow, calculation_locked_at: new Date() } }, { weightUnit: "LB" }, 1, "CALCULATION_LOCKED"],
  ["used request UUID", { usedRequest: true }, { brand: "Changed" }, 1, "REQUEST_CONFLICT"],
  ["duplicate identity", { duplicate: true }, { plate: "B-234" }, 1, "DUPLICATE"],
]) {
  const f = fixture(fixtureOptions);
  await rejects(() => updateAdminFleetVehicle(f.prisma, context, baseRow.id, patch(changes, version), { auditWriter: f.auditWriter }), code);
  check(`PATCH blocks ${name} before writing`, f.writes() === 0 && f.audits.length === 0);
}
{
  const next = { ...baseRow, brand: "Synthetic", row_version: 2 };
  const f = fixture({ writeResult: next });
  const dto = await updateAdminFleetVehicle(f.prisma, context, baseRow.id, patch({ brand: "Synthetic" }), { auditWriter: f.auditWriter });
  check("PATCH returns one new version and audits only actual changed fields", dto.rowVersion === 2 && f.writes() === 1 && f.audits.length === 1 && JSON.stringify(f.audits[0].metadataJson.changedFields) === '["brand"]');
  const update = f.queries.find((q) => q.sql.includes('UPDATE "osi"."osi_vehicles" SET'));
  check("UPDATE preserves original request fingerprint, source and actor columns", !/"(?:request_id|payload_hash|source|source_stable_id|import_batch_id|calculation_locked_at|created_by_user_id|created_by_membership_id)"\s*=/.test(update.sql));
  check("UPDATE binds tenant/reference/expected row version", update.sql.includes('WHERE "tenant_id"=') && update.sql.includes('AND "row_version"=') && update.values.includes(context.tenantId) && update.values.includes(baseRow.id));
  const auditJson = JSON.stringify({ before: f.audits[0].beforeJson, after: f.audits[0].afterJson, metadata: f.audits[0].metadataJson });
  check("audit JSON contains no plate, VIN or actor identifiers", ![baseRow.plate, baseRow.vin, context.userId, context.membershipId, context.tenantId].some((value) => auditJson.includes(value)));
}
{
  const f = fixture({ row: { ...baseRow, calculation_locked_at: new Date() }, writeResult: { ...baseRow, operational_status: "RETIRED", available_for_calculation: false, retired_at: new Date(), row_version: 2, calculation_locked_at: new Date() } });
  const retired = await updateAdminFleetVehicle(f.prisma, context, baseRow.id, patch({ operationalStatus: "RETIRED", availableForCalculation: true }), { auditWriter: f.auditWriter });
  check("technical lock still permits retirement and removes calculation availability", retired.operationalStatus === "RETIRED" && retired.availableForCalculation === false && Boolean(retired.retiredAt) && retired.calculationLocked);
  check("retirement is audited and history is never deleted", f.audits[0].action === "ADMIN_FLEET_RETIRED" && !f.queries.some((q) => /\bDELETE\b/.test(q.sql)));
}
{
  const f = fixture({ writeResult: { ...baseRow, brand: "Changed", row_version: 2 }, failAudit: true });
  await assert.rejects(() => updateAdminFleetVehicle(f.prisma, context, baseRow.id, patch({ brand: "Changed" }), { auditWriter: f.auditWriter }), /synthetic audit failure/);
  check("audit failure escapes the transaction and is never reported as success", f.rolledBack() && f.writes() === 0);
}
{
  const input = { requestId: randomUUID(), businessCode: "TR-2", vehicleType: "TRUCK" };
  const parsed = parseAdminFleetCreate(input);
  const createdRow = { ...baseRow, id: "new-vehicle", business_code: "TR-2", request_id: input.requestId, payload_hash: parsed.vehicle.payloadHash };
  const f = fixture({ writeResult: createdRow });
  const created = await createAdminFleetVehicle(f.prisma, context, input, { auditWriter: f.auditWriter });
  check("creation is one insert plus critical audit", created.created && !created.idempotent && f.writes() === 1 && f.audits[0].critical === true);
  const replayFixture = fixture({ existing: [{ ...createdRow, brand: "Edited later", row_version: 4 }] });
  const replay = await createAdminFleetVehicle(replayFixture.prisma, context, input, { auditWriter: replayFixture.auditWriter });
  check("create replay uses preserved fingerprint and current DTO after later edits", replay.idempotent && !replay.created && replay.vehicle.rowVersion === 4 && replay.vehicle.brand === "Edited later" && replayFixture.writes() === 0 && replayFixture.audits.length === 0);
  await rejects(() => createAdminFleetVehicle(replayFixture.prisma, context, { ...input, brand: "Another payload" }, { auditWriter: replayFixture.auditWriter }), "REQUEST_CONFLICT");
  results.push({ name: "reused creation request with a different payload is refused", passed: true });
}
for (const [options, code] of [[{ duplicate: true }, "DUPLICATE"], [{ usedRequest: true }, "REQUEST_CONFLICT"]]) {
  const f = fixture(options);
  await rejects(() => createAdminFleetVehicle(f.prisma, context, { requestId: randomUUID(), businessCode: "TR-3", vehicleType: "TRUCK" }, { auditWriter: f.auditWriter }), code);
  check(`create blocks ${code} without insert or audit`, f.writes() === 0 && f.audits.length === 0);
}
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
