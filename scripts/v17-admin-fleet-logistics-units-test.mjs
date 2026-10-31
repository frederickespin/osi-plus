import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { getLogisticsPlan, loadCanonicalLogisticsFacts, LOGISTICS_PERMISSIONS, publishLogistics } from "../api/_lib/logisticsEngineDomain.js";
import { calculateLogisticsPlan, canonicalHash, LogisticsEngineError } from "../api/_lib/logisticsEngineContract.js";
import { SERVICE_TRANSPORT_CONTEXT } from "../api/_lib/logisticsTransportContext.js";

const ref = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const start = "2026-11-01T12:00:00.000Z";
const end = "2026-11-01T18:00:00.000Z";
const context = Object.freeze({ tenantId: "test-tenant", membershipId: "test-membership", userId: "test-user", role: "A", effectivePermissions: [LOGISTICS_PERMISSIONS.PLAN_VIEW, LOGISTICS_PERMISSIONS.PLAN_PUBLISH, LOGISTICS_PERMISSIONS.PLAN_TENANT], deniedPermissions: [] });

function vehicle(overrides = {}) {
  return Object.freeze({ vehicle_type: "TRUCK", capacity_weight: new Prisma.Decimal("1000"), capacity_volume: new Prisma.Decimal("20"), weight_unit: "KG", volume_unit: "CBM", row_version: 1, ...overrides });
}
function fixture(rows) {
  const calls = { vehicles: [], logisticsRevisions: [] };
  const tx = {
    pipelineCase: { findFirst: async () => ({ id: "test-case", publicRef: ref(1), mode: "LOCAL", routeContractVersion: 2, routeRevision: 3, destinationStatus: "CONFIRMED" }) },
    pipelineCaseRouteSnapshot: { findMany: async () => [] },
    pipelineCaseServiceRevision: { findFirst: async () => ({ selectionRef: ref(2), revision: 4, modeSnapshot: "LOCAL", items: [{ serviceRefSnapshot: ref(3), codeSnapshot: "MOVING_LOCAL", kind: "BASE", catalogVersionSnapshot: 2 }] }) },
    surveyPublication: { findFirst: async () => null },
    materialRequirementSnapshot: { findFirst: async () => null },
    assetModel: { findMany: async () => [] },
    externalResourceOffer: { findMany: async () => [] },
    logisticsPlanRevision: { findMany: async (query) => {
      calls.logisticsRevisions.push(query);
      assert.equal(query.where.tenantId, context.tenantId);
      assert.equal(query.where.status, "PUBLISHED");
      assert.deepEqual(query.select, { id: true, revision: true, inputSnapshot: true });
      return [];
    } },
    vehicle: { findMany: async (query) => {
      calls.vehicles.push(query);
      // Honour Prisma's projection: omitting source units must fail this test.
      return rows.map((row) => Object.fromEntries(Object.keys(query.select).filter((key) => query.select[key]).map((key) => [key, row[key]])));
    } },
  };
  return { tx, calls, read: () => loadCanonicalLogisticsFacts(tx, context, ref(1), start, end) };
}

test("metric capacities remain unchanged and preserve the operational fleet query", async () => {
  const f = fixture([vehicle({ capacity_weight: new Prisma.Decimal("1500.125"), capacity_volume: new Prisma.Decimal("35.1234"), row_version: 7 })]);
  const facts = await f.read();
  assert.deepEqual(facts.vehicles, [{ vehicleType: "TRUCK", available: 1, maxWeightKg: 1500.125, maxVolumeM3: 35.1234, sourceVersion: 7 }]);
  assert.equal(f.calls.vehicles.length, 1);
  const query = f.calls.vehicles[0];
  assert.equal(query.select.weight_unit, true);
  assert.equal(query.select.volume_unit, true);
  assert.deepEqual(query.where, { tenant_id: context.tenantId, operational_status: "AVAILABLE", available_for_calculation: true, effective_from: { lte: new Date(start) }, OR: [{ effective_to: null }, { effective_to: { gt: new Date(start) } }] });
  assert.deepEqual(facts.interval, { start, end });
  assert.equal(facts.route.version, 3);
  assert.equal(facts.services.revision, 4);
});

test("imperial capacities become kg and cubic metres without changing source rows", async () => {
  const source = vehicle({ capacity_weight: new Prisma.Decimal("2000"), capacity_volume: new Prisma.Decimal("1000"), weight_unit: "LB", volume_unit: "CFT", row_version: 5 });
  const facts = await fixture([source]).read();
  assert.deepEqual(facts.vehicles, [{ vehicleType: "TRUCK", available: 1, maxWeightKg: 907.18474, maxVolumeM3: 28.316846592, sourceVersion: 5 }]);
  assert.equal(source.capacity_weight.toString(), "2000");
  assert.equal(source.capacity_volume.toString(), "1000");
  assert.equal(source.weight_unit, "LB");
  assert.equal(source.volume_unit, "CFT");
});

test("mixed units are compared only after conversion, independently by vehicle type", async () => {
  const facts = await fixture([
    vehicle({ capacity_weight: 1200, capacity_volume: 40, row_version: 4 }),
    vehicle({ capacity_weight: 5000, capacity_volume: 1000, weight_unit: "LB", volume_unit: "CFT", row_version: 9 }),
    vehicle({ vehicle_type: "VAN", capacity_weight: 500, capacity_volume: 10, row_version: 2 }),
    vehicle({ vehicle_type: "VAN", capacity_weight: 1000, capacity_volume: 200, weight_unit: "LB", volume_unit: "CFT", row_version: 6 }),
  ]).read();
  assert.deepEqual(facts.vehicles, [
    { vehicleType: "TRUCK", available: 2, maxWeightKg: 2267.96185, maxVolumeM3: 40, sourceVersion: 9 },
    { vehicleType: "VAN", available: 2, maxWeightKg: 500, maxVolumeM3: 10, sourceVersion: 6 },
  ]);
});

test("unknown capacities remain null while availability still reflects operational unit counts", async () => {
  const facts = await fixture([
    vehicle({ capacity_weight: null, capacity_volume: null, row_version: 2 }),
    vehicle({ capacity_weight: null, capacity_volume: null, weight_unit: "LB", volume_unit: "CFT", row_version: 5 }),
    vehicle({ vehicle_type: "VAN", capacity_weight: null, capacity_volume: 12, row_version: 4 }),
    vehicle({ vehicle_type: "VAN", capacity_weight: 100, capacity_volume: null, row_version: 7 }),
  ]).read();
  assert.deepEqual(facts.vehicles, [
    { vehicleType: "TRUCK", available: 2, maxWeightKg: null, maxVolumeM3: null, sourceVersion: 5 },
    { vehicleType: "VAN", available: 2, maxWeightKg: 100, maxVolumeM3: 12, sourceVersion: 7 },
  ]);
  const plan = calculateLogisticsPlan(facts, [{ ruleRef: ref(10), seriesRef: ref(11), code: "TRUCK_COUNT", family: "TRANSPORT", state: "ACTIVE", conditions: {}, priority: 1, specificity: 1, version: 1, conditionHash: "a".repeat(64), result: { kind: "TRUCK", label: "Camión", quantity: 2, unit: "unidad", availabilitySource: "VEHICLE", sourceCode: "TRUCK" } }]);
  assert.equal(plan.items[0].availableQuantity, 2);
  assert.equal(plan.items[0].availability, "AVAILABLE");
  assert.equal(plan.items[0].sourceVersion, 5);
});

test("unknown or missing source units stop calculation instead of assuming metric units", async () => {
  for (const overrides of [{ weight_unit: "TON" }, { weight_unit: undefined }, { volume_unit: "M3" }, { volume_unit: null }, { volume_unit: "" }, { weight_unit: "LB", volume_unit: "unknown", capacity_volume: null }]) {
    await assert.rejects(fixture([vehicle(overrides)]).read(), (error) => error instanceof LogisticsEngineError && error.code === "LOGISTICS_VEHICLE_UNIT_INVALID" && error.status === 409);
  }
});

test("invalid stored capacities are rejected rather than becoming zero", async () => {
  for (const overrides of [{ capacity_weight: -1 }, { capacity_weight: 0 }, { capacity_volume: "not-a-number" }, { capacity_volume: Number.POSITIVE_INFINITY }, { capacity_weight: true }]) {
    await assert.rejects(fixture([vehicle(overrides)]).read(), (error) => error instanceof LogisticsEngineError && error.code === "LOGISTICS_VEHICLE_CAPACITY_INVALID" && error.status === 409);
  }
});

test("an empty fleet stays empty", async () => {
  assert.deepEqual((await fixture([]).read()).vehicles, []);
});

test("reading a published plan preserves its historical snapshot without consulting current fleet", async () => {
  const snapshot = Object.freeze({ sourceCapacityWeight: 2000, weightUnit: "LB", sourceCapacityVolume: 1000, volumeUnit: "CFT" });
  const row = Object.freeze({ id: "historical-revision", revisionRef: ref(31), revision: 2, inputSnapshot: Object.freeze({}), status: "PUBLISHED", logicalSha256: "a".repeat(64), publishedAt: new Date(start), items: [Object.freeze({ id: "historical-item", itemRef: ref(32), family: "TRANSPORT", kind: "TRUCK", label: "Camión", quantity: 1, unit: "unidad", estimatedHours: null, trips: 1, requiredQuantity: 1, availableQuantity: 1, reservedQuantity: 0, shortageQuantity: 0, availability: "AVAILABLE", priceStatus: "NOT_APPLICABLE", source: "VEHICLE", sourceRef: null, sourceVersion: 3, snapshot, position: 0 })], issues: [], overrides: [] });
  const f = fixture([]);
  const scope = { tenantId: context.tenantId, planId: "historical-plan", status: "PUBLISHED" };
  f.tx.logisticsPlan = { findFirst: async () => ({ id: "historical-plan", planRef: ref(30) }) };
  f.tx.logisticsPlanRevision = {
    findMany: async (query) => {
      f.calls.logisticsRevisions.push(query);
      assert.deepEqual(query.where, scope);
      assert.deepEqual(query.select, { id: true, revision: true, inputSnapshot: true });
      return [
        { id: "newer-service-revision", revision: 3, inputSnapshot: { transportContext: SERVICE_TRANSPORT_CONTEXT } },
        { id: row.id, revision: row.revision, inputSnapshot: row.inputSnapshot },
      ];
    },
    findFirst: async (query) => {
      assert.deepEqual(query.where, { AND: [scope, { id: row.id }] });
      assert.deepEqual(query.include, { items: { orderBy: { position: "asc" } }, issues: true, overrides: true });
      return row;
    },
  };
  const result = await getLogisticsPlan(f.tx, context, ref(1));
  assert.deepEqual(result.items[0].snapshot, snapshot);
  assert.equal(result.items[0].sourceVersion, 3);
  assert.equal(result.revision, 2);
  assert.equal(f.calls.vehicles.length, 0);
  assert.equal(f.calls.logisticsRevisions.length, 1);
  assert.equal(row.items[0].snapshot.sourceCapacityWeight, 2000);
});

test("a pending calculation using unconverted imperial facts must be recalculated before publishing", async () => {
  const f = fixture([vehicle({ capacity_weight: 2000, capacity_volume: 1000, weight_unit: "LB", volume_unit: "CFT" })]);
  const { availabilityObservedAt: _observedAt, ...stableFacts } = await f.read();
  const oldFacts = { ...stableFacts, vehicles: [{ ...stableFacts.vehicles[0], maxWeightKg: 2000, maxVolumeM3: 1000 }] };
  const calculationRef = ref(40); const requestId = ref(41);
  const calculation = Object.freeze({ id: "pending-calculation", calculationRef, pipelineCaseId: "test-case", pipelineCase: { publicRef: ref(1) }, intervalStart: new Date(start), intervalEnd: new Date(end), inputHash: canonicalHash({ facts: oldFacts, rules: [] }), publishedRevision: null });
  let publicationWrites = 0;
  f.tx.$executeRaw = async () => 1;
  f.tx.logisticsMutationCommand = { findUnique: async () => null };
  f.tx.logisticsCalculation = { findFirst: async () => calculation };
  f.tx.logisticsRule = { findMany: async () => [] };
  f.tx.logisticsPlan = { upsert: async () => { publicationWrites += 1; throw new Error("Publication must stop before writes"); } };
  const prisma = { $transaction: (run) => run(f.tx) };
  await assert.rejects(publishLogistics(prisma, context, { requestId, calculationRef, payloadHash: canonicalHash({ operation: "LOGISTICS_PUBLISH", requestId, calculationRef }) }), (error) => error instanceof LogisticsEngineError && error.code === "LOGISTICS_INPUT_STALE" && error.status === 409);
  assert.equal(publicationWrites, 0);
  assert.equal(f.calls.logisticsRevisions.length, 1);
  assert.deepEqual(f.calls.logisticsRevisions[0].where.plan, { pipelineCaseId: "test-case" });
  assert.equal(calculation.inputHash, canonicalHash({ facts: oldFacts, rules: [] }));
});
