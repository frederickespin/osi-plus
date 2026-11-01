import { Prisma } from "@prisma/client";

export class WarehouseLocationPolicyError extends Error {
  constructor(code, status = 409) { super(code); this.name = "WarehouseLocationPolicyError"; this.code = code; this.status = status; }
}

function requireTenant(tenantId) {
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new WarehouseLocationPolicyError("WAREHOUSE_CONFIGURATION_FORBIDDEN", 403);
}

const OPERATIONAL_ORDER = Object.freeze({ ACTIVE: 0, RESTRICTED: 1, OUT_OF_SERVICE: 2 });

/** Derive inherited controls from opaque parent identities, never from display codes. */
export function resolveWarehouseLocationPolicies(locations, configurations) {
  const byId = new Map(locations.map((row) => [row.id, row]));
  const configurationByLocation = new Map(configurations.map((row) => [row.locationId, row]));
  const policies = new Map();
  for (const location of locations) {
    const chain = []; const visited = new Set(); let current = location; let invalidHierarchy = false;
    while (current) {
      if (visited.has(current.id) || current.warehouseId !== location.warehouseId || visited.size > 600) { invalidHierarchy = true; break; }
      visited.add(current.id); chain.push(current);
      if (!current.parentLocationId) break;
      current = byId.get(current.parentLocationId);
      if (!current) invalidHierarchy = true;
    }
    const warehouseRef = location.warehouse?.warehouseRef ?? null;
    const blockedBy = []; let operationalStatus = "ACTIVE"; let availabilityRule = "CONDITION_BASED";
    const block = (kind, row, value, reason = null) => blockedBy.push(Object.freeze({ kind, locationRef: row?.locationRef ?? null, warehouseRef, value, reason }));
    if (!location.warehouse || location.warehouse.status !== "ACTIVE") {
      operationalStatus = "OUT_OF_SERVICE"; block("WAREHOUSE_INACTIVE", null, location.warehouse?.status ?? "UNKNOWN");
    }
    if (invalidHierarchy) { operationalStatus = "OUT_OF_SERVICE"; block("HIERARCHY_INVALID", location, "INVALID"); }
    for (const node of chain.reverse()) {
      const configuration = configurationByLocation.get(node.id);
      const reason = configuration?.controlReason ?? null;
      if (node.status !== "ACTIVE") { operationalStatus = "OUT_OF_SERVICE"; block("LOCATION_INACTIVE", node, node.status ?? "UNKNOWN", reason); }
      const ownStatus = configuration?.operationalStatus ?? "ACTIVE";
      if (!Object.hasOwn(OPERATIONAL_ORDER, ownStatus)) {
        operationalStatus = "OUT_OF_SERVICE"; block("HIERARCHY_INVALID", node, "INVALID_CONTROL", reason);
      } else if (ownStatus !== "ACTIVE") {
        if (OPERATIONAL_ORDER[ownStatus] > OPERATIONAL_ORDER[operationalStatus]) operationalStatus = ownStatus;
        block("OPERATIONAL_STATUS", node, ownStatus, reason);
      }
      const ownAvailability = configuration?.availabilityRule ?? "CONDITION_BASED";
      if (ownAvailability !== "CONDITION_BASED") {
        if (ownAvailability !== "BLOCKED") operationalStatus = "OUT_OF_SERVICE";
        availabilityRule = "BLOCKED"; block(ownAvailability === "BLOCKED" ? "DISPATCH_BLOCKED" : "HIERARCHY_INVALID", node, ownAvailability, reason);
      }
    }
    const canReceive = operationalStatus === "ACTIVE";
    policies.set(location.id, Object.freeze({
      locationId: location.id, locationRef: location.locationRef, warehouseRef, operationalStatus, availabilityRule,
      canReceive, canDispatch: canReceive && availabilityRule === "CONDITION_BASED",
      inherited: blockedBy.some((entry) => entry.locationRef !== location.locationRef), blockedBy: Object.freeze(blockedBy),
    }));
  }
  return policies;
}

/** Call only after the configuration gate is enabled; reads never create defaults. */
export async function loadWarehouseLocationPolicies(database, tenantId, { locationIds } = {}) {
  requireTenant(tenantId);
  const [locations, configurations] = await Promise.all([
    database.materialLocation.findMany({ where: { tenantId }, select: { id: true, locationRef: true, warehouseId: true, parentLocationId: true, status: true, warehouse: { select: { warehouseRef: true, status: true } } } }),
    database.warehouseLocationConfiguration.findMany({ where: { tenantId }, select: { locationId: true, operationalStatus: true, availabilityRule: true, controlReason: true } }),
  ]);
  const policies = resolveWarehouseLocationPolicies(locations, configurations);
  if (!locationIds) return policies;
  const requested = new Set(locationIds);
  return new Map([...policies].filter(([id]) => requested.has(id)));
}

export function publicWarehouseLocationPolicy(policy) {
  if (!policy) return null;
  const { locationId: _locationId, ...result } = policy;
  return Object.freeze(result);
}

export function assertWarehouseLocationPolicy(policies, locationId, action = "DISPATCH") {
  const policy = policies.get(locationId);
  if (!policy) throw new WarehouseLocationPolicyError("WAREHOUSE_LOCATION_NOT_FOUND", 404);
  if (!policy.canReceive) throw new WarehouseLocationPolicyError("WAREHOUSE_LOCATION_NOT_OPERATIONAL");
  if (action === "DISPATCH" && !policy.canDispatch) throw new WarehouseLocationPolicyError("WAREHOUSE_LOCATION_DISPATCH_BLOCKED");
  if (!["RECEIVE", "DISPATCH"].includes(action)) throw new WarehouseLocationPolicyError("WAREHOUSE_LOCATION_ACTION_INVALID", 400);
  return policy;
}

/** Derived availability only; callers retain their original physical balances. */
export function warehouseStockAvailability(locationBalances, policies) {
  return Object.freeze(locationBalances.reduce((sum, row) => {
    if (policies.get(row.locationId)?.canDispatch) {
      sum.dispatchable += Math.max(0, row.available);
      sum.eligiblePhysical += row.physical;
      sum.eligibleCommitted += row.reserved + row.assigned;
    } else {
      sum.blockedAvailable += Math.max(0, row.available);
      sum.blockedPhysical += row.physical;
    }
    return sum;
  }, { dispatchable: 0, blockedAvailable: 0, blockedPhysical: 0, eligiblePhysical: 0, eligibleCommitted: 0 }));
}

/** Always precedes stock/asset locks, including transactions that release commitments. */
export async function lockWarehouseConfiguration(tx, tenantId) {
  requireTenant(tenantId);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`warehouse-policy:${tenantId}`}, 0))`);
}

/**
 * Call after replay, before any policy/resource reads. A Serializable snapshot
 * taken while waiting for the advisory lock must conflict with a newer epoch,
 * including the first explicit configuration of a previously implicit default.
 */
export async function advanceWarehouseLocationPolicyEpoch(tx, tenantId) {
  requireTenant(tenantId);
  await tx.warehouseLocationPolicyEpoch.upsert({ where: { tenantId }, create: { tenantId, revision: 1n }, update: { revision: { increment: 1n } } });
}

function retryable(error) {
  if (["P2034", "40001", "40P01"].includes(error?.code) || ["40001", "40P01"].includes(error?.meta?.code)) return true;
  const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(",") : String(error?.meta?.target || "");
  return error?.code === "P2002" && (error?.meta?.modelName === "WarehouseLocationPolicyEpoch" || /tenant.*request|request.*tenant|policy.*epoch/i.test(target));
}

/** OFF preserves legacy transactions; ON retries a stale Serializable snapshot. */
export async function withWarehousePolicyTransaction(prisma, tenantId, execute, { enabled = false, ...options } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (enabled) await lockWarehouseConfiguration(tx, tenantId);
        return execute(tx, enabled);
      }, options);
    } catch (error) {
      if (!enabled || attempt >= 4 || !retryable(error)) throw error;
    }
  }
}
