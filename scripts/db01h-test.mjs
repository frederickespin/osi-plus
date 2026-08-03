/* eslint-disable no-console */
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { calculateLogisticEngine } from "../api/_domain/logisticEngine.js";
import { canonicalizePlace, normalizeGeoName, normalizeGeoToken } from "../api/_lib/geoNormalization.js";
import {
  activateGeoRegionVersion,
  activateLogisticsConfiguration,
  approveGeoRegionVersion,
  approveLogisticsConfiguration,
  createGeoRegionVersion,
  createLogisticsConfigurationVersion,
  listGeoRegions,
  resolveGeoRegion,
} from "../api/_lib/logisticsGeoAdmin.js";
import { LOGISTICS_GEO_PERMISSIONS } from "../api/_lib/logisticsGeoSupport.js";
import {
  activateTransportZoneRuleVersion,
  activateZoneRuleVersion,
  approveTransportZoneRuleVersion,
  approveZoneRuleVersion,
  compareLegacyToShadow,
  createTransportZoneRuleVersion,
  createZoneRuleVersion,
  recordLogisticsImportDecision,
  resolveRelationalLogisticsRules,
} from "../api/_lib/logisticsZoneRules.js";
import { evaluateLogisticsWithCompatibility, logisticsGeoIntegrationMode } from "../api/_lib/logisticsGeoAdapter.js";
import { analyzeLogisticsSources } from "./db01h-dry-run.mjs";
import { createDb01hPrisma } from "./db01h-lib.mjs";

const prisma = createDb01hPrisma();
const results = [];
const run = Date.now().toString(36);
const upper = run.toUpperCase();

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

const permissions = [...Object.values(LOGISTICS_GEO_PERMISSIONS), "commercial:audit:view"];
const t1 = `db01h-t1-${run}`;
const t2 = `db01h-t2-${run}`;
const creator = { user: `db01h-u-create-${run}`, membership: `db01h-m-create-${run}` };
const approver = { user: `db01h-u-approve-${run}`, membership: `db01h-m-approve-${run}` };
const limited = { user: `db01h-u-limited-${run}`, membership: `db01h-m-limited-${run}` };
const tenantTwoMembership = `db01h-m-t2-${run}`;
const context = (tenantId, membershipId) => ({ tenantId, actorKind: "MEMBERSHIP", actorMembershipId: membershipId });
const creatorContext = context(t1, creator.membership);
const approverContext = context(t1, approver.membership);
const limitedContext = { ...context(t1, limited.membership), permissions };
const tenantTwoContext = context(t2, tenantTwoMembership);
const systemContext = { tenantId: t1, actorKind: "SYSTEM" };

async function seed() {
  const permissionSql = permissions.map((permission) => `'${permission}'`).join(",");
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_users"("id","code","name","email","phone","role","status","joinDate","passwordHash","updatedAt") VALUES
      ('${creator.user}','DB01H-C-${run}','Synthetic Creator','${run}.creator@example.invalid','+10000000001','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${approver.user}','DB01H-A-${run}','Synthetic Approver','${run}.approver@example.invalid','+10000000002','A','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP),
      ('${limited.user}','DB01H-L-${run}','Synthetic Limited','${run}.limited@example.invalid','+10000000003','V','active','2026-01-01','$synthetic$',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenants"("id","code","name","legal_name","status","provisioning_source","updated_at") VALUES
      ('${t1}','DB01H-T1-${upper}','DB-01H Tenant One','Synthetic','ACTIVE','MANUAL',CURRENT_TIMESTAMP),
      ('${t2}','DB01H-T2-${upper}','DB-01H Tenant Two','Synthetic','ACTIVE','MANUAL',CURRENT_TIMESTAMP)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."tenant_memberships"("id","tenant_id","user_id","role","status","granted_permissions","is_default","provisioning_source","updated_at") VALUES
      ('${creator.membership}','${t1}','${creator.user}','V','ACTIVE',ARRAY[${permissionSql}],true,'MANUAL',CURRENT_TIMESTAMP),
      ('${approver.membership}','${t1}','${approver.user}','A','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${limited.membership}','${t1}','${limited.user}','V','ACTIVE',ARRAY[]::text[],false,'MANUAL',CURRENT_TIMESTAMP),
      ('${tenantTwoMembership}','${t2}','${creator.user}','V','ACTIVE',ARRAY[${permissionSql}],false,'MANUAL',CURRENT_TIMESTAMP)
  `);
}

function regionInput(sequence, extra = {}) {
  return {
    countryCode: "DO", code: `REGION_${sequence}_${upper}`, name: `Región ${sequence}`,
    latitude: 18.5, longitude: -69.9, regionType: "MUNICIPALITY", zoneType: "INTERIOR", slaHours: 72,
    source: "SYNTHETIC_TEST", aliases: [], requestId: `region-${sequence}-${run}`, ...extra,
  };
}

function zoneInput(sequence, extra = {}) {
  return {
    code: `ZONE_${sequence}_${upper}`, name: `Zone rule ${sequence}`, kind: "ZONE_TYPE_BASE", priority: 100,
    countryCode: "DO", zoneType: "METRO", freeKm: 15, kmRate: 220, currencyCode: "DOP", kmRateUnit: "AMOUNT_PER_KM", surchargePercent: 0, slaHours: 24,
    source: "SYNTHETIC_TEST", requestId: `zone-${sequence}-${run}`, ...extra,
  };
}

function transportInput(sequence, extra = {}) {
  return {
    code: `TRANSPORT_${sequence}_${upper}`, name: `Transport rule ${sequence}`, scope: "ZONE_TYPE", priority: 100,
    countryCode: "DO", serviceMode: "LOCAL", zoneType: "METRO", kmMultiplier: 1, volumeMultiplier: 1,
    surchargePercent: 0, minimumCharge: 500, currencyCode: "DOP", source: "SYNTHETIC_TEST", requestId: `transport-${sequence}-${run}`, ...extra,
  };
}

async function approveAndActivateZone(created, sequence) {
  const approved = await approveZoneRuleVersion(prisma, approverContext, { id: created.rule.id, expectedVersion: created.rule.rowVersion, requestId: `approve-zone-${sequence}-${run}` });
  return activateZoneRuleVersion(prisma, approverContext, { id: approved.rule.id, expectedVersion: approved.rule.rowVersion, requestId: `activate-zone-${sequence}-${run}` });
}

async function approveAndActivateTransport(created, sequence) {
  const approved = await approveTransportZoneRuleVersion(prisma, approverContext, { id: created.rule.id, expectedVersion: created.rule.rowVersion, requestId: `approve-transport-${sequence}-${run}` });
  return activateTransportZoneRuleVersion(prisma, approverContext, { id: approved.rule.id, expectedVersion: approved.rule.rowVersion, requestId: `activate-transport-${sequence}-${run}` });
}

try {
  await seed();
  check("integración desactivada por defecto", logisticsGeoIntegrationMode({}) === "LEGACY_ONLY");
  check("normaliza tildes, espacios y mayúsculas", normalizeGeoToken("  Sán   Cristóbal ") === "SAN_CRISTOBAL" && normalizeGeoName("  Sán   Cristóbal ") === "SAN CRISTOBAL");
  check("COSNTANZA se normaliza a CONSTANZA", canonicalizePlace("Cosntanza", "do").canonicalCode === "CONSTANZA");

  const constanzaInput = regionInput("constanza", { code: "COSNTANZA", name: "Constanza", aliases: ["Valle de Constanza"] });
  const [constanzaA, constanzaB] = await Promise.all([
    createGeoRegionVersion(prisma, creatorContext, constanzaInput),
    createGeoRegionVersion(prisma, creatorContext, constanzaInput),
  ]);
  check("creación concurrente es idempotente", constanzaA.region.id === constanzaB.region.id && [constanzaA.idempotent, constanzaB.idempotent].includes(true));
  check("versión conserva alias tipográfico", constanzaA.region.code === "CONSTANZA" && constanzaA.region.aliases.some((alias) => alias.normalizedAlias === "COSNTANZA" && alias.kind === "TYPO_COMPATIBILITY"));
  await expectError("requestId con payload distinto", () => createGeoRegionVersion(prisma, creatorContext, { ...constanzaInput, name: "Otro nombre" }), "LOGISTICS_GEO_IDEMPOTENCY_CONFLICT");
  await expectError("permisos del navegador no conceden RBAC", () => createGeoRegionVersion(prisma, limitedContext, regionInput("forbidden")), "LOGISTICS_GEO_FORBIDDEN");
  await expectError("creador no aprueba su región", () => approveGeoRegionVersion(prisma, creatorContext, { id: constanzaA.region.id, expectedVersion: constanzaA.region.rowVersion, requestId: `self-approve-region-${run}` }), "LOGISTICS_GEO_SEPARATION_OF_DUTIES");
  const constanzaApproved = await approveGeoRegionVersion(prisma, approverContext, { id: constanzaA.region.id, expectedVersion: constanzaA.region.rowVersion, requestId: `approve-region-${run}` });
  const constanzaActive = await activateGeoRegionVersion(prisma, approverContext, { id: constanzaApproved.region.id, expectedVersion: constanzaApproved.region.rowVersion, requestId: `activate-region-${run}` });
  check("región aprobada y activada", constanzaActive.region.state === "ACTIVE" && constanzaActive.region.versionHash.length === 64);
  const resolvedCanonical = await resolveGeoRegion(prisma, systemContext, { countryCode: "DO", place: "Cónstanza" });
  const resolvedLegacy = await resolveGeoRegion(prisma, systemContext, { countryCode: "DO", place: "cosntanza" });
  check("código y alias resuelven la misma región", resolvedCanonical.id === resolvedLegacy.id);
  await expectError("tenant ajeno obtiene 404", () => resolveGeoRegion(prisma, tenantTwoContext, { countryCode: "DO", place: "CONSTANZA" }), "LOGISTICS_GEO_NOT_FOUND");
  await expectError("FK compuesta rechaza alias cruzado", () => prisma.$executeRawUnsafe(`INSERT INTO "osi"."osi_geo_region_aliases"("id","tenant_id","region_id","country_code","alias","normalized_alias","kind") VALUES ('cross-${run}','${t2}','${constanzaActive.region.id}','DO','Cross','CROSS','EXTERNAL')`));

  const conflict = await createGeoRegionVersion(prisma, creatorContext, regionInput("alias-conflict", { aliases: ["COSNTANZA"] }));
  const conflictApproved = await approveGeoRegionVersion(prisma, approverContext, { id: conflict.region.id, expectedVersion: conflict.region.rowVersion, requestId: `approve-region-conflict-${run}` });
  await expectError("alias activo contradictorio se impide", () => activateGeoRegionVersion(prisma, approverContext, { id: conflictApproved.region.id, expectedVersion: conflictApproved.region.rowVersion, requestId: `activate-region-conflict-${run}` }), "LOGISTICS_GEO_CONTRADICTION");
  const contradictionAudit = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "action"='GEO_REGION_CONTRADICTION_DETECTED'`, t1);
  check("contradicción queda auditada", contradictionAudit[0].count === 1);

  const baseZone = await createZoneRuleVersion(prisma, creatorContext, zoneInput("base"));
  const baseZoneRepeat = await createZoneRuleVersion(prisma, creatorContext, zoneInput("base"));
  check("regla de zona idempotente", baseZoneRepeat.idempotent && baseZoneRepeat.rule.id === baseZone.rule.id);
  const baseZoneActive = await approveAndActivateZone(baseZone, "base");
  check("regla de zona versionada y activa", baseZoneActive.rule.state === "ACTIVE" && baseZoneActive.rule.versionHash.length === 64);

  const overlapping = await createZoneRuleVersion(prisma, creatorContext, zoneInput("overlap", { priority: 100, distanceMinKm: 0, distanceMaxKm: 100 }));
  const overlappingApproved = await approveZoneRuleVersion(prisma, approverContext, { id: overlapping.rule.id, expectedVersion: overlapping.rule.rowVersion, requestId: `approve-overlap-${run}` });
  await expectError("superposición de igual prioridad se impide", () => activateZoneRuleVersion(prisma, approverContext, { id: overlappingApproved.rule.id, expectedVersion: overlappingApproved.rule.rowVersion, requestId: `activate-overlap-${run}` }), "LOGISTICS_GEO_RULE_CONTRADICTION");

  const priorityZone = await createZoneRuleVersion(prisma, creatorContext, zoneInput("priority", { priority: 50, kmRate: 199 }));
  await approveAndActivateZone(priorityZone, "priority");
  const distanceReview = await createZoneRuleVersion(prisma, creatorContext, zoneInput("distance80", { kind: "DISTANCE_REVIEW", zoneType: null, priority: 20, distanceMinKm: 80, freeKm: null, kmRate: null, surchargePercent: null, slaHours: null }));
  const distanceBlock = await createZoneRuleVersion(prisma, creatorContext, zoneInput("distance120", { kind: "DISTANCE_BLOCK", zoneType: null, priority: 20, distanceMinKm: 120, freeKm: null, kmRate: null, surchargePercent: null, slaHours: null }));
  await approveAndActivateZone(distanceReview, "distance80");
  await approveAndActivateZone(distanceBlock, "distance120");
  check("80 km y 120 km son reglas distintas no contradictorias", true);

  const transport = await createTransportZoneRuleVersion(prisma, creatorContext, transportInput("base"));
  await approveAndActivateTransport(transport, "base");
  const transportSameRequest = transportInput("concurrent");
  const [transportA, transportB] = await Promise.all([
    createTransportZoneRuleVersion(prisma, creatorContext, transportSameRequest),
    createTransportZoneRuleVersion(prisma, creatorContext, transportSameRequest),
  ]);
  check("regla de transporte concurrente idempotente", transportA.rule.id === transportB.rule.id);

  const resolvedRules = await resolveRelationalLogisticsRules(prisma, systemContext, { countryCode: "DO", serviceMode: "LOCAL", zoneType: "METRO", distanceKm: 90 });
  const selectedBase = resolvedRules.selectedZones.find((rule) => rule.kind === "ZONE_TYPE_BASE");
  check("prioridad menor es determinista", selectedBase.priority === 50 && selectedBase.kmRate === 199);
  check("regla de 80 km aplica y la de 120 no", resolvedRules.selectedZones.some((rule) => rule.kind === "DISTANCE_REVIEW") && !resolvedRules.selectedZones.some((rule) => rule.kind === "DISTANCE_BLOCK"));

  const comparison = compareLegacyToShadow({ freeKm: 15, kmRate: 220, slaHours: 24 }, { freeKm: 15, kmRate: 199, slaHours: 24 });
  check("SHADOW compara sin efectos", !comparison.effectsApplied && !comparison.equivalent && comparison.differences[0]);
  const legacyInput = { originRegionCode: "DN", destinationRegionCode: "DN", serviceMode: "LOCAL", serviceDate: "2026-08-01T10:00:00Z", estimatedVolumeCbm: 5 };
  const legacyEvaluate = () => calculateLogisticEngine(legacyInput, {
    hubs: [{ id: "hub", lat: 18.4861, lng: -69.9312 }], regions: [{ code: "DN", name: "Distrito Nacional", lat: 18.4861, lng: -69.9312, zoneType: "METRO", slaHours: 24 }],
    vehicles: [{ id: "vehicle", status: "AVAILABLE", capacityCbm: 20, operationalCostPerKm: 50 }],
    zoneRules: [{ zoneType: "METRO", freeKm: 15, kmRate: 220, kmMultiplier: 1, volumeMultiplier: 1, surchargePercent: 0, slaHours: 24 }],
    globalSettings: { freeKm: 15, defaultKmRate: 220, minimumMarginPercent: 18, transportMinCharge: 500 }, minimumMarginPercent: 18,
  });
  const legacyOnly = await evaluateLogisticsWithCompatibility({ prisma, context: systemContext, input: { ...legacyInput, countryCode: "DO", zoneType: "METRO", distanceKm: 10 }, legacyEvaluate });
  const shadow = await evaluateLogisticsWithCompatibility({ prisma, context: systemContext, input: { ...legacyInput, countryCode: "DO", zoneType: "METRO", distanceKm: 10 }, legacyEvaluate, mode: "SHADOW" });
  check("comparación no altera resultado heredado", JSON.stringify(legacyOnly.result) === JSON.stringify(shadow.result) && shadow.authority === "LEGACY" && shadow.shadow.effectsApplied === false);

  const config = await createLogisticsConfigurationVersion(prisma, creatorContext, { mode: "LEGACY_ONLY", source: "SYNTHETIC", sourceSnapshot: { zones: 2 }, requestId: `config-${run}` });
  const configRepeat = await createLogisticsConfigurationVersion(prisma, creatorContext, { mode: "LEGACY_ONLY", source: "SYNTHETIC", sourceSnapshot: { zones: 2 }, requestId: `config-${run}` });
  check("configuración versionada e idempotente", configRepeat.idempotent && configRepeat.configuration.id === config.configuration.id);
  const configApproved = await approveLogisticsConfiguration(prisma, approverContext, { id: config.configuration.id, expectedVersion: config.configuration.rowVersion, requestId: `approve-config-${run}` });
  const configActive = await activateLogisticsConfiguration(prisma, approverContext, { id: configApproved.configuration.id, expectedVersion: configApproved.configuration.rowVersion, requestId: `activate-config-${run}` });
  check("modo activo permanece LEGACY_ONLY", configActive.configuration.mode === "LEGACY_ONLY" && configActive.configuration.state === "ACTIVE");
  const shadowConfig = await createLogisticsConfigurationVersion(prisma, creatorContext, { mode: "SHADOW", source: "SYNTHETIC", sourceSnapshot: { preview: true }, requestId: `config-shadow-${run}` });
  const shadowConfigApproved = await approveLogisticsConfiguration(prisma, approverContext, { id: shadowConfig.configuration.id, expectedVersion: shadowConfig.configuration.rowVersion, requestId: `approve-config-shadow-${run}` });
  await expectError("activación SHADOW permanece deshabilitada", () => activateLogisticsConfiguration(prisma, approverContext, { id: shadowConfigApproved.configuration.id, expectedVersion: shadowConfigApproved.configuration.rowVersion, requestId: `activate-config-shadow-${run}` }), "LOGISTICS_GEO_SHADOW_DISABLED");
  const enforcedConfig = await createLogisticsConfigurationVersion(prisma, creatorContext, { mode: "ENFORCED", source: "SYNTHETIC", sourceSnapshot: { enforce: false }, requestId: `config-enforced-${run}` });
  const enforcedApproved = await approveLogisticsConfiguration(prisma, approverContext, { id: enforcedConfig.configuration.id, expectedVersion: enforcedConfig.configuration.rowVersion, requestId: `approve-config-enforced-${run}` });
  await expectError("ENFORCED permanece deshabilitado", () => activateLogisticsConfiguration(prisma, approverContext, { id: enforcedApproved.configuration.id, expectedVersion: enforcedApproved.configuration.rowVersion, requestId: `activate-config-enforced-${run}` }), "LOGISTICS_GEO_ENFORCEMENT_DISABLED");

  const rollbackRequest = `audit-rollback-${run}`;
  await expectError("fallo de auditoría crítica revierte", () => createGeoRegionVersion(prisma, creatorContext, regionInput("audit-rollback", { requestId: rollbackRequest }), { auditWriter: async () => { throw new Error("synthetic audit failure"); } }));
  const rolledBack = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."osi_geo_regions" WHERE "tenant_id"=$1 AND "request_id"=$2`, t1, rollbackRequest);
  check("auditoría fallida no deja región ni alias", rolledBack[0].count === 0);

  const importDecision = await recordLogisticsImportDecision(prisma, approverContext, { importId: `import-${run}`, accepted: false, requestId: `import-reject-${run}`, summary: { ambiguous: 4 } });
  check("importación ambigua se rechaza sin persistir", !importDecision.accepted && !importDecision.persistedConfiguration);
  const dryRunBefore = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."osi_geo_regions" WHERE "tenant_id"=$1`, t1);
  const dryRun = await analyzeLogisticsSources(process.cwd(), {
    store: JSON.stringify({
      zoneTypeConfigs: {
        METRO: { kmRate: 10, freeKm: 5 },
        INTERIOR: { kmRate: 12, freeKm: 0 },
      },
      zoneRules: {
        METRO: { kmRate: 10, freeKm: 5 },
        INTERIOR: { kmRate: 12, freeKm: 0 },
      },
      transportRules: [{ zoneType: "METRO", kmMultiplier: 1 }],
      regionOverrides: {},
      riskRules: { highRiskZones: ["COSNTANZA", "ALIAS_DUDOSO"], autoExtendedSla: true },
    }),
    defaults: "METRO: { kmRate: 9, freeKm: 5 } INTERIOR: { kmRate: 12, freeKm: 0 }",
    clientRegions:
      '{ id: "constanza", country: "DO", code: "CONSTANZA", name: "Constanza", lat: 18.91, lng: -70.74, zoneType: "INTERIOR", slaHours: 72, active: true }',
    serverRegions:
      '{ id: "constanza-server", country: "DO", code: "CONSTANZA", name: "Constanza", lat: 18.91, lng: -70.74, zoneType: "INTERIOR", slaHours: 72, active: true }',
    clientEngine: "synthetic client engine",
    serverEngine: "synthetic server engine",
  });
  const dryRunAfter = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."osi_geo_regions" WHERE "tenant_id"=$1`, t1);
  check("dry-run clasifica seis grupos y no escribe", !dryRun.writesPerformed && Object.keys(dryRun.totals).length === 6 && dryRunBefore[0].count === dryRunAfter[0].count);
  check("dry-run confirma COSNTANZA y reporta dudosos", dryRun.confirmedAliases.some((alias) => alias.input === "COSNTANZA" && alias.canonical === "CONSTANZA") && dryRun.questionableAliases.length >= 1);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "osi"."osi_zone_rules"("id","tenant_id","series_id","code","version","name","kind","priority","scope_key","zone_type","free_km","km_rate","currency_code","km_rate_unit","result_hash","version_hash","source","created_by_user_id","created_by_membership_id","request_id","payload_hash","state","approved_by_user_id","approved_by_membership_id","approved_at")
    SELECT 'perf-'||g||'-${run}','${t1}','perf-'||g||'-${run}','PERF_'||g||'_${upper}',1,'Performance','ZONE_TYPE_BASE',1000+g,'ZONE_TYPE_BASE:DO:PERF_'||g||':*:*:*','PERF_'||g,0,1,'DOP','AMOUNT_PER_KM',repeat('a',64),md5(g::text)||md5(g::text),'SYNTHETIC','${creator.user}','${creator.membership}','perf-'||g||'-${run}',md5((g+1)::text)||md5((g+1)::text),'SHADOW','${approver.user}','${approver.membership}',CURRENT_TIMESTAMP FROM generate_series(1,2000) g
  `);
  const started = performance.now();
  const page = await listGeoRegions(prisma, creatorContext, { limit: 50 });
  const resolveStarted = performance.now();
  await resolveRelationalLogisticsRules(prisma, systemContext, { countryCode: "DO", serviceMode: "LOCAL", zoneType: "METRO", distanceKm: 90 });
  const resolveMs = performance.now() - resolveStarted;
  const pageMs = resolveStarted - started;
  check("paginación obligatoria", page.items.length <= 50);
  check("rendimiento con 2,000 reglas sintéticas", resolveMs < 1000, `${resolveMs.toFixed(2)} ms`);

  const audits = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "osi"."commercial_audit_logs" WHERE "tenant_id"=$1 AND "source"='DB01H_LOGISTICS_GEOGRAPHY'`, t1);
  check("operaciones críticas auditadas", audits[0].count >= 15);
  const output = { passed: results.length, failed: 0, results, performance: { records: 2000, pageMs: Number(pageMs.toFixed(2)), resolveMs: Number(resolveMs.toFixed(2)) }, dryRun: dryRun.totals };
  if (process.env.DB01H_RESULTS_PATH) await writeFile(process.env.DB01H_RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
