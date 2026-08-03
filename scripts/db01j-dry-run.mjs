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

function extracts(source) {
  return {
    currencyTokens: [...new Set([...source.matchAll(/currency\s*:\s*["']([^"']+)/g)].map((match) => match[1]))],
    localStorageKeys: [...new Set([...source.matchAll(/(?:LS_CURRENT|LS_HISTORY|KEY)\s*=\s*["']([^"']+)/g)].map((match) => match[1]))],
    numericDefaults: [...source.matchAll(/(?:ratePerHour|hoursPerBox|maxItemsPerBox|similarityTolerancePct)\s*:\s*([\d.]+)/g)].map((match) => Number(match[1])),
  };
}

export async function analyzeCrateSettingsSources(root = process.cwd()) {
  const files = {
    clientSettings: "src/lib/crateSettingsStore.ts",
    serverFallback: "api/crate-settings/index.ts",
    legacyBrowserStore: "app/src/lib/crateSettingsStore.ts",
    engine: "src/lib/crateEngine.ts",
    settingsUi: "src/modules/CrateSettingsModule.tsx",
    nestingLegacy: "src/data/nestingMockData.ts",
    nestingV2: "src/lib/nestingV2.ts",
    materialCatalog: "src/lib/logisticsMaterialCatalogStore.ts",
    crateDraftStore: "src/lib/crateDraftStore.ts",
  };
  const raw = {};
  for (const [key, file] of Object.entries(files)) {
    try { raw[key] = await readFile(path.join(root, file), "utf8"); }
    catch { raw[key] = ""; }
  }
  const clientHash = sha256(raw.clientSettings);
  const serverHash = sha256(raw.serverFallback);
  const records = [
    { source: files.clientSettings, classification: "AMBIGUOUS", reason: "Defaults completos, pero la moneda RD$ no es ISO-4217 y no puede asumirse DOP." },
    { source: files.serverFallback, classification: clientHash === serverHash ? "DUPLICATE" : "CONTRADICTORY", reason: "Fallback de API y defaults del cliente no son una única versión canónica." },
    { source: files.legacyBrowserStore, classification: "INCOMPLETE", reason: "El servidor no puede leer localStorage; requiere exportación explícita y moneda ISO." },
    { source: files.nestingLegacy, classification: "AMBIGUOUS", reason: "Parámetros y costos de nesting independientes; comentarios históricos usan BOB y no hay vínculo de versión." },
    { source: files.nestingV2, classification: "AMBIGUOUS", reason: "Configuración técnica independiente sin contrato de conversión aprobado a CrateSettings." },
    { source: files.materialCatalog, classification: "CONVERTIBLE", reason: "Catálogo formal reutilizable: importar sólo referencias, no duplicar materiales ni costos." },
    { source: files.crateDraftStore, classification: "INCOMPLETE", reason: "Borradores locales guardan settingsVersionId, pero no hash ni snapshot completo." },
  ];
  const activeConsumers = {
    quoteCrateModule: ["src/modules/CrateWoodModule.tsx", "src/modules/crate-wood/useCrateServiceCostingPolicy.ts"],
    nesting: [files.engine, "src/modules/crate-wood/CrateEngineeringPanel.tsx"],
    design2d3d: ["src/modules/CrateWoodModule.tsx"],
    materials: [files.engine, files.materialCatalog],
    costing: [files.engine, "src/modules/crate-wood/CrateCostingPanel.tsx"],
    labels: [], pdf: [], osiOdt: [],
  };
  const classifications = ["CONVERTIBLE", "DUPLICATE", "CONTRADICTORY", "AMBIGUOUS", "INCOMPLETE", "OBSOLETE", "WITHOUT_ACTIVE_CONSUMER"];
  return {
    mode: "DRY_RUN_ONLY", writesPerformed: false, browserDataRead: false, productionAccessed: false,
    sourceHashes: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, sha256(value)])),
    sourceGit: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, gitMetadata(root, file)])),
    sourceExtracts: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, extracts(value)])),
    totals: Object.fromEntries(classifications.map((name) => [name, records.filter((row) => row.classification === name).length])),
    activeConsumers,
    rateMetadata: {
      valuesImported: [], currencyAssumed: false,
      zoneRuleBeforeDb01j: { currency: false, amountPerKmUnit: false, validity: true, source: true, version: true, approver: true },
      transportRuleBeforeDb01j: { currency: false, amountPerKmUnit: "NOT_APPLICABLE_TO_CURRENT_FIELDS", validity: true, source: true, version: true, approver: true },
      correctiveMigration: "20260801009000_logistics_rate_metadata",
    },
    records,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = JSON.stringify(await analyzeCrateSettingsSources(), null, 2);
  if (process.env.DB01J_DRY_RUN_PATH) await writeFile(process.env.DB01J_DRY_RUN_PATH, `${report}\n`, "utf8");
  console.log(report);
}
