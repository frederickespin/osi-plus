import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendCommercialAudit } from "./commercialAuditLog.js";
import { requiredAdminText } from "./adminMembershipDomain.js";
import { authorizeFleetContext, revalidateFleetActor } from "./fleetActor.js";
import {
  ADMIN_FLEET_EDITABLE_FIELDS, ADMIN_FLEET_TECHNICAL_FIELDS, adminFleetEditableDto, adminFleetVehicleDto,
  adminFleetVehicleRef, applyCalculatedFleetVolume, fleetFail, fleetTypeNameKey, normalizeAdminFleetVehicle, parseAdminFleetCreate, parseAdminFleetFilters, parseAdminFleetPatch, parseFleetTypeCreate, parseFleetTypeUpdate,
} from "./adminFleetContract.js";
import { transportFleetOptions } from "./logisticsTransportZones.js";
import { loadContainerVolumeTypes } from "./vehicleFleet.js";

const SOURCE = "V17_ADMINISTRATION_FLEET_19D";
const LOAD_VOLUME_FIELDS = ["capacityVolume", "usableLength", "usableWidth", "usableHeight"];
function authorizeContext(context, write = false) {
  authorizeFleetContext(context, { write });
}
async function actorFor(tx, context, write = false) {
  return revalidateFleetActor(tx, context, { write });
}
function sqlState(error) { return String(error?.meta?.code || error?.cause?.code || ""); }
export async function adminFleetTransaction(prisma, work, { retryUnique = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
    } catch (error) {
      const confirmedRollback = error?.code === "P2034" || ["40001", "40P01"].includes(sqlState(error));
      const uniqueRollback = error?.code === "P2002" || sqlState(error) === "23505";
      // Only creation retries a confirmed unique rollback: a fresh snapshot resolves a racing POST
      // against its preserved creation fingerprint. Connection/commit uncertainty is never replayed.
      if ((confirmedRollback || (retryUnique && uniqueRollback)) && attempt < 2) continue;
      if (confirmedRollback) fleetFail("VERSION_CONFLICT", 409);
      if (uniqueRollback) fleetFail("DUPLICATE", 409);
      throw error;
    }
  }
}
async function lockTenant(tx, context) {
  const tenantId = requiredAdminText(context?.tenantId, "tenantId");
  // Match administration19B lock order. Keep actor and tenant authority locked through audit/commit.
  const rows = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."tenants" WHERE "id"=${tenantId} FOR UPDATE`);
  if (rows.length !== 1) fleetFail("FORBIDDEN", 403);
}

async function fleetOptions(tx, tenantId) {
  const [savedTypes, usedTypes, transport] = await Promise.all([
    tx.fleetVehicleType.findMany({ where: { tenantId }, select: { name: true, variableVolume: true } }),
    tx.vehicle.findMany({ where: { tenant_id: tenantId }, distinct: ["vehicle_type"], select: { vehicle_type: true } }),
    transportFleetOptions(tx, tenantId),
  ]);
  const vehicleTypes = new Map(savedTypes.map((type) => [type.name, { ...type, registered: true }]));
  for (const name of [...usedTypes.map((row) => row.vehicle_type), ...transport.types]) {
    if (!vehicleTypes.has(name)) vehicleTypes.set(name, { name, variableVolume: false, registered: false });
  }
  return { types: [...vehicleTypes.values()].sort((a, b) => a.name.localeCompare(b.name, "es")), bases: transport.bases };
}

export async function listAdminFleetOptions(prisma, context) {
  authorizeContext(context);
  return adminFleetTransaction(prisma, async (tx) => fleetOptions(tx, (await actorFor(tx, context)).tenantId));
}

export async function createAdminFleetType(prisma, context, input, { auditWriter = appendCommercialAudit } = {}) {
  authorizeContext(context, true);
  const { requestId, name, normalizedName, variableVolume } = parseFleetTypeCreate(input);
  return adminFleetTransaction(prisma, async (tx) => {
    await lockTenant(tx, context);
    const { tenantId, membershipId } = await actorFor(tx, context, true);
    const previous = await tx.fleetVehicleType.findUnique({ where: { tenantId_requestId: { tenantId, requestId } } });
    if (previous) {
      const receipt = await tx.commercialAuditLog.findFirst({
        where: { tenant_id: tenantId, source: SOURCE, request_id: requestId, action: "ADMIN_FLEET_TYPE_CREATED", entityId: previous.id },
        select: { after_json: true },
      });
      if (previous.normalizedName !== normalizedName || receipt?.after_json?.variableVolume !== variableVolume) fleetFail("REQUEST_CONFLICT", 409);
      return { type: { name: previous.name, variableVolume, registered: true }, created: false };
    }
    if (await tx.fleetVehicleType.findUnique({ where: { tenantId_normalizedName: { tenantId, normalizedName } } })) fleetFail("TYPE_DUPLICATE", 409);
    // Keep the exact name already used by a vehicle or tariff so its profile
    // continues to match when that type is registered in the catalog.
    const { types } = await fleetOptions(tx, tenantId);
    const canonicalName = types.find((type) => type.name === name)?.name
      ?? types.find((type) => fleetTypeNameKey(type.name) === normalizedName)?.name ?? name;
    await assertUnusedRequest(tx, { tenantId }, requestId);
    const { id } = await tx.fleetVehicleType.create({ data: { id: randomUUID(), tenantId, name: canonicalName, normalizedName, variableVolume, requestId } });
    await auditWriter(tx, { tenantId, actorKind: "MEMBERSHIP", actorMembershipId: membershipId }, {
      requestId, correlationId: requestId, source: SOURCE, entity: "FLEET_VEHICLE_TYPE", entityId: id,
      action: "ADMIN_FLEET_TYPE_CREATED", critical: true, afterJson: { name: canonicalName, variableVolume },
    });
    return { type: { name: canonicalName, variableVolume, registered: true }, created: true };
  }, { retryUnique: true });
}

export async function updateAdminFleetType(prisma, context, input, { auditWriter = appendCommercialAudit } = {}) {
  authorizeContext(context, true);
  const { requestId, normalizedName, variableVolume, expectedVariableVolume } = parseFleetTypeUpdate(input);
  return adminFleetTransaction(prisma, async (tx) => {
    await lockTenant(tx, context);
    const actor = await actorFor(tx, context, true);
    const { tenantId, membershipId } = actor;
    const saved = await tx.fleetVehicleType.findUnique({ where: { tenantId_normalizedName: { tenantId, normalizedName } } });
    if (!saved) fleetFail("TYPE_NOT_REGISTERED", 404);
    const type = { name: saved.name, variableVolume, registered: true };
    const receipt = await tx.commercialAuditLog.findFirst({
      where: { tenant_id: tenantId, source: SOURCE, request_id: requestId },
      select: { action: true, entityId: true, before_json: true, after_json: true },
    });
    if (receipt) {
      if (receipt.action !== "ADMIN_FLEET_TYPE_UPDATED" || receipt.entityId !== saved.id
        || receipt.before_json?.variableVolume !== expectedVariableVolume || receipt.after_json?.variableVolume !== variableVolume) {
        fleetFail("REQUEST_CONFLICT", 409);
      }
      if (saved.variableVolume !== variableVolume) fleetFail("TYPE_VERSION_CONFLICT", 409);
      return { type };
    }
    if (saved.variableVolume !== expectedVariableVolume) fleetFail("TYPE_VERSION_CONFLICT", 409);
    if (saved.variableVolume === variableVolume) return { type };
    await assertUnusedRequest(tx, actor, requestId);
    await tx.fleetVehicleType.update({ where: { id: saved.id }, data: { variableVolume } });
    await auditWriter(tx, { tenantId, actorKind: "MEMBERSHIP", actorMembershipId: membershipId }, {
      requestId, correlationId: requestId, source: SOURCE, entity: "FLEET_VEHICLE_TYPE", entityId: saved.id,
      action: "ADMIN_FLEET_TYPE_UPDATED", critical: true,
      beforeJson: { name: saved.name, variableVolume: saved.variableVolume },
      afterJson: { name: saved.name, variableVolume },
    });
    return { type };
  });
}

async function validateFleetOptions(tx, tenantId, vehicle, { type, base }) {
  const options = await fleetOptions(tx, tenantId);
  if (type) {
    const selected = options.types.find(({ name }) => name === vehicle.vehicleType);
    if (!selected) fleetFail("TYPE_NOT_REGISTERED");
    if (selected.variableVolume && LOAD_VOLUME_FIELDS.some((field) => vehicle[field] !== null)) {
      fleetFail("VARIABLE_VOLUME");
    }
  }
  if (base && vehicle.hubCode !== null && !options.bases.some(({ code }) => code === vehicle.hubCode)) fleetFail("BASE_NOT_REGISTERED");
}

async function nextVehicleCode(tx, tenantId) {
  const [row] = await tx.$queryRaw(Prisma.sql
    `
    SELECT COALESCE(MAX(substring("normalized_code" from 2)::integer), 0) + 1 AS "next_number"
    FROM "osi"."osi_vehicles"
    WHERE "tenant_id"=${tenantId} AND "normalized_code" ~ '^V[0-9]{3,8}$'
  `);
  if (row.next_number > 99_999_999) fleetFail("CODE_LIMIT", 409);
  return "V" + String(row.next_number).padStart(3, "0");
}
async function vehicleFor(tx, actor, ref, lock = false) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId} AND "id"=${ref}
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  if (rows.length !== 1) fleetFail("NOT_FOUND", 404);
  return rows[0];
}
async function assertUnusedRequest(tx, actor, requestId) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId}
    UNION ALL
    SELECT "id" FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=${actor.tenantId}
      AND "source"=${SOURCE} AND "request_id"=${requestId}
    LIMIT 1
  `);
  if (rows.length) fleetFail("REQUEST_CONFLICT", 409);
}
async function assertUniqueVehicle(tx, actor, vehicle, excludeRef = null) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId}
      AND (${excludeRef}::text IS NULL OR "id"<>${excludeRef})
      AND ("normalized_code"=${vehicle.normalizedCode}
        OR (${vehicle.normalizedPlate}::text IS NOT NULL AND "normalized_plate"=${vehicle.normalizedPlate})
        OR (${vehicle.normalizedVin}::text IS NOT NULL AND "normalized_vin"=${vehicle.normalizedVin}))
    LIMIT 1
  `);
  if (rows.length) fleetFail("DUPLICATE", 409);
}
async function auditFleet(tx, actor, { requestId, action, vehicleRef, changedFields, before, after }, auditWriter) {
  return auditWriter(tx, { tenantId: actor.tenantId, actorKind: "MEMBERSHIP", actorMembershipId: actor.membershipId }, {
    requestId, correlationId: requestId, source: SOURCE, entity: "VEHICLE", entityId: vehicleRef, action, critical: true,
    // The audit keeps actor authority in its canonical columns; no full DTO, VIN, plate or identity is copied into JSON.
    beforeJson: before ? { rowVersion: before.rowVersion, operationalStatus: before.operationalStatus } : null,
    afterJson: { rowVersion: after.rowVersion, operationalStatus: after.operationalStatus },
    metadataJson: { changedFields },
  });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, "\\$&"); }
export async function listAdminFleetVehicles(prisma, context, input = {}) {
  authorizeContext(context);
  const filters = parseAdminFleetFilters(input);
  return adminFleetTransaction(prisma, async (tx) => {
    const actor = await actorFor(tx, context);
    const clauses = [Prisma.sql`"tenant_id"=${actor.tenantId}`];
    if (filters.operationalStatus) clauses.push(Prisma.sql`"operational_status"::text=${filters.operationalStatus}`);
    if (filters.vehicleType) clauses.push(Prisma.sql`"vehicle_type"=${filters.vehicleType}`);
    if (filters.search) {
      const pattern = `%${escapeLike(filters.search)}%`;
      clauses.push(Prisma.sql`("business_code" ILIKE ${pattern} OR "plate" ILIKE ${pattern} OR "vin" ILIKE ${pattern}
        OR "vehicle_type" ILIKE ${pattern} OR "brand" ILIKE ${pattern} OR "model" ILIKE ${pattern})`);
    }
    const counts = await tx.$queryRaw(Prisma.sql`SELECT COUNT(*)::integer AS "total" FROM "osi"."osi_vehicles" WHERE ${Prisma.join(clauses, " AND ")}`);
    const rows = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."osi_vehicles" WHERE ${Prisma.join(clauses, " AND ")}
      ORDER BY "business_code" ASC, "id" ASC LIMIT ${filters.pageSize} OFFSET ${(filters.page - 1) * filters.pageSize}
    `);
    const containerVolumeTypes = await loadContainerVolumeTypes(tx, actor.tenantId, rows);
    return { data: rows.map(adminFleetVehicleDto), containerVolumeTypes, total: Number(counts[0]?.total ?? 0), page: filters.page, pageSize: filters.pageSize };
  });
}
export async function getAdminFleetVehicle(prisma, context, vehicleRef) {
  authorizeContext(context);
  const ref = adminFleetVehicleRef(vehicleRef);
  return adminFleetTransaction(prisma, async (tx) => adminFleetVehicleDto(await vehicleFor(tx, await actorFor(tx, context), ref)));
}
export async function createAdminFleetVehicle(prisma, context, input, { auditWriter = appendCommercialAudit } = {}) {
  authorizeContext(context, true);
  const { requestId, vehicle, automaticCode } = parseAdminFleetCreate(input);
  return adminFleetTransaction(prisma, async (tx) => {
    await lockTenant(tx, context);
    const actor = await actorFor(tx, context, true);
    const existing = await tx.$queryRaw(Prisma.sql`
      SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId}
    `);
    if (existing.length) {
      if (existing.length !== 1 || existing[0].source !== SOURCE || existing[0].payload_hash !== vehicle.payloadHash) fleetFail("REQUEST_CONFLICT", 409);
      // PATCH never overwrites these original creation fingerprints. Return the current authorized representation.
      return { vehicle: adminFleetVehicleDto(existing[0]), created: false, idempotent: true };
    }
    await assertUnusedRequest(tx, actor, requestId);
    if (automaticCode) {
      await validateFleetOptions(tx, actor.tenantId, vehicle, { type: true, base: true });
      vehicle.businessCode = vehicle.normalizedCode = await nextVehicleCode(tx, actor.tenantId);
    } else if (LOAD_VOLUME_FIELDS.some((field) => vehicle[field] !== null)
      && (await loadContainerVolumeTypes(tx, actor.tenantId, [{ vehicle_type: vehicle.vehicleType }])).length) {
      fleetFail("VARIABLE_VOLUME");
    }
    applyCalculatedFleetVolume(vehicle);
    await assertUniqueVehicle(tx, actor, vehicle);
    const effectiveFrom = vehicle.effectiveFrom ?? new Date();
    if (vehicle.effectiveTo && vehicle.effectiveTo <= effectiveFrom) fleetFail("INPUT_INVALID");
    const id = randomUUID();
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."osi_vehicles" (
        "id", "tenant_id", "business_code", "normalized_code", "plate", "normalized_plate", "vin", "normalized_vin",
        "vehicle_type", "brand", "model", "model_year", "capacity_weight", "capacity_volume", "usable_length", "usable_width", "usable_height",
        "weight_unit", "volume_unit", "dimension_unit", "operational_status", "available_for_calculation", "effective_from", "effective_to", "hub_code",
        "source", "request_id", "payload_hash", "created_by_user_id", "created_by_membership_id", "retired_at"
      ) VALUES (
        ${id}, ${actor.tenantId}, ${vehicle.businessCode}, ${vehicle.normalizedCode}, ${vehicle.plate}, ${vehicle.normalizedPlate}, ${vehicle.vin}, ${vehicle.normalizedVin},
        ${vehicle.vehicleType}, ${vehicle.brand}, ${vehicle.model}, ${vehicle.modelYear}, ${vehicle.capacityWeight}, ${vehicle.capacityVolume}, ${vehicle.usableLength}, ${vehicle.usableWidth}, ${vehicle.usableHeight},
        ${vehicle.weightUnit}, ${vehicle.volumeUnit}, ${vehicle.dimensionUnit}, ${vehicle.operationalStatus}::"osi"."VehicleOperationalStatus", ${vehicle.availableForCalculation}, ${effectiveFrom}, ${vehicle.effectiveTo}, ${vehicle.hubCode},
        ${SOURCE}, ${requestId}, ${vehicle.payloadHash}, ${actor.userId}, ${actor.membershipId},
        CASE WHEN ${vehicle.operationalStatus}='RETIRED' THEN CURRENT_TIMESTAMP ELSE NULL END
      ) RETURNING *
    `);
    if (rows.length !== 1) fleetFail("UNAVAILABLE", 503);
    const dto = adminFleetVehicleDto(rows[0]);
    await auditFleet(tx, actor, { requestId, action: "ADMIN_FLEET_CREATED", vehicleRef: dto.vehicleRef, changedFields: [...ADMIN_FLEET_EDITABLE_FIELDS], after: dto }, auditWriter);
    return { vehicle: dto, created: true, idempotent: false };
  }, { retryUnique: true });
}
function comparable(value) { return value instanceof Date ? value.toISOString() : value; }
export async function updateAdminFleetVehicle(prisma, context, vehicleRef, input, { auditWriter = appendCommercialAudit } = {}) {
  authorizeContext(context, true);
  const ref = adminFleetVehicleRef(vehicleRef);
  const { requestId, expectedVersion, changes } = parseAdminFleetPatch(input);
  return adminFleetTransaction(prisma, async (tx) => {
    await lockTenant(tx, context);
    const actor = await actorFor(tx, context, true);
    const beforeRow = await vehicleFor(tx, actor, ref, true);
    if (Number(beforeRow.row_version) !== expectedVersion) fleetFail("VERSION_CONFLICT", 409);
    const before = adminFleetVehicleDto(beforeRow);
    const vehicle = normalizeAdminFleetVehicle({ ...adminFleetEditableDto(before), ...changes }, { source: beforeRow.source, sourceStableId: beforeRow.source_stable_id });
    const differs = (key) => comparable(vehicle[key]) !== before[key];
    const requestedFields = ADMIN_FLEET_EDITABLE_FIELDS.filter(differs);
    // A no-op is not a new mutation: no audit, request claim, timestamp or version bump.
    if (!requestedFields.length) return before;
    // Retirement is terminal in 19D. History remains readable; reactivation is a separate future workflow.
    if (before.operationalStatus === "RETIRED" || before.retiredAt) fleetFail("RETIRED", 409);
    if (before.calculationLocked && requestedFields.some((key) => ADMIN_FLEET_TECHNICAL_FIELDS.includes(key))) fleetFail("CALCULATION_LOCKED", 409);
    const typeChanged = requestedFields.includes("vehicleType");
    const capacityChanged = [...LOAD_VOLUME_FIELDS, "volumeUnit", "dimensionUnit"].some(differs);
    const baseChanged = requestedFields.includes("hubCode") && vehicle.hubCode !== null;
    if (typeChanged || capacityChanged || baseChanged) await validateFleetOptions(tx, actor.tenantId, vehicle, { type: typeChanged || capacityChanged, base: baseChanged });
    if (typeChanged || capacityChanged) applyCalculatedFleetVolume(vehicle);
    const changedFields = ADMIN_FLEET_EDITABLE_FIELDS.filter(differs);
    if (!changedFields.length) return before;
    await assertUnusedRequest(tx, actor, requestId);
    await assertUniqueVehicle(tx, actor, vehicle, ref);
    const rows = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."osi_vehicles" SET
        "business_code"=${vehicle.businessCode}, "normalized_code"=${vehicle.normalizedCode}, "plate"=${vehicle.plate}, "normalized_plate"=${vehicle.normalizedPlate},
        "vin"=${vehicle.vin}, "normalized_vin"=${vehicle.normalizedVin}, "vehicle_type"=${vehicle.vehicleType}, "brand"=${vehicle.brand}, "model"=${vehicle.model}, "model_year"=${vehicle.modelYear},
        "capacity_weight"=${vehicle.capacityWeight}, "capacity_volume"=${vehicle.capacityVolume}, "usable_length"=${vehicle.usableLength}, "usable_width"=${vehicle.usableWidth}, "usable_height"=${vehicle.usableHeight},
        "weight_unit"=${vehicle.weightUnit}, "volume_unit"=${vehicle.volumeUnit}, "dimension_unit"=${vehicle.dimensionUnit},
        "operational_status"=${vehicle.operationalStatus}::"osi"."VehicleOperationalStatus", "available_for_calculation"=${vehicle.availableForCalculation},
        "effective_from"=${vehicle.effectiveFrom}, "effective_to"=${vehicle.effectiveTo}, "hub_code"=${vehicle.hubCode},
        "retired_at"=CASE WHEN ${vehicle.operationalStatus}='RETIRED' THEN COALESCE("retired_at", CURRENT_TIMESTAMP) ELSE "retired_at" END,
        "row_version"="row_version"+1, "updated_at"=CURRENT_TIMESTAMP
      WHERE "tenant_id"=${actor.tenantId} AND "id"=${ref} AND "row_version"=${expectedVersion}
      RETURNING *
    `);
    if (rows.length !== 1) fleetFail("VERSION_CONFLICT", 409);
    const after = adminFleetVehicleDto(rows[0]);
    await auditFleet(tx, actor, { requestId, action: after.operationalStatus === "RETIRED" ? "ADMIN_FLEET_RETIRED" : "ADMIN_FLEET_UPDATED", vehicleRef: ref, changedFields, before, after }, auditWriter);
    return after;
  });
}
