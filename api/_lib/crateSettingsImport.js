import { Prisma } from "@prisma/client";
import { sanitizeCommercialAuditJson } from "./commercialAuditLog.js";
import { canonicalJson, sha256 } from "./geoNormalization.js";
import { LogisticsGeoError, requiredText } from "./logisticsGeoSupport.js";
import { normalizeCrateSettingsInput } from "./crateSettingsValidation.js";
import { insertCrateSettingsDraft } from "./crateSettingsVersioned.js";
import { CRATE_SETTINGS_PERMISSIONS, auditCrateSettings, resolveCrateSettingsActor, serializable } from "./crateSettingsSupport.js";

const MAX_ITEMS = 30;
const MAX_BYTES = 1024 * 1024;

function error(message, code, status = 400) {
  return new LogisticsGeoError(message, { code, status });
}

function assertExport(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw error("Exportación inválida.", "CRATE_IMPORT_INVALID");
  const settings = Array.isArray(payload.settings) ? payload.settings : [];
  if (!settings.length || settings.length > MAX_ITEMS) throw error(`La exportación debe contener entre 1 y ${MAX_ITEMS} configuraciones.`, "CRATE_IMPORT_LIMIT");
  const sanitized = sanitizeCommercialAuditJson(payload);
  const bytes = Buffer.byteLength(JSON.stringify(sanitized), "utf8");
  if (bytes > MAX_BYTES) throw error("La exportación excede 1 MiB.", "CRATE_IMPORT_LIMIT", 413);
  return { sanitized, settings, bytes };
}

function fromLegacy(source, payload) {
  if (source.technical && source.economic) return source;
  const currencyCode = source.currencyCode || payload.currencyCode;
  const symbolic = source?.pricing?.unitCosts?.currency;
  if (!currencyCode) {
    throw error(symbolic ? `La moneda heredada ${symbolic} no es un código ISO inequívoco.` : "La moneda ISO no fue exportada.", "CRATE_IMPORT_CURRENCY_AMBIGUOUS");
  }
  const { meta: _meta, pricing, adders, ...technical } = source;
  const { currency: _symbol, ...unitCosts } = pricing?.unitCosts || {};
  return {
    ...payload.defaults,
    ...source,
    technical: {
      materials: technical.materials,
      nesting: technical.nesting,
      protectionByFragility: technical.protectionByFragility,
      engineering: technical.engineering,
    },
    economic: { pricing: { ...pricing, unitCosts }, adders },
    units: source.units || payload.units,
    currencyCode,
  };
}

async function buildPreview(db, actor, payload) {
  const { sanitized, settings, bytes } = assertExport(payload);
  const items = [];
  const manifestHashes = new Map();
  for (let ordinal = 0; ordinal < settings.length; ordinal += 1) {
    const source = sanitizeCommercialAuditJson(settings[ordinal]);
    try {
      const normalized = normalizeCrateSettingsInput(fromLegacy(source, payload));
      if (manifestHashes.has(normalized.configurationHash)) {
        items.push({ ordinal, status: "DUPLICATE", reasonCode: "DUPLICATE_IN_MANIFEST", duplicateOf: manifestHashes.get(normalized.configurationHash), normalized });
        continue;
      }
      manifestHashes.set(normalized.configurationHash, ordinal);
      const sameHash = await db.$queryRaw(Prisma.sql`SELECT "id" FROM "osi"."crate_settings_versions" WHERE "tenant_id"=${actor.tenantId} AND "configuration_hash"=${normalized.configurationHash} LIMIT 1`);
      if (sameHash[0]) {
        items.push({ ordinal, status: "DUPLICATE", reasonCode: "CONFIGURATION_HASH_EXISTS", settingsId: sameHash[0].id, normalized });
        continue;
      }
      const sameCode = await db.$queryRaw(Prisma.sql`SELECT "id","configuration_hash" FROM "osi"."crate_settings_versions" WHERE "tenant_id"=${actor.tenantId} AND "normalized_code"=${normalized.normalizedCode} AND "state" IN ('SHADOW','ACTIVE') LIMIT 1`);
      if (sameCode[0]) {
        items.push({ ordinal, status: "CONFLICT", reasonCode: "ACTIVE_CODE_DIFFERS", settingsId: sameCode[0].id, normalized });
        continue;
      }
      items.push({ ordinal, status: "CONVERTIBLE", reasonCode: "VALIDATED_NEW_DRAFT", normalized });
    } catch (cause) {
      const causeCode = String(cause?.code || "CRATE_IMPORT_INVALID");
      const status = causeCode.includes("AMBIGUOUS") ? "AMBIGUOUS" : "INCOMPLETE";
      items.push({ ordinal, status, reasonCode: causeCode, message: String(cause?.message || cause).slice(0, 300) });
    }
  }
  const results = items.map((item) => ({ ordinal: item.ordinal, status: item.status, reasonCode: item.reasonCode, settingsId: item.settingsId || null, configurationHash: item.normalized?.configurationHash || null }));
  const manifestBase = {
    version: 1, source: String(payload.source || "BROWSER_EXPORT").toUpperCase(), sourceKey: payload.sourceKey || "osi-plus.crateSettings",
    exportedAt: payload.exportedAt || null, bytes, itemCount: settings.length, sourcePayloadHash: sha256(canonicalJson(sanitized)), results,
  };
  const manifestHash = sha256(canonicalJson(manifestBase));
  const statuses = ["CONVERTIBLE", "DUPLICATE", "CONFLICT", "AMBIGUOUS", "INCOMPLETE"];
  return {
    mode: "DRY_RUN_ONLY", writesPerformed: false, manifest: { ...manifestBase, manifestHash }, items,
    totals: Object.fromEntries(statuses.map((status) => [status, items.filter((item) => item.status === status).length])),
  };
}

export async function previewCrateSettingsImport(prisma, context, payload) {
  const actor = await resolveCrateSettingsActor(prisma, context, CRATE_SETTINGS_PERMISSIONS.IMPORT);
  return buildPreview(prisma, actor, payload);
}

export function importCrateSettingsBatch(prisma, context, input, options = {}) {
  const requestId = requiredText(input.requestId, "requestId", 191);
  return serializable(prisma, async (tx) => {
    const actor = await resolveCrateSettingsActor(tx, context, CRATE_SETTINGS_PERMISSIONS.IMPORT);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:crate-import:${requestId}`}, 0))`);
    const previous = await tx.$queryRaw(Prisma.sql`
      SELECT "entity_id","metadata_json" FROM "osi"."commercial_audit_logs"
      WHERE "tenant_id"=${actor.tenantId} AND "request_id"=${requestId} AND "action"='CRATE_SETTINGS_IMPORT_COMPLETED'
        AND "entity"='CRATE_SETTINGS_IMPORT' LIMIT 1
    `);
    const payloadHash = sha256(canonicalJson({ manifestHash: input.manifestHash, exportPayload: sanitizeCommercialAuditJson(input.exportPayload) }));
    if (previous[0]) {
      if (previous[0].metadata_json?.payloadHash !== payloadHash) throw error("requestId reutilizado con otro lote.", "CRATE_IMPORT_IDEMPOTENCY_CONFLICT", 409);
      return { importId: previous[0].entity_id, idempotent: true, ...previous[0].metadata_json?.result };
    }
    const preview = await buildPreview(tx, actor, input.exportPayload);
    if (preview.manifest.manifestHash !== input.manifestHash) throw error("El manifiesto cambió desde la vista previa.", "CRATE_IMPORT_MANIFEST_MISMATCH", 409);
    const rejected = preview.items.filter((item) => ["CONFLICT", "AMBIGUOUS", "INCOMPLETE"].includes(item.status));
    if (rejected.length) {
      const importId = `rejected:${preview.manifest.manifestHash}`;
      await auditCrateSettings(tx, actor, {
        action: "CRATE_SETTINGS_IMPORT_REJECTED", entity: "CRATE_SETTINGS_IMPORT", entityId: importId, requestId,
        metadataJson: { payloadHash, manifestHash: preview.manifest.manifestHash, totals: preview.totals },
      }, options.auditWriter);
      return { rejected: error("La importación contiene configuraciones ambiguas, incompletas o contradictorias.", "CRATE_IMPORT_REJECTED", 409) };
    }
    const created = [];
    for (const item of preview.items.filter((entry) => entry.status === "CONVERTIBLE")) {
      const result = await insertCrateSettingsDraft(tx, actor, item.normalized, { requestId: `${requestId}:${item.ordinal}` }, { ...options, context });
      created.push(result.settings.id);
    }
    const importId = preview.manifest.manifestHash;
    const result = { createdIds: created, duplicateCount: preview.totals.DUPLICATE, manifestHash: preview.manifest.manifestHash };
    await auditCrateSettings(tx, actor, {
      action: "CRATE_SETTINGS_IMPORT_COMPLETED", entity: "CRATE_SETTINGS_IMPORT", entityId: importId, requestId,
      metadataJson: { payloadHash, result },
    }, options.auditWriter);
    return { importId, idempotent: false, ...result };
  }).then((result) => { if (result?.rejected) throw result.rejected; return result; });
}

export const __crateImportInternals = Object.freeze({ MAX_ITEMS, MAX_BYTES, assertExport, fromLegacy, buildPreview });
