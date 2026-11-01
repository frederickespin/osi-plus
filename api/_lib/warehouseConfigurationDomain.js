import { Prisma } from "@prisma/client";
import { canonicalPayloadHash } from "./materialsInventoryContract.js";
import { normalizeWarehouseAreaUseCreate, normalizeWarehouseAreaUseUpdate, normalizeWarehouseLocationConfiguration, warehouseConfigurationFail } from "./warehouseConfigurationContract.js";
import { advanceWarehouseLocationPolicyEpoch, loadWarehouseLocationPolicies, lockWarehouseConfiguration, publicWarehouseLocationPolicy } from "./warehouseLocationPolicy.js";

function requireRead(context) {
  if (!context.effectivePermissions?.includes("inventory:stock:view") || context.deniedPermissions?.includes("inventory:stock:view")) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_FORBIDDEN", 403);
}
function requireManagement(context) {
  requireRead(context);
  if (!context.effectivePermissions?.includes("inventory:catalog:manage") || context.deniedPermissions?.includes("inventory:catalog:manage")) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_FORBIDDEN", 403);
}
function publicAreaUse(row) {
  return { useRef: row.useRef, code: row.code, name: row.name, description: row.description, purpose: row.purpose, status: row.status, version: row.version, assignedLocationCount: row._count?.locations ?? 0 };
}
function publicLocationConfiguration(location, configuration, policy) {
  return {
    locationRef: location.locationRef, warehouseRef: policy.warehouseRef,
    configRef: configuration?.configRef ?? null, version: configuration?.version ?? 0,
    areaUseRef: configuration?.areaUse?.useRef ?? null,
    characteristics: configuration?.characteristics ?? null, notes: configuration?.notes ?? null,
    operationalStatus: configuration?.operationalStatus ?? "ACTIVE", availabilityRule: configuration?.availabilityRule ?? "CONDITION_BASED",
    lastControlReason: configuration?.controlReason ?? null,
    effective: publicWarehouseLocationPolicy(policy),
  };
}
async function replay(prisma, context, input) {
  const existing = await prisma.materialInventoryCommand.findUnique({ where: { tenantId_requestId: { tenantId: context.tenantId, requestId: input.requestId } } });
  if (!existing) return null;
  if (existing.payloadHash !== input.payloadHash) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_IDEMPOTENCY_CONFLICT", 409);
  return existing.resultJson;
}
async function mutate(prisma, context, input, execute) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // This is the first lock, shared with stock and asset mutation consumers.
        await lockWarehouseConfiguration(tx, context.tenantId);
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`warehouse-command:${context.tenantId}:${input.requestId}`}, 0))`);
        const result = await replay(tx, context, input);
        if (result) return result;
        await advanceWarehouseLocationPolicyEpoch(tx, context.tenantId);
        return execute(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
    } catch (error) {
      if (!["P2002", "P2034"].includes(error?.code)) throw error;
      const result = await replay(prisma, context, input);
      if (result) return result;
      if (error.code === "P2002" && error.meta?.modelName === "WarehouseAreaUse") {
        const target = JSON.stringify(error.meta?.target ?? "");
        warehouseConfigurationFail(target.includes("name_key") ? "WAREHOUSE_AREA_USE_NAME_CONFLICT" : "WAREHOUSE_AREA_USE_CODE_CONFLICT", 409);
      }
      if (error.code === "P2002" && error.meta?.modelName === "WarehouseLocationConfiguration") warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", 409);
      if (attempt === 4) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_WRITE_CONFLICT", 409);
    }
  }
}
async function persist(tx, context, input, targetRef, entity, before, result) {
  await tx.materialInventoryCommand.create({ data: { tenantId: context.tenantId, requestId: input.requestId, operation: input.operation, payloadHash: input.payloadHash, targetRef, resultJson: result, actorMembershipId: context.membershipId, actorUserId: context.userId } });
  await tx.commercialAuditLog.create({ data: {
    tenant_id: context.tenantId, actor_user_id: context.userId, actor_membership_id: context.membershipId,
    role_snapshot: context.role, action: input.operation, entity, entityId: targetRef,
    ...(before ? { before_json: before } : {}), after_json: { ...result, ...(input.changeReason ? { changeReason: input.changeReason, acknowledgeImpact: input.acknowledgeImpact } : {}) },
    source: "V17_WAREHOUSE_CONFIGURATION", request_id: input.requestId, correlation_id: input.requestId, critical: true,
  } });
  return Object.freeze(result);
}
async function areaUseRows(prisma, context) {
  const rows = await prisma.warehouseAreaUse.findMany({ where: { tenantId: context.tenantId }, include: { _count: { select: { locations: true } } }, orderBy: [{ name: "asc" }, { code: "asc" }] });
  return rows.map(publicAreaUse);
}

export async function listWarehouseConfiguration(prisma, context) {
  requireRead(context);
  return prisma.$transaction(async (tx) => {
    const [areaUses, locations, configurations, policies] = await Promise.all([
      areaUseRows(tx, context),
      tx.materialLocation.findMany({ where: { tenantId: context.tenantId }, orderBy: [{ warehouseId: "asc" }, { depth: "asc" }, { code: "asc" }] }),
      tx.warehouseLocationConfiguration.findMany({ where: { tenantId: context.tenantId }, include: { areaUse: { select: { useRef: true } } } }),
      loadWarehouseLocationPolicies(tx, context.tenantId),
    ]);
    const byLocation = new Map(configurations.map((row) => [row.locationId, row]));
    return Object.freeze({ areaUses, locations: locations.map((location) => publicLocationConfiguration(location, byLocation.get(location.id), policies.get(location.id))) });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 10000 });
}

export async function createWarehouseAreaUse(prisma, context, raw) {
  requireManagement(context); const input = normalizeWarehouseAreaUseCreate(raw);
  return mutate(prisma, context, input, async (tx) => {
    if (await tx.warehouseAreaUse.findFirst({ where: { tenantId: context.tenantId, nameKey: input.nameKey } })) warehouseConfigurationFail("WAREHOUSE_AREA_USE_NAME_CONFLICT", 409);
    const code = `USO-${canonicalPayloadHash({ tenantId: context.tenantId, operation: input.operation, requestId: input.requestId }).slice(0, 16).toUpperCase()}`;
    const row = await tx.warehouseAreaUse.create({ data: { tenantId: context.tenantId, code, name: input.name, nameKey: input.nameKey, description: input.description, purpose: input.purpose } });
    return persist(tx, context, input, row.useRef, "WarehouseAreaUse", null, publicAreaUse(row));
  });
}

export async function updateWarehouseAreaUse(prisma, context, useRef, raw) {
  requireManagement(context); const input = normalizeWarehouseAreaUseUpdate(raw, useRef);
  return mutate(prisma, context, input, async (tx) => {
    const current = await tx.warehouseAreaUse.findFirst({ where: { tenantId: context.tenantId, useRef: input.useRef }, include: { _count: { select: { locations: true } } } });
    if (!current) warehouseConfigurationFail("WAREHOUSE_AREA_USE_NOT_FOUND", 404);
    if (current.version !== input.expectedVersion) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", 409);
    const duplicate = await tx.warehouseAreaUse.findFirst({ where: { tenantId: context.tenantId, nameKey: input.nameKey, id: { not: current.id } } });
    if (duplicate) warehouseConfigurationFail("WAREHOUSE_AREA_USE_NAME_CONFLICT", 409);
    const changed = await tx.warehouseAreaUse.updateMany({ where: { tenantId: context.tenantId, id: current.id, version: input.expectedVersion }, data: { name: input.name, nameKey: input.nameKey, description: input.description, purpose: input.purpose, status: input.status, version: { increment: 1 } } });
    if (changed.count !== 1) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", 409);
    const row = await tx.warehouseAreaUse.findFirst({ where: { tenantId: context.tenantId, id: current.id }, include: { _count: { select: { locations: true } } } });
    return persist(tx, context, input, row.useRef, "WarehouseAreaUse", publicAreaUse(current), publicAreaUse(row));
  });
}

function descendantLocationIds(locations, rootId) {
  const children = new Map();
  for (const location of locations) {
    if (!location.parentLocationId) continue;
    const siblings = children.get(location.parentLocationId) ?? []; siblings.push(location.id); children.set(location.parentLocationId, siblings);
  }
  const scope = new Set(); const pending = [rootId];
  while (pending.length) {
    const id = pending.pop();
    if (scope.has(id)) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_HIERARCHY_INVALID", 409);
    scope.add(id); pending.push(...(children.get(id) ?? []));
  }
  return [...scope];
}
async function assertNoActiveCommitments(tx, context, locationIds) {
  const [material, reservation, assignment] = await Promise.all([
    tx.materialReservation.findFirst({ where: { tenantId: context.tenantId, locationId: { in: locationIds }, status: { in: ["RESERVED", "ASSIGNED"] } }, select: { id: true } }),
    tx.assetReservation.findFirst({ where: { tenantId: context.tenantId, status: "ACTIVE", assetInstance: { currentLocationId: { in: locationIds } } }, select: { id: true } }),
    tx.assetAssignment.findFirst({ where: { tenantId: context.tenantId, status: { in: ["PLANNED", "ACTIVE"] }, OR: [{ originLocationId: { in: locationIds } }, { destinationLocationId: { in: locationIds } }, { assetInstance: { currentLocationId: { in: locationIds } } }] }, select: { id: true } }),
  ]);
  if (material || reservation || assignment) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE", 409);
}

export async function updateWarehouseLocationConfiguration(prisma, context, locationRef, raw) {
  requireManagement(context); const input = normalizeWarehouseLocationConfiguration(raw, locationRef);
  return mutate(prisma, context, input, async (tx) => {
    const location = await tx.materialLocation.findFirst({ where: { tenantId: context.tenantId, locationRef: input.locationRef } });
    if (!location) warehouseConfigurationFail("WAREHOUSE_LOCATION_NOT_FOUND", 404);
    const current = await tx.warehouseLocationConfiguration.findFirst({ where: { tenantId: context.tenantId, locationId: location.id }, include: { areaUse: { select: { useRef: true } } } });
    if ((current?.version ?? 0) !== input.expectedVersion) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", 409);
    const areaUse = input.areaUseRef ? await tx.warehouseAreaUse.findFirst({ where: { tenantId: context.tenantId, useRef: input.areaUseRef } }) : null;
    if (input.areaUseRef && !areaUse) warehouseConfigurationFail("WAREHOUSE_AREA_USE_NOT_FOUND", 404);
    if (areaUse && areaUse.status !== "ACTIVE" && current?.areaUseId !== areaUse.id) warehouseConfigurationFail("WAREHOUSE_AREA_USE_INACTIVE", 409);
    const controlsChanged = (current?.operationalStatus ?? "ACTIVE") !== input.operationalStatus || (current?.availabilityRule ?? "CONDITION_BASED") !== input.availabilityRule;
    if (controlsChanged) {
      if (!input.changeReason || !input.acknowledgeImpact) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_IMPACT_ACK_REQUIRED", 409);
      const locations = await tx.materialLocation.findMany({ where: { tenantId: context.tenantId, warehouseId: location.warehouseId }, select: { id: true, parentLocationId: true } });
      await assertNoActiveCommitments(tx, context, descendantLocationIds(locations, location.id));
    }
    const policiesBefore = await loadWarehouseLocationPolicies(tx, context.tenantId, { locationIds: [location.id] });
    const before = publicLocationConfiguration(location, current, policiesBefore.get(location.id));
    const data = { areaUseId: areaUse?.id ?? null, characteristics: input.characteristics, notes: input.notes, operationalStatus: input.operationalStatus, availabilityRule: input.availabilityRule, controlReason: controlsChanged ? input.changeReason : current?.controlReason ?? null };
    if (current) {
      const changed = await tx.warehouseLocationConfiguration.updateMany({ where: { tenantId: context.tenantId, id: current.id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (changed.count !== 1) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_VERSION_CONFLICT", 409);
    } else await tx.warehouseLocationConfiguration.create({ data: { ...data, tenantId: context.tenantId, locationId: location.id } });
    const row = await tx.warehouseLocationConfiguration.findFirst({ where: { tenantId: context.tenantId, locationId: location.id }, include: { areaUse: { select: { useRef: true } } } });
    const policies = await loadWarehouseLocationPolicies(tx, context.tenantId, { locationIds: [location.id] });
    return persist(tx, context, input, location.locationRef, "WarehouseLocationConfiguration", before, publicLocationConfiguration(location, row, policies.get(location.id)));
  });
}
