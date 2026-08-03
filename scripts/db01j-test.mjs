/* eslint-disable no-console */
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { resolveCrateCalculationAuthority } from "../api/_lib/crateSettingsAdapter.js";
import { importCrateSettingsBatch, previewCrateSettingsImport } from "../api/_lib/crateSettingsImport.js";
import { CRATE_SETTINGS_PERMISSIONS } from "../api/_lib/crateSettingsSupport.js";
import { convertCrateLength, convertCrateWeight, normalizeCrateSettingsInput } from "../api/_lib/crateSettingsValidation.js";
import {
  activateCrateSettings, activateCrateSettingsShadow, approveCrateSettings, compareCrateSettingsShadow,
  createCrateCalculationSnapshot, createCrateSettingsVersion, getCrateSettings, listCrateSettings, retireCrateSettings,
} from "../api/_lib/crateSettingsVersioned.js";
import { analyzeCrateSettingsSources } from "./db01j-dry-run.mjs";
import { createDb01jPrisma } from "./db01j-lib.mjs";

const prisma = createDb01jPrisma();
const results = [];
const run = Date.now().toString(36);
const upper = run.toUpperCase();
const t1 = `db01j-t1-${run}`;
const t2 = `db01j-t2-${run}`;
const creator = { user: `db01j-u1-${run}`, membership: `db01j-m1-${run}` };
const approver = { user: `db01j-u2-${run}`, membership: `db01j-m2-${run}` };
const limited = { user: `db01j-u3-${run}`, membership: `db01j-m3-${run}` };
const t2Membership = `db01j-m4-${run}`;
const permissions = [...Object.values(CRATE_SETTINGS_PERMISSIONS), "commercial:audit:view"];
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
      ('${creator.user}','DB01J-C-${run}','Synthetic Creator','${run}.creator@example.invalid','+10000000021','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${approver.user}','DB01J-A-${run}','Synthetic Approver','${run}.approver@example.invalid','+10000000022','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${limited.user}','DB01J-L-${run}','Synthetic Limited','${run}.limited@example.invalid','+10000000023','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenants"("id","code","name","legal_name","status","provisioning_source","updated_at") VALUES
      ('${t1}','DB01J-T1-${upper}','DB-01J Tenant One','Synthetic','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      ('${t2}','DB01J-T2-${upper}','DB-01J Tenant Two','Synthetic','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenant_memberships"("id","tenant_id","user_id","role","status","granted_permissions","is_default","provisioning_source","updated_at") VALUES
      ('${creator.membership}','${t1}','${creator.user}','V','ACTIVE',ARRAY[${permissionSql}],true,'MANUAL',CURRENT_TIMESTAMP),
      ('${approver.membership}','${t1}','${approver.user}','A','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${limited.membership}','${t1}','${limited.user}','V','ACTIVE',ARRAY['${CRATE_SETTINGS_PERMISSIONS.VIEW}'],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${t2Membership}','${t2}','${creator.user}','V','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP)
  `);
}

function config(sequence, extra = {}) {
  const base = {
    code: `CRATE-${sequence}-${upper}`, name: `Configuración ${sequence}`, scope: `SCOPE_${sequence}`, schemaVersion: 1,
    operationMode: "LEGACY_ONLY", currencyCode: "DOP", source: "SYNTHETIC_TEST", requestId: `crate-${sequence}-${run}`,
    units: { inputLength: "CM", engineeringLength: "IN", inputWeight: "KG", engineeringWeight: "LB", volume: "CBM" },
    catalogRefs: [
      { catalog: "LOGISTICS_MATERIAL", code: "PLYWOOD-0.5", purpose: "PLYWOOD" },
      { catalog: "LOGISTICS_MATERIAL", code: "MADERA-1X4", purpose: "LUMBER" },
    ],
    technical: {
      materials: {
        lumber: { lengthsIn: [192], types: ["1x4", "2x4"] },
        plywood: { sheetSizeIn: { w: 48, h: 96 }, thicknessOptionsIn: [0.25, 0.375, 0.5] },
        foam: { sheetSizeIn: { w: 48, h: 96 }, thicknessOptionsIn: [0.75, 1, 1.5] },
        cardboard: { thicknessIn: 0.25 },
      },
      nesting: { maxDepthForNestingCm: 15, maxItemsPerBox: 5, similarityTolerancePct: 10, allowRotationDefault: true },
      protectionByFragility: [1, 2, 3, 4, 5].map((fragility) => ({
        fragility, perimeterFoamIn: fragility === 1 ? 0 : Math.min(1.5, fragility * 0.3),
        betweenItemsFoamIn: fragility === 1 ? 0 : Math.min(1.5, fragility * 0.3), cardboardIn: 0.25, doublePerimeter: fragility === 5,
      })),
      engineering: {
        thresholds: {
          use2x4IfWeightLbAbove: 120, use2x4IfLongestSideInAbove: 72, skidIfWeightLbAbove: 200,
          skidIfLongestSideInAbove: 60, addRibsIfLongestSideInAbove: 72, addXBracingIfAspectRatioAbove: 2.2,
        },
        plywoodThicknessByProfileIn: { STANDARD_LOCAL: 0.375, EXPORT_ISPM15: 0.5, PREMIUM_ART_IT: 0.5, MACHINERY_ISPM15: 0.5 },
        profileDefaults: {
          STANDARD_LOCAL: { minFragility: 1, ispm15Required: false, defaultLumber: "1x4", skidPreferred: false },
          EXPORT_ISPM15: { minFragility: 2, ispm15Required: true, defaultLumber: "1x4", skidPreferred: false },
          PREMIUM_ART_IT: { minFragility: 3, ispm15Required: false, defaultLumber: "1x4", skidPreferred: false },
          MACHINERY_ISPM15: { minFragility: 2, ispm15Required: true, defaultLumber: "2x4", skidPreferred: true },
        },
      },
    },
    economic: {
      pricing: {
        rounding: { stepUnits: 0.5, mode: "UP", hoursRule: "HALF_HOUR_UP" },
        wastePctByMaterial: { plywood: 0.1, lumber: 0.1, foam: 0.15 },
        labor: { enabled: true, ratePerHour: 300, hoursPerBox: 1 },
        unitCosts: {
          lumberPerStick: { "1x4": 100, "2x4": 200 }, plywoodPerSheetByThicknessIn: { "0.25": 300, "0.375": 400, "0.5": 500 },
          foamPerSheetByThicknessIn: { "0.75": 100, "1": 150, "1.5": 200 }, cardboardPerSheet: 80,
        },
        markupPctByProfile: { STANDARD_LOCAL: 0.25, EXPORT_ISPM15: 0.3, PREMIUM_ART_IT: 0.35, MACHINERY_ISPM15: 0.35 },
      },
      adders: {
        fumigation: { enabled: true, mode: "PER_M3", rate: 100, transportToPlantEnabled: true, transportToPlantRate: 500, markingIppcEnabled: true, markingIppcRatePerBox: 50 },
        fasteners: { enabled: true, mode: "FIXED_PER_BOX", boxVolumeThresholdsIn3: { smallMax: 12000, mediumMax: 32000 }, rateBySize: { small: 25, medium: 50, large: 75 }, ratePerSheet: 5 },
        cornerProtectors: { enabled: true, ratePerBox: 30 },
      },
    },
  };
  return { ...base, ...extra };
}

try {
  await seed();
  const adapterDefault = resolveCrateCalculationAuthority({ legacySettings: { marker: "legacy" }, relationalSettings: { marker: "relational" } });
  check("integración LEGACY_ONLY desactivada por defecto", adapterDefault.authority === "LEGACY" && adapterDefault.settings.marker === "legacy" && !adapterDefault.effectsApplied);

  const normalizedA = normalizeCrateSettingsInput(config("HASH", { requestId: undefined }));
  const normalizedB = normalizeCrateSettingsInput(config("HASH", { requestId: undefined }));
  check("hash determinista", normalizedA.configurationHash === normalizedB.configurationHash && normalizedA.configurationHash.length === 64);
  check("conversiones de unidades", Math.abs(convertCrateLength(2.54, "CM", "IN") - 1) < 1e-9 && Math.abs(convertCrateWeight(1, "KG", "LB") - 2.2046226218) < 1e-9);
  await expectError("moneda ISO explícita obligatoria", () => Promise.resolve(normalizeCrateSettingsInput(config("NO-CURRENCY", { currencyCode: undefined }))), "CRATE_SETTINGS_INPUT_INVALID");
  await expectError("parámetros sin consumidor se rechazan", () => Promise.resolve(normalizeCrateSettingsInput({ ...config("INVENTED"), technical: { ...config("INVENTED").technical, qrFormat: "INVENTADO" } })), "CRATE_SETTINGS_INPUT_INVALID");

  const baseInput = config("BASE", { scope: "GLOBAL" });
  const [baseA, baseB] = await Promise.all([createCrateSettingsVersion(prisma, creatorContext, baseInput), createCrateSettingsVersion(prisma, creatorContext, baseInput)]);
  check("creación concurrente idempotente", baseA.settings.id === baseB.settings.id && [baseA.idempotent, baseB.idempotent].includes(true));
  await expectError("requestId con otro payload", () => createCrateSettingsVersion(prisma, creatorContext, { ...baseInput, name: "Otro nombre" }), "CRATE_SETTINGS_IDEMPOTENCY_CONFLICT");
  await expectError("RBAC ignora permisos del navegador", () => createCrateSettingsVersion(prisma, limitedContext, config("NOAUTH")), "LOGISTICS_GEO_FORBIDDEN");
  await expectError("creador no puede aprobar", () => approveCrateSettings(prisma, creatorContext, { id: baseA.settings.id, expectedVersion: 1, requestId: `self-approve-${run}` }), "CRATE_SETTINGS_SEPARATION_OF_DUTIES");
  const approved = await approveCrateSettings(prisma, approverContext, { id: baseA.settings.id, expectedVersion: 1, requestId: `approve-base-${run}` });
  const active = await activateCrateSettings(prisma, approverContext, { id: approved.settings.id, expectedVersion: 2, requestId: `activate-base-${run}` });
  check("versión activa y moneda explícita", active.settings.state === "ACTIVE" && active.settings.currencyCode === "DOP" && active.settings.businessVersion === 1);
  await expectError("versión activa inmutable", () => prisma.$executeRawUnsafe(`UPDATE "osi"."crate_settings_versions" SET "name"='Alterada' WHERE "id"='${active.settings.id}'`));
  await expectError("eliminación de versión bloqueada", () => prisma.$executeRawUnsafe(`DELETE FROM "osi"."crate_settings_versions" WHERE "id"='${active.settings.id}'`));

  const tenant2 = await createCrateSettingsVersion(prisma, t2Context, { ...baseInput, requestId: `t2-${run}` });
  check("código puede repetirse entre empresas", Boolean(tenant2.settings.id));
  await expectError("acceso cruzado devuelve 404", () => getCrateSettings(prisma, t2Context, active.settings.id), "CRATE_SETTINGS_NOT_FOUND");

  const conflict = await createCrateSettingsVersion(prisma, creatorContext, config("CONFLICT", { scope: "GLOBAL" }));
  const conflictApproved = await approveCrateSettings(prisma, approverContext, { id: conflict.settings.id, expectedVersion: 1, requestId: `approve-conflict-${run}` });
  await expectError("dos configuraciones activas superpuestas se impiden", () => activateCrateSettings(prisma, approverContext, { id: conflictApproved.settings.id, expectedVersion: 2, requestId: `activate-conflict-${run}` }), "CRATE_SETTINGS_ACTIVE_CONFLICT");

  const replacementInput = config("REPLACE", {
    code: baseInput.code, scope: "GLOBAL", replacesSettingsId: active.settings.id, requestId: `replace-${run}`,
    economic: { ...baseInput.economic, pricing: { ...baseInput.economic.pricing, labor: { ...baseInput.economic.pricing.labor, ratePerHour: 325 } } },
  });
  const replacement = await createCrateSettingsVersion(prisma, creatorContext, replacementInput);
  const replacementApproved = await approveCrateSettings(prisma, approverContext, { id: replacement.settings.id, expectedVersion: 1, requestId: `approve-replace-${run}` });
  const replacementActive = await activateCrateSettings(prisma, approverContext, { id: replacementApproved.settings.id, expectedVersion: 2, requestId: `activate-replace-${run}`, replaceActive: true });
  check("nueva versión reemplaza activa explícitamente", replacementActive.settings.businessVersion === 2 && replacementActive.settings.state === "ACTIVE");

  const snapshotInput = {
    settingsId: replacementActive.settings.id, calculationRef: `CALC-${upper}`, sourceEntity: "CRATE_DRAFT", sourceEntityId: `DRAFT-${upper}`,
    calculationInput: { pieces: 3, lengthCm: 120 }, calculationOutput: { boxes: 1, cost: 4000 }, source: "SYNTHETIC_TEST", requestId: `snapshot-${run}`,
  };
  const snapshot = await createCrateCalculationSnapshot(prisma, creatorContext, snapshotInput);
  const snapshotAgain = await createCrateCalculationSnapshot(prisma, creatorContext, snapshotInput);
  check("snapshot histórico completo e idempotente", snapshot.snapshot.id === snapshotAgain.snapshot.id && snapshotAgain.idempotent && snapshot.snapshot.settingsBusinessVersion === 2 && snapshot.snapshot.currencyCode === "DOP");
  await expectError("snapshot histórico inmutable", () => prisma.$executeRawUnsafe(`UPDATE "osi"."crate_calculation_snapshots" SET "source"='ALTERED' WHERE "id"='${snapshot.snapshot.id}'`));
  await retireCrateSettings(prisma, approverContext, { id: replacementActive.settings.id, expectedVersion: 3, requestId: `retire-replacement-${run}` });
  const snapshotRow = await prisma.$queryRawUnsafe(`SELECT "settings_hash","currency_code" FROM "osi"."crate_calculation_snapshots" WHERE "id"=$1`, snapshot.snapshot.id);
  check("retiro no altera snapshot", snapshotRow[0].settings_hash === snapshot.snapshot.settingsHash && snapshotRow[0].currency_code === "DOP");

  const shadowDraft = await createCrateSettingsVersion(prisma, creatorContext, config("SHADOW", { operationMode: "SHADOW" }));
  const shadowApproved = await approveCrateSettings(prisma, approverContext, { id: shadowDraft.settings.id, expectedVersion: 1, requestId: `approve-shadow-${run}` });
  await expectError("activación SHADOW deshabilitada", () => activateCrateSettingsShadow(prisma, approverContext, { id: shadowApproved.settings.id, expectedVersion: 2, requestId: `activate-shadow-${run}` }), "CRATE_SETTINGS_SHADOW_DISABLED");
  const enforced = await createCrateSettingsVersion(prisma, creatorContext, config("ENFORCED", { operationMode: "ENFORCED" }));
  const enforcedApproved = await approveCrateSettings(prisma, approverContext, { id: enforced.settings.id, expectedVersion: 1, requestId: `approve-enforced-${run}` });
  await expectError("ENFORCED deshabilitado", () => activateCrateSettings(prisma, approverContext, { id: enforcedApproved.settings.id, expectedVersion: 2, requestId: `activate-enforced-${run}` }), "CRATE_SETTINGS_ENFORCED_DISABLED");
  const comparison = compareCrateSettingsShadow({ cost: 100 }, { cost: 110 });
  const shadowAdapter = resolveCrateCalculationAuthority({ legacySettings: { cost: 100 }, relationalSettings: { cost: 110 }, requestedMode: "SHADOW" });
  check("LEGACY contra SHADOW sin efectos", !comparison.equivalent && !comparison.effectsApplied && shadowAdapter.authority === "LEGACY" && shadowAdapter.disabled && !shadowAdapter.effectsApplied);

  const legacyPayload = {
    source: "BROWSER_LOCAL_STORAGE", units: baseInput.units,
    settings: [{ ...baseInput.technical, pricing: { ...baseInput.economic.pricing, unitCosts: { ...baseInput.economic.pricing.unitCosts, currency: "RD$" } }, adders: baseInput.economic.adders, code: "LEGACY", name: "Legacy", scope: "LEGACY" }],
  };
  const ambiguousPreview = await previewCrateSettingsImport(prisma, creatorContext, legacyPayload);
  check("dry-run rechaza moneda heredada ambigua sin escribir", !ambiguousPreview.writesPerformed && ambiguousPreview.totals.AMBIGUOUS === 1);
  const importConfig = config("IMPORT", { economic: { ...baseInput.economic, pricing: { ...baseInput.economic.pricing, labor: { ...baseInput.economic.pricing.labor, ratePerHour: 777 } } } });
  const exportPayload = { source: "BROWSER_EXPORT", sourceKey: "osi-plus.crateSettings", currencyCode: "DOP", settings: [importConfig] };
  const importPreview = await previewCrateSettingsImport(prisma, creatorContext, exportPayload);
  check("exportación explícita convertible", importPreview.totals.CONVERTIBLE === 1 && !importPreview.writesPerformed);
  const imported = await importCrateSettingsBatch(prisma, creatorContext, { requestId: `import-${run}`, manifestHash: importPreview.manifest.manifestHash, exportPayload });
  const importedAgain = await importCrateSettingsBatch(prisma, creatorContext, { requestId: `import-${run}`, manifestHash: importPreview.manifest.manifestHash, exportPayload });
  check("importación auditada e idempotente", imported.createdIds.length === 1 && importedAgain.idempotent && importedAgain.importId === imported.importId);

  const beforeAuditFailure = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."crate_settings_versions" WHERE "tenant_id"=$1`, t1);
  await expectError("fallo de auditoría crítica revierte borrador", () => createCrateSettingsVersion(prisma, creatorContext, config("AUDITFAIL"), { auditWriter: async () => { throw new Error("AUDIT_DOWN"); } }));
  const afterAuditFailure = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."crate_settings_versions" WHERE "tenant_id"=$1`, t1);
  check("auditoría fallida no deja configuración", beforeAuditFailure[0].count === afterAuditFailure[0].count);

  const page = await listCrateSettings(prisma, creatorContext, { limit: 3 });
  check("paginación obligatoria", page.items.length === 3 && Boolean(page.nextCursor));

  const bulkCount = 2000;
  const performanceSettings = conflictApproved.settings;
  const insertStart = performance.now();
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."crate_calculation_snapshots"(
      "id","tenant_id","calculation_ref","source_entity","source_entity_id","settings_id","settings_business_version","settings_hash",
      "technical_snapshot_json","economic_snapshot_json","units_snapshot_json","currency_code","calculation_input_hash","calculation_output_hash","source","request_id"
    ) SELECT 'perf-${run}-'||g,'${t1}','PERF-${upper}-'||g,'PERF','PERF-'||g,'${performanceSettings.id}',${performanceSettings.businessVersion},'${performanceSettings.configurationHash}',
      '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'DOP',repeat(md5(g::text),2),repeat(md5(('o'||g)::text),2),'SYNTHETIC_PERF','perf-request-${run}-'||g
      FROM generate_series(1,${bulkCount}) g
  `);
  const insertMs = performance.now() - insertStart;
  const pageStart = performance.now();
  const perfPage = await prisma.$queryRawUnsafe(`SELECT "id" FROM "osi"."crate_calculation_snapshots" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC,"id" DESC LIMIT 50`, t1);
  const pageMs = performance.now() - pageStart;
  check("rendimiento con snapshots sintéticos", perfPage.length === 50 && insertMs < 10000 && pageMs < 2000, `${bulkCount} registros; ${insertMs.toFixed(2)} ms inserción; ${pageMs.toFixed(2)} ms página`);

  const dryRun = await analyzeCrateSettingsSources();
  check("dry-run no lee navegador ni escribe", !dryRun.writesPerformed && !dryRun.browserDataRead && !dryRun.productionAccessed);
  const audits = await prisma.$queryRawUnsafe(`SELECT "action" FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "source"='DB01J_CRATE_SETTINGS'`, t1);
  const actions = new Set(audits.map((row) => row.action));
  check("operaciones críticas auditadas", ["CRATE_SETTINGS_DRAFT_CREATED", "CRATE_SETTINGS_APPROVED", "CRATE_SETTINGS_ACTIVE", "CRATE_CALCULATION_SNAPSHOT_CREATED", "CRATE_SETTINGS_IMPORT_COMPLETED"].every((action) => actions.has(action)));

  const output = {
    passed: results.length, failed: 0, results,
    performance: { records: bulkCount, insertMs: Number(insertMs.toFixed(2)), pageMs: Number(pageMs.toFixed(2)) },
    dryRun: dryRun.totals,
  };
  await writeFile(process.env.DB01J_RESULTS_PATH || "prisma/db01/DB-01J-TEST-RESULTS.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  const output = { passed: results.length, failed: 1, results, error: { name: error?.name, code: error?.code, message: String(error?.message || error), stack: error?.stack } };
  await writeFile(process.env.DB01J_RESULTS_PATH || "prisma/db01/DB-01J-TEST-RESULTS.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.error(JSON.stringify(output, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
