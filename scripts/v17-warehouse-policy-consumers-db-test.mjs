import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { canonicalPayloadHash } from "../api/_lib/materialsInventoryContract.js";
import { canonicalAssetPayloadHash } from "../api/_lib/toolsEquipmentContract.js";
import { assignReservation, createMaterial, createPurchaseRequest, createReservation, createUnit, createWarehouse, listMaterials, recordMovement, releaseReservation, transitionPurchaseRequest } from "../api/_lib/materialsInventoryDomain.js";
import { changeAssetState, createAssetAssignment, createAssetIncident, createAssetInspection, createAssetInstance, createAssetMaintenance, createAssetModel, createAssetReservation, getAssetInstance, handoutAsset, listAssetInstances, returnAsset } from "../api/_lib/toolsEquipmentDomain.js";
import { updateWarehouseLocationConfiguration } from "../api/_lib/warehouseConfigurationDomain.js";
import { validateV17ServicesTestUrl, verifyV17ServicesLocalDatabase } from "./v17-services-local-target.mjs";
import { createWarehouseConfigurationPg17LocalPrisma } from "./v17-warehouse-configuration-pg17-local-target.mjs";

const compatibility = process.env.V17_WAREHOUSE_CONFIGURATION_LOCAL_COMPAT === "PG17";
const pg17 = compatibility ? await createWarehouseConfigurationPg17LocalPrisma(process.env.V17_WAREHOUSE_CONFIGURATION_PG17_DATABASE_URL) : null;
const target = compatibility ? null : validateV17ServicesTestUrl(process.env.DATABASE_URL);
if (!compatibility) assert.equal(target.canonicalCi, true, "WAREHOUSE_POLICY_DB_REQUIRES_CANONICAL_LOCAL_FIXTURE");
const prisma = pg17?.prisma ?? new PrismaClient({ datasourceUrl: target.raw });
const simulationVariable = (name) => name === "WAREHOUSE_CONFIGURATION_API_MODE" || name.toUpperCase().startsWith("VERCEL");
let inheritedSimulationEnvironment;
const suffix = crypto.randomUUID().slice(0, 8); let sequence = 0;
const permissions = ["inventory:catalog:view", "inventory:catalog:manage", "inventory:stock:view", "inventory:stock:receive", "inventory:stock:transfer", "inventory:stock:issue", "inventory:stock:adjust", "inventory:reservation:manage", "inventory:purchase:request", "inventory:purchase:approve", "assets:model:view", "assets:model:manage", "assets:instance:view", "assets:instance:manage", "assets:reservation:manage", "assets:assignment:manage", "assets:inspection:perform", "assets:incident:manage", "assets:maintenance:manage"];
const t0 = "2026-11-01T12:00:00.000Z"; const t1 = "2026-11-01T14:00:00.000Z";
const command = (operation, payload, scope = {}, hash = canonicalPayloadHash) => { const requestId = crypto.randomUUID(); return { requestId, payloadHash: hash({ operation, requestId, ...scope, ...payload }), ...payload }; };
const assetCommand = (operation, payload, scope = {}) => command(operation, payload, scope, canonicalAssetPayloadHash);

before(async () => {
  // The PG17 factory already verifies its live server identity. For PG18,
  // verify it here before simulating any runtime environment for the fixture.
  if (!compatibility) await verifyV17ServicesLocalDatabase(prisma, target);
  inheritedSimulationEnvironment = new Map(Object.entries(process.env).filter(([name]) => simulationVariable(name)));
  for (const name of inheritedSimulationEnvironment.keys()) delete process.env[name];
  process.env.WAREHOUSE_CONFIGURATION_API_MODE = "LOCAL_ONLY";
});
after(async () => {
  try {
    if (inheritedSimulationEnvironment) {
      for (const name of Object.keys(process.env)) if (simulationVariable(name)) delete process.env[name];
      for (const [name, value] of inheritedSimulationEnvironment) process.env[name] = value;
    }
  } finally { await prisma.$disconnect(); }
});

async function fixture() {
  const key = `${suffix}-${++sequence}`;
  const ctx = { tenantId: `tenant-policy-consumer-${key}`, membershipId: `membership-policy-${key}`, userId: `user-policy-${key}`, role: "A", effectivePermissions: permissions, deniedPermissions: [] };
  await prisma.tenant.create({ data: { id: ctx.tenantId, code: ctx.tenantId.toUpperCase(), name: "Synthetic warehouse policy consumer" } });
  await prisma.user.create({ data: { id: ctx.userId, code: ctx.userId, name: "Synthetic policy actor", email: `${ctx.userId}@example.test`, phone: "000", role: "A", status: "ACTIVE", joinDate: "2026-11-01", passwordHash: "synthetic-not-authenticatable" } });
  const member = await prisma.tenantMembership.create({ data: { id: ctx.membershipId, tenantId: ctx.tenantId, userId: ctx.userId, role: "A", status: "ACTIVE", isDefault: true, grantedPermissions: permissions } });
  const unit = await createUnit(prisma, ctx, command("UNIT_CREATE", { code: "UND", name: "Unidad", decimalPlaces: 3 }));
  const warehouse = await createWarehouse(prisma, ctx, command("WAREHOUSE_CREATE", { code: "POLICY", name: "Synthetic warehouse", locations: [{ code: "ROOT", name: "Root", kind: "WAREHOUSE_ROOT", parentCode: null }, { code: "ZONE", name: "Controlled area", kind: "ZONE", parentCode: "ROOT" }, { code: "LEAF", name: "Controlled position", kind: "BIN", parentCode: "ZONE" }, { code: "SAFE", name: "Independent area", kind: "ZONE", parentCode: "ROOT" }] }));
  const [root, zone, leaf, safe] = ["ROOT", "ZONE", "LEAF", "SAFE"].map((code) => warehouse.locations.find((row) => row.code === code));
  const material = await createMaterial(prisma, ctx, command("MATERIAL_CREATE", { code: "BOX", name: "Synthetic box", description: null, family: "CAJAS", subfamily: null, baseUnitRef: unit.unitRef, purchaseUnitRef: unit.unitRef, consumptionUnitRef: unit.unitRef, technicalFlags: ["CONSUMABLE"], dimensionPolicy: {}, lotTrackingEnabled: false, minimumStock: null, maximumStock: null, reorderPoint: null, sortOrder: 1 }));
  const model = await createAssetModel(prisma, ctx, assetCommand("ASSET_MODEL_CREATE", { code: "TOOL", name: "Synthetic tool", description: null, family: "TOOLS", resourceType: "TOOL", serialPolicy: "NONE", identificationPolicy: {}, capacity: { units: 1 } }));
  return { ctx, member, unit, warehouse, root, zone, leaf, safe, material, model };
}
const movementInput = (f, type, location, quantity = 1, destination = null) => command("INVENTORY_MOVEMENT", { movementType: type, materialRef: f.material.materialRef, locationRef: location.locationRef, counterpartLocationRef: destination?.locationRef ?? null, quantity, lotCode: null, reasonCode: "SYNTHETIC_POLICY", reservationRef: null, requirementRef: null });
const reservationInput = (f, location) => command("RESERVATION_CREATE", { materialRef: f.material.materialRef, locationRef: location.locationRef, quantity: 1, caseRef: null, requirementRef: null, cratingReference: null });
const receive = (f, location, quantity = 1) => recordMovement(prisma, f.ctx, movementInput(f, "RECEIPT", location, quantity));
async function controlInput(f, location, patch) {
  const row = await prisma.warehouseLocationConfiguration.findFirst({ where: { tenantId: f.ctx.tenantId, location: { locationRef: location.locationRef } } });
  return command("WAREHOUSE_LOCATION_CONFIGURATION_UPDATE", { expectedVersion: row?.version ?? 0, areaUseRef: null, characteristics: null, notes: null, operationalStatus: row?.operationalStatus ?? "ACTIVE", availabilityRule: row?.availabilityRule ?? "CONDITION_BASED", changeReason: "Synthetic control change", acknowledgeImpact: true, ...patch }, { locationRef: location.locationRef });
}
const configure = async (f, location, patch) => updateWarehouseLocationConfiguration(prisma, f.ctx, location.locationRef, await controlInput(f, location, patch));
const inventory = async (f) => (await listMaterials(prisma, f.ctx)).items.find((row) => row.materialRef === f.material.materialRef).inventory;
const epoch = async (f) => (await prisma.warehouseLocationPolicyEpoch.findUnique({ where: { tenantId: f.ctx.tenantId } }))?.revision ?? 0n;
const newAsset = (f, location, database = prisma) => createAssetInstance(database, f.ctx, assetCommand("ASSET_INSTANCE_CREATE", { modelRef: f.model.modelRef, locationRef: location?.locationRef ?? null, internalCodePrefix: "TL", serialNumber: null, barcode: null, physicalCondition: "GOOD", acquiredAt: null, acquisitionCost: null, replacementCost: null, currency: "DOP" }));
const planInput = (f, asset, origin = f.safe, destination = f.safe) => assetCommand("ASSET_ASSIGNMENT_CREATE", { assetRef: asset.assetRef, reservationRef: null, caseRef: null, assigneeRef: f.member.publicRef, custodianRef: f.member.publicRef, operationalReference: "SYNTHETIC_POLICY", originLocationRef: origin?.locationRef ?? null, destinationLocationRef: destination?.locationRef ?? null });
const returnInput = (plan, location) => assetCommand("ASSET_RETURN", { assignmentRef: plan.assignmentRef, expectedVersion: 2, condition: "GOOD", locationRef: location.locationRef, returnedAt: t1, damageDescription: null, evidenceRefs: [] });
async function activeAssignment(f, location = f.safe) {
  const asset = await newAsset(f, location);
  const plan = await createAssetAssignment(prisma, f.ctx, planInput(f, asset, location, location));
  await handoutAsset(prisma, f.ctx, assetCommand("ASSET_HANDOUT", { assignmentRef: plan.assignmentRef, expectedVersion: 1, condition: "GOOD", destinationLocationRef: location.locationRef, handedOutAt: t0 }));
  return { asset, plan };
}
async function noCommand(f, input) {
  assert.equal(await prisma.materialInventoryCommand.count({ where: { tenantId: f.ctx.tenantId, requestId: input.requestId } }), 0);
  assert.equal(await prisma.assetMutationCommand.count({ where: { tenantId: f.ctx.tenantId, requestId: input.requestId } }), 0);
}

test("BLOCKED preserves physical stock, accepts receipts and transfers in, but prevents every material dispatch path", async () => {
  const f = await fixture(); await configure(f, f.zone, { availabilityRule: "BLOCKED" });
  await receive(f, f.safe, 20);
  for (const [type, quantity] of [["RECEIPT", 2], ["RETURN", 1], ["ADJUSTMENT_POSITIVE", 3], ["ADJUSTMENT_NEGATIVE", 1]]) await recordMovement(prisma, f.ctx, movementInput(f, type, f.leaf, quantity));
  await recordMovement(prisma, f.ctx, movementInput(f, "TRANSFER_OUT", f.safe, 4, f.leaf));
  for (const type of ["ISSUE", "CONSUMPTION", "TRANSFER_OUT"]) {
    const input = movementInput(f, type, f.leaf, 1, type === "TRANSFER_OUT" ? f.safe : null);
    await assert.rejects(() => recordMovement(prisma, f.ctx, input), /WAREHOUSE_LOCATION_DISPATCH_BLOCKED/); await noCommand(f, input);
  }
  const reserve = reservationInput(f, f.leaf); await assert.rejects(() => createReservation(prisma, f.ctx, reserve), /WAREHOUSE_LOCATION_DISPATCH_BLOCKED/); await noCommand(f, reserve);
  const balance = await inventory(f);
  assert.deepEqual([balance.physical, balance.reserved, balance.assigned, balance.available, balance.dispatchable, balance.blockedAvailable, balance.blockedPhysical], [25, 0, 0, 25, 16, 9, 9]);
  assert.equal(balance.byWarehouse[0].physical, 25); assert.equal(balance.byWarehouse[0].dispatchable, 16); assert.equal(balance.byWarehouse[0].blockedPhysical, 9);
});

test("RESTRICTED and OUT_OF_SERVICE ancestors prevent incoming and outgoing physical material mutations", async () => {
  const f = await fixture(); await receive(f, f.leaf, 10); await receive(f, f.safe, 10);
  for (const operationalStatus of ["RESTRICTED", "OUT_OF_SERVICE"]) {
    await configure(f, f.zone, { operationalStatus }); const before = await inventory(f);
    for (const type of ["RECEIPT", "RETURN", "ADJUSTMENT_POSITIVE", "ADJUSTMENT_NEGATIVE", "ISSUE", "CONSUMPTION", "TRANSFER_OUT"]) {
      const input = movementInput(f, type, f.leaf, 1, type === "TRANSFER_OUT" ? f.safe : null);
      await assert.rejects(() => recordMovement(prisma, f.ctx, input), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/); await noCommand(f, input);
    }
    await assert.rejects(() => recordMovement(prisma, f.ctx, movementInput(f, "TRANSFER_OUT", f.safe, 1, f.leaf)), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/);
    await assert.rejects(() => createReservation(prisma, f.ctx, reservationInput(f, f.leaf)), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/);
    assert.deepEqual(await inventory(f), before);
  }
});

test("purchase receipt requires an ACTIVE destination; approvals and order remain possible", async () => {
  const f = await fixture(); await configure(f, f.zone, { operationalStatus: "RESTRICTED" });
  const purchase = await createPurchaseRequest(prisma, f.ctx, command("PURCHASE_REQUEST_CREATE", { materialRef: f.material.materialRef, unitRef: f.unit.unitRef, requirementRef: null, quantity: 5 }));
  for (const [action, expectedVersion] of [["APPROVE", 1], ["ORDER", 2]]) await transitionPurchaseRequest(prisma, f.ctx, command("PURCHASE_REQUEST_TRANSITION", { purchaseRequestRef: purchase.purchaseRequestRef, expectedVersion, action, locationRef: null, lotCode: null, reasonCode: "SYNTHETIC_POLICY" }));
  const input = command("PURCHASE_REQUEST_TRANSITION", { purchaseRequestRef: purchase.purchaseRequestRef, expectedVersion: 3, action: "RECEIVE", locationRef: f.leaf.locationRef, lotCode: null, reasonCode: "SYNTHETIC_POLICY" });
  await assert.rejects(() => transitionPurchaseRequest(prisma, f.ctx, input), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/); await noCommand(f, input);
  await configure(f, f.zone, { operationalStatus: "ACTIVE", availabilityRule: "BLOCKED" });
  assert.equal((await transitionPurchaseRequest(prisma, f.ctx, input)).status, "RECEIVED");
  assert.equal((await inventory(f)).blockedPhysical, 5);
});

test("a legacy commitment cannot be assigned after canonical closure, but RELEASE always remains possible", async () => {
  const f = await fixture(); await receive(f, f.leaf, 3);
  const reservation = await createReservation(prisma, f.ctx, reservationInput(f, f.leaf));
  // Synthetic pre-existing commitment under an independently deactivated canonical ancestor.
  await prisma.materialLocation.updateMany({ where: { tenantId: f.ctx.tenantId, locationRef: f.zone.locationRef }, data: { status: "INACTIVE" } });
  const input = command("RESERVATION_ASSIGN", { reservationRef: reservation.reservationRef, expectedVersion: reservation.version, reasonCode: "SYNTHETIC_POLICY" });
  await assert.rejects(() => assignReservation(prisma, f.ctx, input), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/); await noCommand(f, input);
  const released = await releaseReservation(prisma, f.ctx, command("RESERVATION_RELEASE", { reservationRef: reservation.reservationRef, expectedVersion: reservation.version, reasonCode: "SYNTHETIC_POLICY" }));
  assert.equal(released.status, "RELEASED"); assert.equal((await inventory(f)).reserved, 0); assert.equal((await inventory(f)).physical, 3);
});

test("asset placement respects receipt controls while location policy independently removes dispatch availability", async () => {
  const f = await fixture(); await configure(f, f.zone, { availabilityRule: "BLOCKED" });
  const asset = await newAsset(f, f.leaf); const safe = await newAsset(f, f.safe);
  const reserve = assetCommand("ASSET_RESERVATION_CREATE", { assetRef: asset.assetRef, caseRef: null, operationalReference: "SYNTHETIC_POLICY", startsAt: t0, endsAt: t1 });
  await assert.rejects(() => createAssetReservation(prisma, f.ctx, reserve), /WAREHOUSE_LOCATION_DISPATCH_BLOCKED/); await noCommand(f, reserve);
  await assert.rejects(() => createAssetAssignment(prisma, f.ctx, planInput(f, asset, null, null)), /WAREHOUSE_LOCATION_DISPATCH_BLOCKED/);
  for (const [operationalStatus, location] of [["ASSIGNED", f.leaf], ["IN_USE", f.leaf], ["AVAILABLE", f.safe]]) {
    const input = assetCommand("ASSET_STATE_CHANGE", { expectedVersion: asset.version, operationalStatus, physicalCondition: "GOOD", locationRef: location.locationRef, reasonCode: "SYNTHETIC_POLICY" }, { assetRef: asset.assetRef });
    await assert.rejects(() => changeAssetState(prisma, f.ctx, asset.assetRef, input), /WAREHOUSE_LOCATION_DISPATCH_BLOCKED/);
  }
  const detail = await getAssetInstance(prisma, f.ctx, asset.assetRef, { startsAt: t0, endsAt: t1 });
  assert.equal(detail.availability.available, false); assert.equal(detail.availability.locationBlocked, true); assert.equal(detail.availability.blockedStatus, false);
  assert.equal(detail.availability.locationPolicy.inherited, true); assert.equal(detail.availability.locationPolicy.blockedBy[0].reason, "Synthetic control change");
  const rows = await listAssetInstances(prisma, f.ctx, { startsAt: t0, endsAt: t1 });
  assert.equal(rows.items.find((row) => row.assetRef === safe.assetRef).availability.available, true);
  assert.equal(rows.items.find((row) => row.assetRef === asset.assetRef).availability.available, false);
  await configure(f, f.zone, { operationalStatus: "OUT_OF_SERVICE" });
  const before = await epoch(f); await assert.rejects(() => newAsset(f, f.leaf), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/); assert.equal(await epoch(f), before);
  assert.equal(await prisma.assetInstance.count({ where: { tenantId: f.ctx.tenantId } }), 2);
});

test("planned handout checks ancestors, and a return can recover into a different ACTIVE receiving area", async () => {
  const f = await fixture(); const pending = await newAsset(f, f.leaf);
  const planned = await createAssetAssignment(prisma, f.ctx, planInput(f, pending, f.leaf, f.leaf));
  const active = await activeAssignment(f, f.leaf);
  await prisma.materialLocation.updateMany({ where: { tenantId: f.ctx.tenantId, locationRef: f.zone.locationRef }, data: { status: "INACTIVE" } });
  await assert.rejects(() => handoutAsset(prisma, f.ctx, assetCommand("ASSET_HANDOUT", { assignmentRef: planned.assignmentRef, expectedVersion: 1, condition: "GOOD", destinationLocationRef: f.safe.locationRef, handedOutAt: t0 })), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/);
  assert.equal((await returnAsset(prisma, f.ctx, returnInput(active.plan, f.safe))).status, "RETURNED");
  const recovered = await getAssetInstance(prisma, f.ctx, active.asset.assetRef, { startsAt: t0, endsAt: t1 });
  assert.equal(recovered.location.locationRef, f.safe.locationRef); assert.equal(recovered.availability.locationBlocked, false);
});

test("return requires ACTIVE receipt control and its replay never changes the epoch or physical custody", async () => {
  const f = await fixture(); const { asset, plan } = await activeAssignment(f);
  await configure(f, f.zone, { operationalStatus: "RESTRICTED" }); const input = returnInput(plan, f.leaf);
  await assert.rejects(() => returnAsset(prisma, f.ctx, input), /WAREHOUSE_LOCATION_NOT_OPERATIONAL/); await noCommand(f, input);
  assert.equal((await getAssetInstance(prisma, f.ctx, asset.assetRef)).operationalStatus, "IN_USE");
  await configure(f, f.zone, { operationalStatus: "ACTIVE", availabilityRule: "BLOCKED" });
  const returned = await returnAsset(prisma, f.ctx, input); await configure(f, f.zone, { operationalStatus: "OUT_OF_SERVICE" });
  const before = await epoch(f); assert.deepEqual(await returnAsset(prisma, f.ctx, input), returned); assert.equal(await epoch(f), before);
  assert.equal((await getAssetInstance(prisma, f.ctx, asset.assetRef)).location.locationRef, f.leaf.locationRef);
});

test("inspection, incident and maintenance records remain possible under closure without moving the asset", async () => {
  const f = await fixture(); const asset = await newAsset(f, f.leaf); await configure(f, f.zone, { operationalStatus: "OUT_OF_SERVICE" });
  await createAssetInspection(prisma, f.ctx, assetCommand("ASSET_INSPECTION_CREATE", { assetRef: asset.assetRef, assignmentRef: null, locationRef: f.leaf.locationRef, inspectionType: "PERIODIC", physicalCondition: "GOOD", safeToUse: true, notes: "Synthetic observation", evidenceRefs: [], inspectedAt: t0 }));
  await createAssetIncident(prisma, f.ctx, assetCommand("ASSET_INCIDENT_CREATE", { assetRef: asset.assetRef, assignmentRef: null, inspectionRef: null, incidentType: "OBSERVATION", severity: "LOW", resultingCondition: null, description: "Synthetic observation", evidenceRefs: [], occurredAt: t0 }));
  await createAssetMaintenance(prisma, f.ctx, assetCommand("ASSET_MAINTENANCE_CREATE", { assetRef: asset.assetRef, incidentRef: null, maintenanceType: "PREVENTIVE", title: "Synthetic maintenance", notes: null, scheduledStart: t0, scheduledEnd: t1, costAmount: null, currency: null }));
  assert.equal((await getAssetInstance(prisma, f.ctx, asset.assetRef)).location.locationRef, f.leaf.locationRef);
});

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
const settled = (promise) => promise.then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
async function bounded(promise, label) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`RACE_TIMEOUT:${label}`)), 4000); })]); } finally { clearTimeout(timer); } }

// Pause the winner before COMMIT, then force a Serializable snapshot in the
// loser before it waits for the shared policy lock. This reproduces stale
// reads deterministically rather than relying on a lucky Promise.all schedule.
async function orderedRace(winner, loser) {
  const ready = deferred(); const commit = deferred(); const snapshot = deferred(); let attempts = 0;
  const winnerDb = new Proxy(prisma, { get(target, property) { if (property !== "$transaction") return Reflect.get(target, property); return (execute, options) => target.$transaction(async (tx) => { const value = await execute(tx); ready.resolve(); await commit.promise; return value; }, options); } });
  const loserDb = new Proxy(prisma, { get(target, property) { if (property !== "$transaction") return Reflect.get(target, property); return (execute, options) => target.$transaction(async (tx) => { attempts += 1; if (attempts === 1) { const [row] = await tx.$queryRawUnsafe("SELECT pg_backend_pid() AS pid, txid_current_snapshot()::text AS snapshot, current_setting('transaction_isolation') AS isolation"); assert.equal(row.isolation, "serializable"); snapshot.resolve(row.pid); } return execute(tx); }, options); } });
  const first = settled(winner(winnerDb)); let second;
  try {
    await bounded(Promise.race([ready.promise, first.then((result) => { if (result.status === "rejected") throw result.reason; })]), "winner");
    second = settled(loser(loserDb)); const pid = await bounded(snapshot.promise, "snapshot");
    let waiting = false;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const [row] = await prisma.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = ${pid} AND locktype = 'advisory' AND NOT granted) AS waiting`;
      if (row.waiting) { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, "loser must wait on the tenant policy lock with its earlier snapshot");
  } finally { commit.resolve(); }
  const results = await Promise.all([first, second]); assert.ok(attempts >= 2, "loser must retry the stale Serializable snapshot");
  assert.equal(results[0].status, "fulfilled", results[0].reason?.message); return results;
}

function rejected(result, code) { assert.equal(result.status, "rejected"); assert.match(result.reason.message, new RegExp(code)); }

test("closure wins the FIRST epoch race against receipt: stale snapshot retries and writes no movement", async () => {
  const f = await fixture(); assert.equal(await epoch(f), 0n);
  const closing = await controlInput(f, f.zone, { operationalStatus: "OUT_OF_SERVICE" }); const receiving = movementInput(f, "RECEIPT", f.leaf);
  const [, result] = await orderedRace((db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing), (db) => recordMovement(db, f.ctx, receiving));
  rejected(result, "WAREHOUSE_LOCATION_NOT_OPERATIONAL"); assert.equal((await inventory(f)).physical, 0); await noCommand(f, receiving); assert.equal(await epoch(f), 1n);
});

test("receipt wins against closure: both commit in order while physical stock stays visible and blocked", async () => {
  const f = await fixture(); const closing = await controlInput(f, f.zone, { operationalStatus: "OUT_OF_SERVICE" });
  const [, result] = await orderedRace((db) => recordMovement(db, f.ctx, movementInput(f, "RECEIPT", f.leaf, 4)), (db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing));
  assert.equal(result.status, "fulfilled", result.reason?.message); const balance = await inventory(f); assert.equal(balance.physical, 4); assert.equal(balance.dispatchable, 0); assert.equal(balance.blockedPhysical, 4);
});

test("closure wins against reservation: no stale availability can create a commitment", async () => {
  const f = await fixture(); await receive(f, f.leaf, 4); const closing = await controlInput(f, f.zone, { availabilityRule: "BLOCKED" }); const reserving = reservationInput(f, f.leaf);
  const [, result] = await orderedRace((db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing), (db) => createReservation(db, f.ctx, reserving));
  rejected(result, "WAREHOUSE_LOCATION_DISPATCH_BLOCKED"); await noCommand(f, reserving); assert.equal((await inventory(f)).reserved, 0);
});

test("reservation wins against closure: descendant commitment guard rejects the later control change", async () => {
  const f = await fixture(); await receive(f, f.leaf, 4); const closing = await controlInput(f, f.zone, { availabilityRule: "BLOCKED" });
  const [, result] = await orderedRace((db) => createReservation(db, f.ctx, reservationInput(f, f.leaf)), (db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing));
  rejected(result, "WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE"); await noCommand(f, closing); assert.equal((await inventory(f)).reserved, 1); assert.equal((await inventory(f)).dispatchable, 3);
});

test("closure wins against return: active custody survives and the blocked destination receives nothing", async () => {
  const f = await fixture(); const { asset, plan } = await activeAssignment(f); const returning = returnInput(plan, f.leaf); const closing = await controlInput(f, f.zone, { operationalStatus: "OUT_OF_SERVICE" });
  const [, result] = await orderedRace((db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing), (db) => returnAsset(db, f.ctx, returning));
  rejected(result, "WAREHOUSE_LOCATION_NOT_OPERATIONAL"); await noCommand(f, returning);
  const row = await getAssetInstance(prisma, f.ctx, asset.assetRef); assert.equal(row.operationalStatus, "IN_USE"); assert.equal(row.location.locationRef, f.safe.locationRef);
});

test("return wins against closure: returned custody is preserved and only subsequent availability is blocked", async () => {
  const f = await fixture(); const { asset, plan } = await activeAssignment(f); const closing = await controlInput(f, f.zone, { operationalStatus: "OUT_OF_SERVICE" });
  const [, result] = await orderedRace((db) => returnAsset(db, f.ctx, returnInput(plan, f.leaf)), (db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing));
  assert.equal(result.status, "fulfilled", result.reason?.message);
  const row = await getAssetInstance(prisma, f.ctx, asset.assetRef); assert.equal(row.operationalStatus, "AVAILABLE"); assert.equal(row.location.locationRef, f.leaf.locationRef); assert.equal(row.availability.available, false); assert.equal(row.availability.locationBlocked, true);
});

test("closure wins against asset assignment: uncommitted stock cannot become a new dispatch plan", async () => {
  const f = await fixture(); const asset = await newAsset(f, f.leaf); const closing = await controlInput(f, f.zone, { availabilityRule: "BLOCKED" }); const assigning = planInput(f, asset, f.leaf, f.safe);
  const [, result] = await orderedRace((db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing), (db) => createAssetAssignment(db, f.ctx, assigning));
  rejected(result, "WAREHOUSE_LOCATION_DISPATCH_BLOCKED"); await noCommand(f, assigning);
});

test("asset assignment wins against closure: planned origin and current location protect the descendant area", async () => {
  const f = await fixture(); const asset = await newAsset(f, f.leaf); const closing = await controlInput(f, f.zone, { availabilityRule: "BLOCKED" });
  const [, result] = await orderedRace((db) => createAssetAssignment(db, f.ctx, planInput(f, asset, f.leaf, f.safe)), (db) => updateWarehouseLocationConfiguration(db, f.ctx, f.zone.locationRef, closing));
  rejected(result, "WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE"); await noCommand(f, closing);
  assert.equal(await prisma.assetAssignment.count({ where: { tenantId: f.ctx.tenantId, status: "PLANNED" } }), 1);
});
