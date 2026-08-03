import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { LogisticsGeoError, requiredText } from "./logisticsGeoSupport.js";
import { normalizeVehicleInput } from "./vehicleNormalization.js";
import { VEHICLE_PERMISSIONS, auditVehicle, resolveVehicleActor, serializable } from "./vehicleEngineSupport.js";

const MAX_PAGE_SIZE = 100;

function dto(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, businessCode: row.business_code, normalizedCode: row.normalized_code,
    plate: row.plate, normalizedPlate: row.normalized_plate, vin: row.vin, normalizedVin: row.normalized_vin,
    sourceStableId: row.source_stable_id, vehicleType: row.vehicle_type, brand: row.brand, model: row.model,
    modelYear: row.model_year, capacityWeight: row.capacity_weight == null ? null : Number(row.capacity_weight),
    capacityVolume: row.capacity_volume == null ? null : Number(row.capacity_volume),
    usableLength: row.usable_length == null ? null : Number(row.usable_length), usableWidth: row.usable_width == null ? null : Number(row.usable_width),
    usableHeight: row.usable_height == null ? null : Number(row.usable_height), weightUnit: row.weight_unit, volumeUnit: row.volume_unit,
    dimensionUnit: row.dimension_unit, operationalStatus: row.operational_status, availableForCalculation: row.available_for_calculation,
    effectiveFrom: row.effective_from, effectiveTo: row.effective_to, hubCode: row.hub_code, source: row.source,
    importBatchId: row.import_batch_id, calculationLockedAt: row.calculation_locked_at, retiredAt: row.retired_at,
    rowVersion: row.row_version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function isUnique(error) {
  return error?.code === "P2010" && String(error?.meta?.code || "") === "23505";
}

async function findRequest(tx, tenantId, requestId) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${tenantId} AND "request_id"=${requestId} LIMIT 1`);
  return rows[0] || null;
}

export async function insertVehicle(tx, actor, input, { importBatchId = null, auditWriter } = {}) {
  const normalized = normalizeVehicleInput(input);
  const requestId = requiredText(input.requestId, "requestId", 191);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:vehicle:${requestId}`}, 0))`);
  const existing = await findRequest(tx, actor.tenantId, requestId);
  if (existing) {
    if (existing.payload_hash !== normalized.payloadHash) throw new LogisticsGeoError("requestId reutilizado con otro vehículo.", { code: "VEHICLE_IDEMPOTENCY_CONFLICT", status: 409 });
    return { vehicle: dto(existing), idempotent: true };
  }
  const id = randomUUID();
  try {
    const rows = await tx.$queryRaw(Prisma.sql`
      INSERT INTO "osi"."osi_vehicles"(
        "id","tenant_id","business_code","normalized_code","plate","normalized_plate","vin","normalized_vin","source_stable_id",
        "vehicle_type","brand","model","model_year","capacity_weight","capacity_volume","usable_length","usable_width","usable_height",
        "weight_unit","volume_unit","dimension_unit","operational_status","available_for_calculation","effective_from","effective_to","hub_code",
        "source","import_batch_id","request_id","payload_hash","created_by_user_id","created_by_membership_id"
      ) VALUES (
        ${id},${actor.tenantId},${normalized.businessCode},${normalized.normalizedCode},${normalized.plate},${normalized.normalizedPlate},${normalized.vin},${normalized.normalizedVin},${normalized.sourceStableId},
        ${normalized.vehicleType},${normalized.brand},${normalized.model},${normalized.modelYear},${normalized.capacityWeight},${normalized.capacityVolume},${normalized.usableLength},${normalized.usableWidth},${normalized.usableHeight},
        ${normalized.weightUnit},${normalized.volumeUnit},${normalized.dimensionUnit},CAST(${normalized.operationalStatus} AS "osi"."VehicleOperationalStatus"),${normalized.availableForCalculation},COALESCE(${normalized.effectiveFrom},CURRENT_TIMESTAMP),${normalized.effectiveTo},${normalized.hubCode},
        ${normalized.source},${importBatchId},${requestId},${normalized.payloadHash},${actor.userId},${actor.membershipId}
      ) RETURNING *
    `);
    await auditVehicle(tx, actor, {
      action: importBatchId ? "VEHICLE_IMPORTED" : "VEHICLE_CREATED", entity: "VEHICLE", entityId: id, requestId,
      afterJson: dto(rows[0]), metadataJson: { importBatchId, identity: { normalizedCode: normalized.normalizedCode, normalizedPlate: normalized.normalizedPlate, normalizedVin: normalized.normalizedVin } },
    }, auditWriter);
    return { vehicle: dto(rows[0]), idempotent: false };
  } catch (error) {
    if (isUnique(error)) throw new LogisticsGeoError("Código, matrícula, VIN o identificador ya existe en esta empresa.", { code: "VEHICLE_DUPLICATE", status: 409, cause: error });
    throw error;
  }
}

export function createVehicle(prisma, context, input, options = {}) {
  // READ COMMITTED lets the post-lock lookup observe the transaction that just released this requestId lock.
  return prisma.$transaction(async (tx) => {
    const actor = await resolveVehicleActor(tx, context, VEHICLE_PERMISSIONS.MANAGE);
    return insertVehicle(tx, actor, input, options);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function listVehicles(prisma, context, filters = {}) {
  const actor = await resolveVehicleActor(prisma, context, VEHICLE_PERMISSIONS.VIEW, { allowSystem: true });
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(filters.limit || 50)));
  const cursor = filters.cursor ? String(filters.cursor) : null;
  const status = filters.operationalStatus ? String(filters.operationalStatus).toUpperCase() : null;
  const available = filters.availableForCalculation == null ? null : filters.availableForCalculation === true;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."osi_vehicles"
    WHERE "tenant_id"=${actor.tenantId}
      AND (${cursor}::text IS NULL OR "id" > ${cursor})
      AND (${status}::text IS NULL OR "operational_status"::text=${status})
      AND (${available}::boolean IS NULL OR "available_for_calculation"=${available})
    ORDER BY "id" ASC LIMIT ${limit + 1}
  `);
  return { items: rows.slice(0, limit).map(dto), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}

export async function getVehicle(prisma, context, id) {
  const actor = await resolveVehicleActor(prisma, context, VEHICLE_PERMISSIONS.VIEW, { allowSystem: true });
  const rows = await prisma.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId} AND "id"=${requiredText(id, "id")} LIMIT 1`);
  if (!rows[0]) throw new LogisticsGeoError("Vehículo no encontrado.", { code: "VEHICLE_NOT_FOUND", status: 404 });
  return dto(rows[0]);
}

export function changeVehicleStatus(prisma, context, input, options = {}) {
  return serializable(prisma, async (tx) => {
    const actor = await resolveVehicleActor(tx, context, VEHICLE_PERMISSIONS.STATUS);
    const id = requiredText(input.id, "id");
    const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} FOR UPDATE`);
    const current = rows[0];
    if (!current) throw new LogisticsGeoError("Vehículo no encontrado.", { code: "VEHICLE_NOT_FOUND", status: 404 });
    if (Number(current.row_version) !== Number(input.expectedVersion)) throw new LogisticsGeoError("El vehículo cambió; vuelva a cargar.", { code: "VEHICLE_VERSION_CONFLICT", status: 409 });
    const status = String(input.operationalStatus || "").toUpperCase();
    if (!["AVAILABLE", "IN_USE", "UNAVAILABLE", "RETIRED"].includes(status)) throw new LogisticsGeoError("Estado inválido.", { code: "VEHICLE_INPUT_INVALID", status: 400 });
    const available = input.availableForCalculation === true && ["AVAILABLE", "IN_USE"].includes(status);
    const requestId = requiredText(input.requestId, "requestId");
    const updated = await tx.$queryRaw(Prisma.sql`
      UPDATE "osi"."osi_vehicles" SET "operational_status"=CAST(${status} AS "osi"."VehicleOperationalStatus"),
        "available_for_calculation"=${available},"retired_at"=CASE WHEN ${status}='RETIRED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        "row_version"="row_version"+1,"updated_at"=CURRENT_TIMESTAMP WHERE "tenant_id"=${actor.tenantId} AND "id"=${id} RETURNING *
    `);
    await auditVehicle(tx, actor, { action: "VEHICLE_STATUS_CHANGED", entity: "VEHICLE", entityId: id, requestId, beforeJson: dto(current), afterJson: dto(updated[0]) }, options.auditWriter);
    return dto(updated[0]);
  });
}

export const __vehicleFleetInternals = Object.freeze({ dto });
