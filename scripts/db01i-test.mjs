/* eslint-disable no-console */
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { evaluateVehicleEngineCompatibility, vehicleEngineIntegrationMode } from "../api/_lib/vehicleEngineAdapter.js";
import {
  activateVehicleEngineSettings, activateVehicleEngineShadow, approveVehicleEngineSettings,
  compareVehicleEngineShadow, createVehicleEngineSettingsVersion,
} from "../api/_lib/vehicleEngineSettings.js";
import { changeVehicleStatus, createVehicle, getVehicle, listVehicles } from "../api/_lib/vehicleFleet.js";
import { importVehicleBatch, previewVehicleImport, rollbackVehicleImportBatch } from "../api/_lib/vehicleImport.js";
import { VEHICLE_PERMISSIONS } from "../api/_lib/vehicleEngineSupport.js";
import { normalizeVehicleCode, normalizeVehiclePlate, normalizeVehicleVin } from "../api/_lib/vehicleNormalization.js";
import { analyzeVehicleSources } from "./db01i-dry-run.mjs";
import { createDb01iPrisma } from "./db01i-lib.mjs";

const prisma = createDb01iPrisma();
const results = [];
const run = Date.now().toString(36);
const upper = run.toUpperCase();
const t1 = `db01i-t1-${run}`;
const t2 = `db01i-t2-${run}`;
const creator = { user: `db01i-u1-${run}`, membership: `db01i-m1-${run}` };
const approver = { user: `db01i-u2-${run}`, membership: `db01i-m2-${run}` };
const limited = { user: `db01i-u3-${run}`, membership: `db01i-m3-${run}` };
const t2Membership = `db01i-m4-${run}`;
const permissions = [...Object.values(VEHICLE_PERMISSIONS), "commercial:audit:view"];
const context = (tenantId, membershipId) => ({ tenantId, actorKind: "MEMBERSHIP", actorMembershipId: membershipId });
const creatorContext = context(t1, creator.membership);
const approverContext = context(t1, approver.membership);
const limitedContext = { ...context(t1, limited.membership), permissions };
const t2Context = context(t2, t2Membership);

function check(name, condition, details) {
  if (!condition) throw new Error(`Falló: ${name}${details ? ` (${details})` : ""}`);
  results.push({ name, passed: true, ...(details ? { details } : {}) });
}

async function expectError(name, work, code) {
  try { await work(); throw new Error(`${name}: operación inválida aceptada`); }
  catch (error) {
    if (String(error?.message).includes("operación inválida aceptada")) throw error;
    check(name, !code || error?.code === code, `code=${error?.code || error?.meta?.code || "DATABASE"}`);
    return error;
  }
}

async function seed() {
  const permissionSql = permissions.map((permission) => `'${permission}'`).join(",");
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_users"("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt") VALUES
      ('${creator.user}','DB01I-C-${run}','Synthetic Creator','${run}.creator@example.invalid','+10000000011','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${approver.user}','DB01I-A-${run}','Synthetic Approver','${run}.approver@example.invalid','+10000000012','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${limited.user}','DB01I-L-${run}','Synthetic Limited','${run}.limited@example.invalid','+10000000013','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenants"("id","code","name","legal_name","status","provisioning_source","updated_at") VALUES
      ('${t1}','DB01I-T1-${upper}','DB-01I Tenant One','Synthetic','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      ('${t2}','DB01I-T2-${upper}','DB-01I Tenant Two','Synthetic','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenant_memberships"("id","tenant_id","user_id","role","status","granted_permissions","is_default","provisioning_source","updated_at") VALUES
      ('${creator.membership}','${t1}','${creator.user}','V','ACTIVE',ARRAY[${permissionSql}],true,'MANUAL',CURRENT_TIMESTAMP),
      ('${approver.membership}','${t1}','${approver.user}','A','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${limited.membership}','${t1}','${limited.user}','V','ACTIVE',ARRAY['${VEHICLE_PERMISSIONS.SETTINGS_MANAGE}'],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${t2Membership}','${t2}','${creator.user}','V','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP)
  `);
}

function vehicle(sequence, extra = {}) {
  return {
    businessCode: `VH-${sequence}-${upper}`, plate: `T-${sequence}-${upper}`, vin: `VIN${sequence}${upper}`,
    vehicleType: "CAMION", brand: "Marca sintética", model: "Modelo", modelYear: 2026,
    capacityWeight: 8000, capacityVolume: 39, weightUnit: "KG", volumeUnit: "CBM", dimensionUnit: "M",
    source: "SYNTHETIC_TEST", sourceStableId: `source-${sequence}-${run}`, requestId: `vehicle-${sequence}-${run}`, ...extra,
  };
}

function settings(sequence, extra = {}) {
  return {
    name: `Configuración ${sequence}`, scopeKey: "GLOBAL", operationMode: "LEGACY_ONLY", capacityUtilizationPercent: 85,
    weightUnit: "KG", volumeUnit: "CBM", distanceUnit: "KM", allowManualOverride: true,
    requireApprovalIfOverride: false, distributeWearAutomatically: true, considerUpcomingMaintenance: true,
    blockIfNoVehicle: false, source: "SYNTHETIC_TEST", requestId: `settings-${sequence}-${run}`, ...extra,
  };
}

try {
  await seed();
  check("integración desactivada por defecto", vehicleEngineIntegrationMode({}) === "LEGACY_ONLY");
  check("normaliza código, matrícula y VIN", normalizeVehicleCode(" vh 01 ") === "VH-01" && normalizeVehiclePlate(" ab-123 cd ") === "AB123CD" && normalizeVehicleVin(" vin-12 34 ") === "VIN1234");

  const firstInput = vehicle("FIRST");
  const [firstA, firstB] = await Promise.all([createVehicle(prisma, creatorContext, firstInput), createVehicle(prisma, creatorContext, firstInput)]);
  check("creación concurrente idempotente", firstA.vehicle.id === firstB.vehicle.id && [firstA.idempotent, firstB.idempotent].includes(true));
  await expectError("requestId distinto payload", () => createVehicle(prisma, creatorContext, { ...firstInput, brand: "Otra" }), "VEHICLE_IDEMPOTENCY_CONFLICT");
  await expectError("RBAC ignora permisos del navegador", () => createVehicle(prisma, limitedContext, vehicle("NOAUTH")), "LOGISTICS_GEO_FORBIDDEN");
  await expectError("matrícula duplicada por tenant", () => createVehicle(prisma, creatorContext, vehicle("PLATE", { plate: firstInput.plate })), "VEHICLE_DUPLICATE");
  await expectError("VIN duplicado por tenant", () => createVehicle(prisma, creatorContext, vehicle("VIN", { vin: firstInput.vin })), "VEHICLE_DUPLICATE");
  const sameDescription = await createVehicle(prisma, creatorContext, vehicle("SAME", { brand: firstInput.brand, model: firstInput.model }));
  check("marca y modelo no infieren duplicado", Boolean(sameDescription.vehicle.id));
  const tenantTwoVehicle = await createVehicle(prisma, t2Context, { ...vehicle("TENANT2"), plate: firstInput.plate, vin: firstInput.vin });
  check("matrícula y VIN pueden repetirse entre empresas", Boolean(tenantTwoVehicle.vehicle.id));
  await expectError("acceso cruzado devuelve 404", () => getVehicle(prisma, t2Context, firstA.vehicle.id), "VEHICLE_NOT_FOUND");
  const retired = await changeVehicleStatus(prisma, creatorContext, { id: sameDescription.vehicle.id, expectedVersion: 1, operationalStatus: "RETIRED", availableForCalculation: true, requestId: `retire-${run}` });
  check("retiro conserva registro y desactiva cálculo", retired.operationalStatus === "RETIRED" && !retired.availableForCalculation && retired.rowVersion === 2);
  await expectError("eliminación física bloqueada", () => prisma.$executeRawUnsafe(`DELETE FROM "osi"."osi_vehicles" WHERE "id"='${retired.id}'`));

  const baseInput = settings("BASE");
  const [baseA, baseB] = await Promise.all([createVehicleEngineSettingsVersion(prisma, creatorContext, baseInput), createVehicleEngineSettingsVersion(prisma, creatorContext, baseInput)]);
  check("configuración concurrente idempotente", baseA.settings.id === baseB.settings.id && [baseA.idempotent, baseB.idempotent].includes(true));
  await expectError("unidades inválidas rechazadas", () => createVehicleEngineSettingsVersion(prisma, creatorContext, settings("UNIT", { weightUnit: "TON" })), "VEHICLE_SETTINGS_INPUT_INVALID");
  await expectError("creador no aprueba configuración", () => approveVehicleEngineSettings(prisma, creatorContext, { id: baseA.settings.id, expectedVersion: 1, requestId: `self-approve-${run}` }), "VEHICLE_SETTINGS_SEPARATION_OF_DUTIES");
  const baseApproved = await approveVehicleEngineSettings(prisma, approverContext, { id: baseA.settings.id, expectedVersion: 1, requestId: `approve-base-${run}` });
  const baseActive = await activateVehicleEngineSettings(prisma, approverContext, { id: baseApproved.settings.id, expectedVersion: 2, requestId: `activate-base-${run}` });
  check("configuración versionada activa y hash", baseActive.settings.state === "ACTIVE" && baseActive.settings.versionHash.length === 64 && baseActive.settings.settingsHash.length === 64);
  await expectError("configuración activa es inmutable", () => prisma.$executeRawUnsafe(`UPDATE "osi"."osi_vehicle_engine_settings" SET "name"='Alterada' WHERE "id"='${baseActive.settings.id}'`));
  await expectError("cambio de modo exige permiso específico", () => createVehicleEngineSettingsVersion(prisma, limitedContext, settings("MODE-DENIED", { replacesSettingsId: baseActive.settings.id, operationMode: "SHADOW" })), "LOGISTICS_GEO_FORBIDDEN");

  const conflicting = await createVehicleEngineSettingsVersion(prisma, creatorContext, settings("CONFLICT", { capacityUtilizationPercent: 88 }));
  const conflictingApproved = await approveVehicleEngineSettings(prisma, approverContext, { id: conflicting.settings.id, expectedVersion: 1, requestId: `approve-conflict-${run}` });
  await expectError("dos activas contradictorias se impiden", () => activateVehicleEngineSettings(prisma, approverContext, { id: conflictingApproved.settings.id, expectedVersion: 2, requestId: `activate-conflict-${run}` }), "VEHICLE_SETTINGS_CONTRADICTION");
  const replacement = await createVehicleEngineSettingsVersion(prisma, creatorContext, settings("REPLACE", { replacesSettingsId: baseActive.settings.id, capacityUtilizationPercent: 87 }));
  const replacementApproved = await approveVehicleEngineSettings(prisma, approverContext, { id: replacement.settings.id, expectedVersion: 1, requestId: `approve-replace-${run}` });
  const replacementActive = await activateVehicleEngineSettings(prisma, approverContext, { id: replacementApproved.settings.id, expectedVersion: 2, requestId: `activate-replace-${run}`, replaceActive: true });
  check("nueva versión reemplaza activa explícitamente", replacementActive.settings.state === "ACTIVE" && replacementActive.settings.version === 2);

  const modeBase = await createVehicleEngineSettingsVersion(prisma, creatorContext, settings("MODE-BASE", { scopeKey: "MODE_TEST" }));
  const modeChanged = await createVehicleEngineSettingsVersion(prisma, creatorContext, settings("MODE-CHANGE", { scopeKey: "MODE_TEST", operationMode: "SHADOW", replacesSettingsId: modeBase.settings.id }));
  check("cambio de modo crea versión auditada", modeChanged.settings.version === 2 && modeChanged.settings.operationMode === "SHADOW");

  const shadowDraft = await createVehicleEngineSettingsVersion(prisma, creatorContext, settings("SHADOW", { scopeKey: "SHADOW_TEST", operationMode: "SHADOW" }));
  const shadowApproved = await approveVehicleEngineSettings(prisma, approverContext, { id: shadowDraft.settings.id, expectedVersion: 1, requestId: `approve-shadow-${run}` });
  await expectError("activación SHADOW deshabilitada", () => activateVehicleEngineShadow(prisma, approverContext, { id: shadowApproved.settings.id, expectedVersion: 2, requestId: `activate-shadow-${run}` }), "VEHICLE_ENGINE_SHADOW_DISABLED");
  const enforcedDraft = await createVehicleEngineSettingsVersion(prisma, creatorContext, settings("ENFORCED", { scopeKey: "ENFORCED_TEST", operationMode: "ENFORCED" }));
  const enforcedApproved = await approveVehicleEngineSettings(prisma, approverContext, { id: enforcedDraft.settings.id, expectedVersion: 1, requestId: `approve-enforced-${run}` });
  await expectError("ENFORCED deshabilitado", () => activateVehicleEngineSettings(prisma, approverContext, { id: enforcedApproved.settings.id, expectedVersion: 2, requestId: `activate-enforced-${run}` }), "VEHICLE_ENGINE_ENFORCED_DISABLED");
  const shadowComparison = compareVehicleEngineShadow({ blockIfNoVehicle: false, capacityUtilizationPercent: 100 }, { blockIfNoVehicle: true, capacityUtilizationPercent: 85 });
  const adapter = await evaluateVehicleEngineCompatibility({ mode: "SHADOW", legacyEvaluate: () => ({ selectedVehicle: "legacy", vehicleRules: { blockIfNoVehicle: false } }), relationalPreview: { vehicleRules: { blockIfNoVehicle: true } } });
  check("SHADOW compara sin efectos", !shadowComparison.effectsApplied && !shadowComparison.equivalent && adapter.authority === "LEGACY" && adapter.result.selectedVehicle === "legacy" && !adapter.effectsApplied);

  const previewDuplicateInput = vehicle("PREVIEW-DUP", { source: "BROWSER_LOCAL_STORAGE" });
  await createVehicle(prisma, creatorContext, previewDuplicateInput);
  const exportPayload = {
    source: "BROWSER_LOCAL_STORAGE", sourceKey: "osi-plus.fleet.vehicles", exportedAt: "2026-08-01T12:00:00.000Z",
    vehicles: [
      { ...previewDuplicateInput, requestId: undefined },
      { ...vehicle("IMPORT1"), requestId: undefined },
      { ...vehicle("IMPORT2"), requestId: undefined, plate: firstInput.plate },
      { ...vehicle("IMPORT3"), requestId: undefined, plate: "repeat-001" },
      { ...vehicle("IMPORT4"), requestId: undefined, plate: "repeat-001" },
      { businessCode: "INVALID", plate: "x", vehicleType: "CAMION" },
    ],
  };
  const preview = await previewVehicleImport(prisma, creatorContext, exportPayload);
  check("preview no escribe y clasifica conflictos", !preview.writesPerformed && preview.totals.CREATED === 2 && preview.totals.DUPLICATE === 1 && preview.totals.CONFLICT === 2 && preview.totals.INVALID === 1);
  await expectError("manifiesto alterado rechazado", () => importVehicleBatch(prisma, creatorContext, { batchId: `BATCH-BAD-${upper}`, requestId: `batch-bad-${run}`, manifestHash: "0".repeat(64), exportPayload }), "VEHICLE_IMPORT_MANIFEST_MISMATCH");
  const imported = await importVehicleBatch(prisma, creatorContext, { batchId: `BATCH-${upper}`, requestId: `batch-${run}`, manifestHash: preview.manifest.manifestHash, exportPayload });
  const importedAgain = await importVehicleBatch(prisma, creatorContext, { batchId: `BATCH-${upper}`, requestId: `batch-${run}`, manifestHash: preview.manifest.manifestHash, exportPayload });
  check("lote importado e idempotente", imported.totals.CREATED === 2 && importedAgain.idempotent && importedAgain.batchId === imported.batchId);
  const rolledBack = await rollbackVehicleImportBatch(prisma, creatorContext, { batchId: imported.batchId, requestId: `rollback-${run}` });
  const rolledAgain = await rollbackVehicleImportBatch(prisma, creatorContext, { batchId: imported.batchId, requestId: `rollback-again-${run}` });
  check("rollback retira sin borrar e idempotente", rolledBack.retiredVehicleCount === 2 && rolledAgain.idempotent);

  const dependencyPayload = { source: "BROWSER_LOCAL_STORAGE", sourceKey: "osi-plus.fleet.vehicles", vehicles: [{ ...vehicle("DEPENDENCY"), requestId: undefined }] };
  const dependencyPreview = await previewVehicleImport(prisma, creatorContext, dependencyPayload);
  const dependencyBatch = await importVehicleBatch(prisma, creatorContext, { batchId: `BATCH-DEP-${upper}`, requestId: `batch-dep-${run}`, manifestHash: dependencyPreview.manifest.manifestHash, exportPayload: dependencyPayload });
  const dependencyVehicle = dependencyBatch.results.find((item) => item.status === "CREATED").vehicleId;
  await prisma.$executeRawUnsafe(`UPDATE "osi"."osi_vehicles" SET "calculation_locked_at"=CURRENT_TIMESTAMP WHERE "id"='${dependencyVehicle}'`);
  await expectError("rollback con dependencia se bloquea", () => rollbackVehicleImportBatch(prisma, creatorContext, { batchId: dependencyBatch.batchId, requestId: `rollback-dep-${run}` }), "VEHICLE_IMPORT_HAS_DEPENDENCIES");

  const beforeAuditFailure = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."osi_vehicles" WHERE "tenant_id"=$1`, t1);
  await expectError("fallo de auditoría crítica revierte vehículo", () => createVehicle(prisma, creatorContext, vehicle("AUDITFAIL"), { auditWriter: async () => { throw new Error("AUDIT_DOWN"); } }));
  const afterAuditFailure = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."osi_vehicles" WHERE "tenant_id"=$1`, t1);
  check("auditoría fallida no deja vehículo", beforeAuditFailure[0].count === afterAuditFailure[0].count);

  const bulkCount = 2000;
  const bulkStart = performance.now();
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_vehicles"(
      "id","tenant_id","business_code","normalized_code","plate","normalized_plate","vehicle_type","capacity_weight","capacity_volume",
      "source","request_id","payload_hash","created_by_user_id","created_by_membership_id"
    ) SELECT 'bulk-${run}-'||g,'${t1}','BULK-${upper}-'||g,'BULK-${upper}-'||g,'P'||g||'${upper}','P'||g||'${upper}',
      'CAMION',8000,39,'SYNTHETIC_PERF','bulk-request-${run}-'||g,repeat(md5(g::text),2),'${creator.user}','${creator.membership}'
      FROM generate_series(1,${bulkCount}) g
  `);
  const insertMs = performance.now() - bulkStart;
  const pageStart = performance.now();
  const page = await listVehicles(prisma, creatorContext, { limit: 100, availableForCalculation: true });
  const pageMs = performance.now() - pageStart;
  check("paginación obligatoria", page.items.length === 100 && Boolean(page.nextCursor));
  check("rendimiento con 2,000 vehículos sintéticos", insertMs < 5000 && pageMs < 1000, `${insertMs.toFixed(2)} ms inserción; ${pageMs.toFixed(2)} ms página`);

  const dryRun = await analyzeVehicleSources();
  check("dry-run no lee navegador ni escribe", !dryRun.browserDataRead && !dryRun.writesPerformed && dryRun.totals.INCOMPLETE === 2);
  const audits = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "source"='DB01I_VEHICLE_ENGINE'`, t1);
  check("operaciones críticas auditadas", audits[0].count >= 20);
  const modeAudits = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "source"='DB01I_VEHICLE_ENGINE' AND "action"='VEHICLE_ENGINE_MODE_CHANGED'`, t1);
  check("cambio de modo deja auditoría propia", modeAudits[0].count >= 1);

  const output = { passed: results.length, failed: 0, results, performance: { records: bulkCount, insertMs: Number(insertMs.toFixed(2)), pageMs: Number(pageMs.toFixed(2)) }, dryRun: dryRun.totals };
  if (process.env.DB01I_RESULTS_PATH) await writeFile(process.env.DB01I_RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
