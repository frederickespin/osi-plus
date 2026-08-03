/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../api/_lib/geoNormalization.js";

function gitMetadata(root, file) {
  try {
    const value = execFileSync("git", ["log", "-1", "--format=%H|%aI|%s", "--", file], { cwd: root, encoding: "utf8" }).trim();
    const [commit, committedAt, subject] = value.split("|");
    return { commit, committedAt, subject };
  } catch { return { commit: null, committedAt: null, subject: null }; }
}

function parseMockVehicles(source) {
  const block = source.match(/export const mockVehicles = \[([\s\S]*?)\]\s+as any\[\]/)?.[1] || "";
  const objects = [...block.matchAll(/\{([\s\S]*?)\}/g)].map((match) => match[1]);
  return objects.map((body) => Object.fromEntries([...body.matchAll(/(\w+):\s*(?:"([^"]*)"|'([^']*)'|([\d.]+))/g)].map((match) => [match[1], match[2] ?? match[3] ?? Number(match[4])])));
}

async function readOptionalSource(file) {
  try {
    return { content: await readFile(file, "utf8"), missing: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { content: "", missing: true };
  }
}

export async function analyzeVehicleSources(root = process.cwd()) {
  const files = {
    store: "scripts/fixtures/db01/legacy-logistics-engine-admin.json",
    defaults: "api/admin/logistic-engine/_store.js",
    fleetStore: "src/lib/fleetStore.ts",
    mockData: "src/data/mockData.ts",
    clientAdmin: "src/lib/logisticEngineAdminApi.ts",
    clientEngine: "src/core/logisticEngine.ts",
    serverEngine: "api/_domain/logisticEngine.js",
  };
  const sourceResults = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readOptionalSource(path.join(root, file))])));
  const raw = Object.fromEntries(Object.entries(sourceResults).map(([key, result]) => [key, result.content]));
  const store = JSON.parse(raw.store);
  const mocks = parseMockVehicles(raw.mockData);
  const cacheKeys = {
    vehicles: raw.fleetStore.match(/const VEHICLES_KEY = "([^"]+)"/)?.[1] || null,
    engine: raw.clientAdmin.match(/LOCAL_STORAGE_KEY = "([^"]+)"/)?.[1] || null,
  };
  const defaultsVehicleRules = {
    blockIfNoVehicle: /vehicleRules:[\s\S]*?blockIfNoVehicle:\s*(true|false)/.exec(raw.defaults)?.[1] === "true",
    allowManualOverride: /vehicleRules:[\s\S]*?allowManualOverride:\s*(true|false)/.exec(raw.defaults)?.[1] !== "false",
    requireApprovalIfOverride: /vehicleRules:[\s\S]*?requireApprovalIfOverride:\s*(true|false)/.exec(raw.defaults)?.[1] === "true",
    distributeWearAutomatically: /vehicleRules:[\s\S]*?distributeWearAutomatically:\s*(true|false)/.exec(raw.defaults)?.[1] !== "false",
    considerUpcomingMaintenance: /vehicleRules:[\s\S]*?considerUpcomingMaintenance:\s*(true|false)/.exec(raw.defaults)?.[1] !== "false",
  };
  const sameRules = JSON.stringify(store.vehicleRules) === JSON.stringify(defaultsVehicleRules);
  const records = [
    ...mocks.map((vehicle) => ({ kind: "VEHICLE", source: "SYNTHETIC_MOCK", key: vehicle.id || vehicle.code, classification: "SAMPLE_ONLY", value: vehicle, importAutomatically: false })),
    { kind: "VEHICLE_RULES", source: "STORE_FILE", key: "GLOBAL", classification: "AUTOMATICALLY_CONVERTIBLE", value: store.vehicleRules },
    { kind: "VEHICLE_RULES", source: "COMPILED_DEFAULT", key: "GLOBAL", classification: sameRules ? "DUPLICATE" : "CONTRADICTORY", value: defaultsVehicleRules },
    { kind: "LOCAL_CACHE", source: "BROWSER_LOCAL_STORAGE", key: cacheKeys.vehicles, classification: "INCOMPLETE", reason: "REQUIRES_EXPLICIT_BROWSER_EXPORT" },
    { kind: "LOCAL_CACHE", source: "BROWSER_LOCAL_STORAGE", key: cacheKeys.engine, classification: "INCOMPLETE", reason: "REQUIRES_EXPLICIT_BROWSER_EXPORT" },
  ];
  const classifications = ["AUTOMATICALLY_CONVERTIBLE", "DUPLICATE", "CONTRADICTORY", "AMBIGUOUS", "INCOMPLETE", "OBSOLETE", "SAMPLE_ONLY"];
  const rateInvestigation = [
    { value: 57, scope: "METRO", source: files.store, property: "zoneRules/zoneTypeConfigs.METRO.kmRate", meaning: "tarifa por km sobre distancia cobrable", calculation: "max(0, distancia - km incluidos) × tasa", unitInference: "moneda configurada por km; el archivo no declara código monetario", consumers: [files.clientEngine, files.serverEngine, "src/components/admin/logistic/ZoneConfigurationSection.tsx", "api/logistics/active-config.js"] },
    { value: 55, scope: "INTERIOR", source: files.store, property: "zoneRules/zoneTypeConfigs.INTERIOR.kmRate", meaning: "tarifa por km sobre distancia cobrable", calculation: "max(0, distancia - km incluidos) × tasa, antes del recargo de zona", unitInference: "moneda configurada por km; el archivo no declara código monetario", consumers: [files.clientEngine, files.serverEngine, "src/components/admin/logistic/ZoneConfigurationSection.tsx", "api/logistics/active-config.js"] },
    { value: 220, scope: "METRO/INTERIOR", source: files.defaults, property: "DEFAULT_LOGISTIC_ENGINE_ADMIN_STORE.*.kmRate", meaning: "fallback compilado de tarifa por km", calculation: "visita por km y fallback del costo operacional del vehículo", unitInference: "moneda configurada por km; el código no fija DOP", consumers: [files.clientAdmin, files.clientEngine, files.serverEngine, "api/logistics/active-config.js", "src/components/admin/logistic/ZoneConfigurationSection.tsx"] },
  ];
  const ambiguousLocalities = [
    { value: "NAGUA", source: "riskRules.highRiskZones", reason: "No existe región canónica equivalente en el catálogo actual; faltan país, división administrativa, coordenadas y regla de zona." },
    { value: "LAS_TERRENAS", source: "riskRules.highRiskZones", reason: "Es texto libre sin región canónica, país, división administrativa, coordenadas ni regla de zona aprobada." },
    { value: "LUPERON", source: "riskRules.highRiskZones", reason: "Requiere confirmar el código canónico y la forma con tilde LUPERÓN, además de sus datos geográficos." },
    { value: "MONTE_CRISTI", source: "riskRules.highRiskZones", reason: "Requiere confirmar si representa municipio, provincia u otra cobertura y asignar código/datos geográficos canónicos." },
  ].map((row) => ({ ...row, imported: false, administrativeDecision: "Aprobar código, nombre, país, división, alias, coordenadas y zona antes de importar." }));
  return {
    mode: "DRY_RUN_ONLY", writesPerformed: false,
    missingSources: Object.entries(sourceResults).filter(([, result]) => result.missing).map(([key]) => files[key]),
    browserDataRead: false,
    reason: "El servidor no puede seleccionar ni leer el localStorage de un navegador sin exportación administrativa explícita.",
    sourceHashes: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, sha256(value)])),
    sourceGit: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, gitMetadata(root, file)])),
    cacheKeys, sourceSummary: { syntheticVehicles: mocks.length, vehicleRulesMatchDefaults: sameRules },
    totals: Object.fromEntries(classifications.map((name) => [name, records.filter((row) => row.classification === name).length])),
    rateInvestigation, ambiguousLocalities, records,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = JSON.stringify(await analyzeVehicleSources(), null, 2);
  if (process.env.DB01I_DRY_RUN_PATH) await writeFile(process.env.DB01I_DRY_RUN_PATH, `${report}\n`, "utf8");
  console.log(report);
}
