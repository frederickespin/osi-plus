import assert from "node:assert/strict";
import { test } from "node:test";
import { assertWarehouseLocationPolicy, loadWarehouseLocationPolicies, publicWarehouseLocationPolicy, resolveWarehouseLocationPolicies, warehouseStockAvailability, withWarehousePolicyTransaction } from "../api/_lib/warehouseLocationPolicy.js";
import { listMaterials } from "../api/_lib/materialsInventoryDomain.js";
import { listAssetInstances } from "../api/_lib/toolsEquipmentDomain.js";
import { loadCanonicalLogisticsFacts } from "../api/_lib/logisticsEngineDomain.js";

const warehouse = { warehouseRef: "warehouse-ref", status: "ACTIVE" };
const locations = [
  { id: "root", locationRef: "root-ref", warehouseId: "warehouse", parentLocationId: null, status: "ACTIVE", warehouse },
  { id: "zone", locationRef: "zone-ref", warehouseId: "warehouse", parentLocationId: "root", status: "ACTIVE", warehouse },
  { id: "bin", locationRef: "bin-ref", warehouseId: "warehouse", parentLocationId: "zone", status: "ACTIVE", warehouse },
  { id: "safe", locationRef: "safe-ref", warehouseId: "warehouse", parentLocationId: "root", status: "ACTIVE", warehouse },
];
const blockedZone = { locationId: "zone", operationalStatus: "ACTIVE", availabilityRule: "BLOCKED", controlReason: "Área en revisión" };

test("defaults are derived without inventing configuration rows", () => {
  const policies = resolveWarehouseLocationPolicies(locations, []);
  assert.equal(policies.size, 4);
  for (const policy of policies.values()) assert.deepEqual([policy.operationalStatus, policy.availabilityRule, policy.canReceive, policy.canDispatch, policy.blockedBy.length], ["ACTIVE", "CONDITION_BASED", true, true, 0]);
});
test("a blocked ancestor permits receipt but prevents dispatch and carries its reason", () => {
  const policies = resolveWarehouseLocationPolicies(locations, [blockedZone, { locationId: "bin", operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED" }]);
  const bin = policies.get("bin");
  assert.equal(bin.canReceive, true); assert.equal(bin.canDispatch, false); assert.equal(bin.inherited, true);
  assert.equal(bin.blockedBy[0].locationRef, "zone-ref"); assert.equal(bin.blockedBy[0].reason, "Área en revisión");
  assert.equal(policies.get("safe").canDispatch, true);
  assert.equal(assertWarehouseLocationPolicy(policies, "bin", "RECEIVE"), bin);
  assert.throws(() => assertWarehouseLocationPolicy(policies, "bin", "DISPATCH"), { code: "WAREHOUSE_LOCATION_DISPATCH_BLOCKED", status: 409 });
});
test("operational restrictions inherit and the strongest status wins independently of dispatch rule", () => {
  const policies = resolveWarehouseLocationPolicies(locations, [{ locationId: "root", operationalStatus: "RESTRICTED", availabilityRule: "CONDITION_BASED" }, { locationId: "zone", operationalStatus: "OUT_OF_SERVICE", availabilityRule: "CONDITION_BASED" }]);
  assert.equal(policies.get("safe").operationalStatus, "RESTRICTED");
  assert.equal(policies.get("bin").operationalStatus, "OUT_OF_SERVICE");
  assert.equal(policies.get("bin").availabilityRule, "CONDITION_BASED");
  assert.throws(() => assertWarehouseLocationPolicy(policies, "bin", "RECEIVE"), { code: "WAREHOUSE_LOCATION_NOT_OPERATIONAL" });
});
test("inactive warehouse or ancestor blocks a locally ACTIVE location", () => {
  for (const rows of [locations.map((row) => row.id === "root" ? { ...row, status: "INACTIVE" } : row), locations.map((row) => ({ ...row, warehouse: { ...warehouse, status: "INACTIVE" } }))]) {
    const policy = resolveWarehouseLocationPolicies(rows, []).get("bin");
    assert.equal(policy.canReceive, false); assert.equal(policy.canDispatch, false); assert.equal(policy.inherited, true);
  }
});
test("missing, cyclic or cross-warehouse parents fail closed without parsing codes", () => {
  for (const rows of [locations.filter((row) => row.id !== "zone"), locations.map((row) => row.id === "root" ? { ...row, parentLocationId: "bin" } : row), locations.map((row) => row.id === "zone" ? { ...row, warehouseId: "foreign" } : row)]) {
    const policy = resolveWarehouseLocationPolicies(rows, []).get("bin");
    assert.equal(policy.canReceive, false); assert.equal(policy.canDispatch, false);
    assert.ok(policy.blockedBy.some((entry) => entry.kind === "HIERARCHY_INVALID"));
  }
});
test("classification and informational text cannot grant or block availability", () => {
  const policies = resolveWarehouseLocationPolicies(locations, [{ locationId: "zone", operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED", purpose: "CLIENT_STORAGE", notes: "BLOCKED", characteristics: "OUT_OF_SERVICE" }]);
  assert.equal(policies.get("bin").canDispatch, true);
});
test("public policy exposes opaque references but not internal IDs", () => {
  const policy = publicWarehouseLocationPolicy(resolveWarehouseLocationPolicies(locations, [blockedZone]).get("bin"));
  assert.equal(Object.hasOwn(policy, "locationId"), false); assert.equal(policy.locationRef, "bin-ref");
  assert.equal(publicWarehouseLocationPolicy(null), null);
});
test("loader filters by tenant before deriving complete ancestors and returning requested locations", async () => {
  const queries = [];
  const database = { materialLocation: { findMany: async (query) => { queries.push(query); return locations; } }, warehouseLocationConfiguration: { findMany: async (query) => { queries.push(query); return [blockedZone]; } } };
  const policies = await loadWarehouseLocationPolicies(database, "tenant", { locationIds: ["bin"] });
  assert.deepEqual([...policies.keys()], ["bin"]); assert.equal(policies.get("bin").canDispatch, false);
  assert.ok(queries.every((query) => query.where.tenantId === "tenant"));
  await assert.rejects(() => loadWarehouseLocationPolicies(database, undefined), { code: "WAREHOUSE_CONFIGURATION_FORBIDDEN" });
  assert.equal(queries.length, 2);
});
test("dispatchable availability partitions stock without changing physical or reserved balances", () => {
  const balances = [{ locationId: "bin", physical: 10, reserved: 2, assigned: 1, available: 7 }, { locationId: "safe", physical: 20, reserved: 3, assigned: 1, available: 16 }];
  const before = JSON.stringify(balances);
  assert.deepEqual(warehouseStockAvailability(balances, resolveWarehouseLocationPolicies(locations, [blockedZone])), { dispatchable: 16, blockedAvailable: 7, blockedPhysical: 10, eligiblePhysical: 20, eligibleCommitted: 4 });
  assert.equal(JSON.stringify(balances), before);
});
test("gate OFF transaction uses no policy lock or epoch and does not change legacy retry behavior", async () => {
  const database = { $transaction: async (execute) => execute({}) };
  assert.equal(await withWarehousePolicyTransaction(database, "tenant", async (_tx, enabled) => { assert.equal(enabled, false); return "legacy"; }, { enabled: false }), "legacy");
  let attempts = 0;
  await assert.rejects(() => withWarehousePolicyTransaction({ $transaction: async () => { attempts += 1; throw Object.assign(new Error("serialization"), { code: "P2034" }); } }, "tenant", () => null, { enabled: false }), { code: "P2034" });
  assert.equal(attempts, 1);
});
test("enabled transactions lock first and retry Serializable failures only within a bound", async () => {
  let attempts = 0; const sequence = [];
  const database = { $transaction: async (execute) => { attempts += 1; return execute({ $executeRaw: async () => { sequence.push("lock"); } }); } };
  const result = await withWarehousePolicyTransaction(database, "tenant", async () => { sequence.push("execute"); if (attempts < 2) throw Object.assign(new Error("serialization"), { code: "P2034" }); return "ok"; }, { enabled: true });
  assert.equal(result, "ok"); assert.deepEqual(sequence, ["lock", "execute", "lock", "execute"]);
  attempts = 0;
  await assert.rejects(() => withWarehousePolicyTransaction(database, "tenant", async () => { throw Object.assign(new Error("serialization"), { code: "P2034" }); }, { enabled: true }), { code: "P2034" });
  assert.equal(attempts, 5);
});

function factDatabase() {
  const instance = (currentLocationId) => ({ currentLocationId, operationalStatus: "AVAILABLE", reservations: [], assignments: [], maintenanceOrders: [] });
  return {
    pipelineCase: { findFirst: async () => ({ id: "case", publicRef: "case-ref", mode: "LOCAL", routeContractVersion: 1, routeRevision: 1, destinationStatus: "CONFIRMED" }) },
    pipelineCaseRouteSnapshot: { findMany: async () => [] },
    pipelineCaseServiceRevision: { findFirst: async () => ({ selectionRef: "service-ref", revision: 1, modeSnapshot: "LOCAL", items: [] }) },
    surveyPublication: { findFirst: async () => null },
    materialRequirementSnapshot: { findFirst: async () => ({ requirementRef: "requirement-ref", logicalSha256: "a".repeat(64), lines: [{ requiredQuantity: 25, material: { id: "material", materialRef: "material-ref", name: "Material", costs: [] }, unit: { code: "UND" } }] }) },
    assetModel: { findMany: async () => [{ modelRef: "model-ref", code: "MODEL", name: "Model", family: "TOOLS", resourceType: "TOOL", version: 1, instances: [instance("bin"), instance("safe")] }] },
    vehicle: { findMany: async () => [] }, externalResourceOffer: { findMany: async () => [] },
    materialInventoryMovement: { findMany: async () => [{ materialId: "material", locationId: "bin", movementType: "RECEIPT", quantityBase: 10 }, { materialId: "material", locationId: "safe", movementType: "RECEIPT", quantityBase: 20 }] },
    materialReservation: { findMany: async () => [{ materialId: "material", locationId: "bin", quantityBase: 2 }, { materialId: "material", locationId: "safe", quantityBase: 4 }] },
    materialLocation: { findMany: async () => locations }, warehouseLocationConfiguration: { findMany: async () => [blockedZone] },
  };
}
const context = { tenantId: "tenant", membershipId: "member", userId: "user", effectivePermissions: ["assets:instance:view"], deniedPermissions: [] };
async function withMode(mode, execute) { const before = process.env.WAREHOUSE_CONFIGURATION_API_MODE; process.env.WAREHOUSE_CONFIGURATION_API_MODE = mode; try { return await execute(); } finally { if (before === undefined) delete process.env.WAREHOUSE_CONFIGURATION_API_MODE; else process.env.WAREHOUSE_CONFIGURATION_API_MODE = before; } }

test("new logistics facts exclude blocked resources but retain physical evidence and original snapshots", async () => withMode("LOCAL_ONLY", async () => {
  const before = { materials: { lines: [{ available: 30, reserved: 6 }] }, assets: [{ available: 2 }] }; const unchanged = JSON.stringify(before);
  const facts = await loadCanonicalLogisticsFacts(factDatabase(), context, "case-ref", "2026-11-01T12:00:00.000Z", "2026-11-01T14:00:00.000Z");
  assert.deepEqual({ available: facts.materials.lines[0].available, reserved: facts.materials.lines[0].reserved, physical: facts.materials.lines[0].physical, committed: facts.materials.lines[0].committed, dispatchable: facts.materials.lines[0].dispatchable, blockedPhysical: facts.materials.lines[0].blockedPhysical, blockedAvailable: facts.materials.lines[0].blockedAvailable }, { available: 20, reserved: 4, physical: 30, committed: 6, dispatchable: 16, blockedPhysical: 10, blockedAvailable: 8 });
  assert.equal(facts.assets[0].available, 1); assert.equal(facts.assets[0].observed, 2); assert.equal(facts.assets[0].blockedByLocation, 1);
  assert.equal(JSON.stringify(before), unchanged);
}));
test("gate OFF availability consumers issue zero new-table reads and retain legacy facts", async () => withMode("DISABLED", async () => {
  const database = factDatabase();
  Object.defineProperty(database, "warehouseLocationConfiguration", { get() { throw new Error("new table read while disabled"); } });
  Object.defineProperty(database, "warehouseLocationPolicyEpoch", { get() { throw new Error("epoch while disabled"); } });
  database.materialCatalogItem = { count: async () => 0, findMany: async () => [] };
  database.assetInstance = { count: async () => 0, findMany: async () => [] };
  assert.deepEqual((await listMaterials(database, context)).items, []);
  assert.deepEqual((await listAssetInstances(database, context)).items, []);
  const facts = await loadCanonicalLogisticsFacts(database, context, "case-ref", "2026-11-01T12:00:00.000Z", "2026-11-01T14:00:00.000Z");
  assert.equal(facts.materials.lines[0].available, 30); assert.equal(facts.materials.lines[0].reserved, 6);
  assert.equal(Object.hasOwn(facts.materials.lines[0], "blockedPhysical"), false); assert.equal(facts.assets[0].available, 2);
}));
