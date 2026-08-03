import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { sanitizeCommercialAuditJson } from "./commercialAuditLog.js";
import { canonicalJson, sha256 } from "./geoNormalization.js";
import { LogisticsGeoError, requiredText } from "./logisticsGeoSupport.js";
import { insertVehicle } from "./vehicleFleet.js";
import { normalizeVehicleInput, vehicleIdentityCandidates } from "./vehicleNormalization.js";
import { VEHICLE_PERMISSIONS, auditVehicle, resolveVehicleActor, serializable } from "./vehicleEngineSupport.js";

const MAX_ITEMS = 500;
const MAX_BYTES = 1024 * 1024;

function assertExport(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new LogisticsGeoError("Exportación inválida.", { code: "VEHICLE_IMPORT_INVALID", status: 400 });
  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  if (!vehicles.length || vehicles.length > MAX_ITEMS) throw new LogisticsGeoError(`La exportación debe contener entre 1 y ${MAX_ITEMS} vehículos.`, { code: "VEHICLE_IMPORT_LIMIT", status: 400 });
  const sanitized = sanitizeCommercialAuditJson(payload);
  const bytes = Buffer.byteLength(JSON.stringify(sanitized), "utf8");
  if (bytes > MAX_BYTES) throw new LogisticsGeoError("La exportación excede 1 MiB.", { code: "VEHICLE_IMPORT_LIMIT", status: 413 });
  return { sanitized, vehicles, bytes };
}

async function matchesFor(tx, tenantId, normalized) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${tenantId} AND (
      (${normalized.sourceStableId}::text IS NOT NULL AND "source"=${normalized.source} AND "source_stable_id"=${normalized.sourceStableId}) OR
      (${normalized.normalizedPlate}::text IS NOT NULL AND "normalized_plate"=${normalized.normalizedPlate}) OR
      (${normalized.normalizedVin}::text IS NOT NULL AND "normalized_vin"=${normalized.normalizedVin}) OR
      "normalized_code"=${normalized.normalizedCode}
    )
  `);
  const priority = vehicleIdentityCandidates(normalized);
  const identities = new Map();
  for (const candidate of priority) {
    const found = rows.filter((row) =>
      (candidate.type === "STABLE_ID" && `${row.source}:${row.source_stable_id}` === candidate.value) ||
      (candidate.type === "PLATE" && row.normalized_plate === candidate.value) ||
      (candidate.type === "VIN" && row.normalized_vin === candidate.value) ||
      (candidate.type === "BUSINESS_CODE" && row.normalized_code === candidate.value));
    for (const row of found) identities.set(row.id, { row, matchType: candidate.type });
    if (found.length) break;
  }
  return [...identities.values()];
}

async function buildPreview(tx, actor, payload) {
  const { sanitized, vehicles, bytes } = assertExport(payload);
  const items = [];
  const manifestIdentities = new Map();
  for (let ordinal = 0; ordinal < vehicles.length; ordinal += 1) {
    const source = sanitizeCommercialAuditJson(vehicles[ordinal]);
    try {
      const normalized = normalizeVehicleInput({ ...source, source: payload.source || "BROWSER_LOCAL_STORAGE" });
      const identities = vehicleIdentityCandidates(normalized);
      const repeated = identities.find((candidate) => manifestIdentities.has(`${candidate.type}:${candidate.value}`));
      if (repeated) {
        items.push({ ordinal, status: "CONFLICT", reasonCode: "DUPLICATE_IDENTITY_IN_MANIFEST", source, normalized, matches: [{ ordinal: manifestIdentities.get(`${repeated.type}:${repeated.value}`), matchType: repeated.type }] });
        continue;
      }
      for (const candidate of identities) manifestIdentities.set(`${candidate.type}:${candidate.value}`, ordinal);
      const matches = await matchesFor(tx, actor.tenantId, normalized);
      if (matches.length > 1) {
        items.push({ ordinal, status: "CONFLICT", reasonCode: "IDENTITIES_MATCH_DIFFERENT_VEHICLES", source, normalized, matches: matches.map(({ row, matchType }) => ({ vehicleId: row.id, matchType })) });
      } else if (matches.length === 1) {
        const match = matches[0];
        const samePayload = match.row.payload_hash === normalized.payloadHash;
        items.push({
          ordinal,
          status: samePayload ? "DUPLICATE" : "CONFLICT",
          reasonCode: samePayload ? `MATCH_${match.matchType}` : `MATCH_${match.matchType}_PAYLOAD_DIFFERS`,
          source,
          normalized,
          vehicleId: match.row.id,
        });
      } else {
        items.push({ ordinal, status: "CREATED", reasonCode: "NEW_VEHICLE", source, normalized });
      }
    } catch (error) {
      items.push({ ordinal, status: "INVALID", reasonCode: error?.code || "NORMALIZATION_FAILED", source, message: String(error?.message || error).slice(0, 300) });
    }
  }
  const manifestBase = {
    version: 1, source: String(payload.source || "BROWSER_LOCAL_STORAGE").toUpperCase(), sourceKey: payload.sourceKey || "osi-plus.fleet.vehicles",
    exportedAt: payload.exportedAt || null, bytes, itemCount: items.length,
    sourcePayloadHash: sha256(canonicalJson(sanitized)),
    results: items.map((item) => ({ ordinal: item.ordinal, status: item.status, reasonCode: item.reasonCode, vehicleId: item.vehicleId || null, normalizedCode: item.normalized?.normalizedCode || null })),
  };
  const manifestHash = sha256(canonicalJson(manifestBase));
  return { mode: "DRY_RUN_ONLY", writesPerformed: false, manifest: { ...manifestBase, manifestHash }, items, totals: Object.fromEntries(["CREATED", "DUPLICATE", "CONFLICT", "INVALID"].map((status) => [status, items.filter((item) => item.status === status).length])) };
}

export async function previewVehicleImport(prisma, context, payload) {
  const actor = await resolveVehicleActor(prisma, context, VEHICLE_PERMISSIONS.IMPORT);
  return buildPreview(prisma, actor, payload);
}

export function importVehicleBatch(prisma, context, input, options = {}) {
  const requestId = requiredText(input.requestId, "requestId");
  const batchCode = requiredText(input.batchId || input.batchCode, "batchId", 80);
  return serializable(prisma, async (tx) => {
    const actor = await resolveVehicleActor(tx, context, VEHICLE_PERMISSIONS.IMPORT);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:vehicle-import:${requestId}`}, 0))`);
    const previous = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."vehicle_import_batches" WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} LIMIT 1`);
    const payloadHash = sha256(canonicalJson({ batchCode, manifestHash: input.manifestHash, exportPayload: sanitizeCommercialAuditJson(input.exportPayload) }));
    if (previous[0]) {
      if (previous[0].payload_hash !== payloadHash) throw new LogisticsGeoError("requestId reutilizado con otro lote.", { code: "VEHICLE_IMPORT_IDEMPOTENCY_CONFLICT", status: 409 });
      return { batchId: previous[0].id, batchCode: previous[0].batch_code, status: previous[0].status, idempotent: true };
    }
    const preview = await buildPreview(tx, actor, input.exportPayload);
    if (input.manifestHash !== preview.manifest.manifestHash) throw new LogisticsGeoError("El manifiesto cambió desde la vista previa.", { code: "VEHICLE_IMPORT_MANIFEST_MISMATCH", status: 409 });
    const id = randomUUID();
    const totals = preview.totals;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "osi"."vehicle_import_batches"(
        "id","tenant_id","batch_code","source_kind","source_key","manifest_json","manifest_hash","payload_hash","item_count",
        "created_count","duplicate_count","conflict_count","invalid_count","status","request_id","confirmed_by_user_id","confirmed_by_membership_id","imported_at"
      ) VALUES (
        ${id},${actor.tenantId},${batchCode},${preview.manifest.source},${preview.manifest.sourceKey},CAST(${JSON.stringify(preview.manifest)} AS jsonb),
        ${preview.manifest.manifestHash},${payloadHash},${preview.manifest.itemCount},${totals.CREATED},${totals.DUPLICATE},${totals.CONFLICT},${totals.INVALID},
        'IMPORTED',${requestId},${actor.userId},${actor.membershipId},CURRENT_TIMESTAMP
      )
    `);
    const results = [];
    for (const item of preview.items) {
      const status = item.status;
      let vehicleId = item.vehicleId || null;
      let afterJson = null;
      if (item.status === "CREATED") {
        const created = await insertVehicle(tx, actor, { ...item.source, source: preview.manifest.source, requestId: `${requestId}:${item.ordinal}` }, { importBatchId: id, auditWriter: options.auditWriter });
        vehicleId = created.vehicle.id;
        afterJson = created.vehicle;
      }
      const itemId = randomUUID();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "osi"."vehicle_import_items"(
          "id","tenant_id","batch_id","ordinal","source_stable_id","reconciliation_key","status","reason_code","vehicle_id","source_json","after_json"
        ) VALUES (
          ${itemId},${actor.tenantId},${id},${item.ordinal},${item.normalized?.sourceStableId || null},${item.normalized ? vehicleIdentityCandidates(item.normalized)[0]?.value || null : null},
          CAST(${status} AS "osi"."VehicleImportItemStatus"),${item.reasonCode},${vehicleId},CAST(${JSON.stringify(item.source)} AS jsonb),CAST(${JSON.stringify(afterJson)} AS jsonb)
        )
      `);
      await auditVehicle(tx, actor, { action: status === "CONFLICT" ? "VEHICLE_IMPORT_CONFLICT_DETECTED" : "VEHICLE_IMPORT_ITEM_RECORDED", entity: "VEHICLE_IMPORT_ITEM", entityId: itemId, requestId: `${requestId}:result:${item.ordinal}`, metadataJson: { batchId: id, ordinal: item.ordinal, status, reasonCode: item.reasonCode, vehicleId } }, options.auditWriter);
      results.push({ ordinal: item.ordinal, status, vehicleId, reasonCode: item.reasonCode });
    }
    await auditVehicle(tx, actor, { action: "VEHICLE_IMPORT_BATCH_EXECUTED", entity: "VEHICLE_IMPORT_BATCH", entityId: id, requestId, afterJson: { batchCode, manifestHash: preview.manifest.manifestHash, totals } }, options.auditWriter);
    return { batchId: id, batchCode, status: "IMPORTED", idempotent: false, totals, results };
  });
}

export function rollbackVehicleImportBatch(prisma, context, input, options = {}) {
  return serializable(prisma, async (tx) => {
    const actor = await resolveVehicleActor(tx, context, VEHICLE_PERMISSIONS.IMPORT);
    const batchId = requiredText(input.batchId, "batchId");
    const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."vehicle_import_batches" WHERE "tenant_id"=${actor.tenantId} AND "id"=${batchId} FOR UPDATE`);
    const batch = rows[0];
    if (!batch) throw new LogisticsGeoError("Lote no encontrado.", { code: "VEHICLE_IMPORT_NOT_FOUND", status: 404 });
    if (batch.status === "ROLLED_BACK") return { batchId, status: "ROLLED_BACK", idempotent: true };
    if (batch.status !== "IMPORTED") throw new LogisticsGeoError("El lote no puede revertirse.", { code: "VEHICLE_IMPORT_STATE_INVALID", status: 409 });
    const vehicles = await tx.$queryRaw(Prisma.sql`SELECT * FROM "osi"."osi_vehicles" WHERE "tenant_id"=${actor.tenantId} AND "import_batch_id"=${batchId} FOR UPDATE`);
    if (vehicles.some((vehicle) => vehicle.calculation_locked_at || Number(vehicle.row_version) !== 1)) throw new LogisticsGeoError("El lote tiene dependencias o cambios posteriores.", { code: "VEHICLE_IMPORT_HAS_DEPENDENCIES", status: 409 });
    for (const vehicle of vehicles) {
      await tx.$executeRaw(Prisma.sql`UPDATE "osi"."osi_vehicles" SET "operational_status"='RETIRED',"available_for_calculation"=false,"retired_at"=CURRENT_TIMESTAMP,"row_version"=2,"updated_at"=CURRENT_TIMESTAMP WHERE "tenant_id"=${actor.tenantId} AND "id"=${vehicle.id}`);
      await auditVehicle(tx, actor, { action: "VEHICLE_IMPORT_ITEM_ROLLED_BACK", entity: "VEHICLE", entityId: vehicle.id, requestId: `${requiredText(input.requestId, "requestId")}:${vehicle.id}`, metadataJson: { batchId } }, options.auditWriter);
    }
    await tx.$executeRaw(Prisma.sql`UPDATE "osi"."vehicle_import_items" SET "status"='ROLLED_BACK' WHERE "tenant_id"=${actor.tenantId} AND "batch_id"=${batchId} AND "status"='CREATED'`);
    await tx.$executeRaw(Prisma.sql`UPDATE "osi"."vehicle_import_batches" SET "status"='ROLLED_BACK',"rolled_back_by_user_id"=${actor.userId},"rolled_back_by_membership_id"=${actor.membershipId},"rolled_back_at"=CURRENT_TIMESTAMP,"row_version"="row_version"+1,"updated_at"=CURRENT_TIMESTAMP WHERE "tenant_id"=${actor.tenantId} AND "id"=${batchId}`);
    await auditVehicle(tx, actor, { action: "VEHICLE_IMPORT_BATCH_ROLLED_BACK", entity: "VEHICLE_IMPORT_BATCH", entityId: batchId, requestId: requiredText(input.requestId, "requestId"), metadataJson: { retiredVehicleCount: vehicles.length } }, options.auditWriter);
    return { batchId, status: "ROLLED_BACK", retiredVehicleCount: vehicles.length, idempotent: false };
  });
}

export const __vehicleImportInternals = Object.freeze({ assertExport, buildPreview });
