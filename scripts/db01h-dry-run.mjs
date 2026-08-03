/* eslint-disable no-console */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizePlace, detectQuestionableAliases, normalizeGeoToken, sha256 } from "../api/_lib/geoNormalization.js";

const CLASSIFICATIONS = ["AUTOMATICALLY_CONVERTIBLE", "DUPLICATE", "CONTRADICTORY", "AMBIGUOUS", "INCOMPLETE", "OBSOLETE"];

function parseRegionLiterals(source, sourceName) {
  const pattern = /\{\s*id:\s*["']([^"']+)["'],\s*country:\s*["']([^"']+)["'],\s*code:\s*["']([^"']+)["'],\s*name:\s*["']([^"']+)["'],\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+),\s*zoneType:\s*["']([^"']+)["'],\s*slaHours:\s*(\d+),\s*active:\s*true\s*\}/g;
  return [...source.matchAll(pattern)].map((match) => ({
    source: sourceName, id: match[1], country: match[2], code: match[3], name: match[4],
    lat: Number(match[5]), lng: Number(match[6]), zoneType: match[7], slaHours: Number(match[8]),
  }));
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function analyzeLogisticsSources(root = process.cwd(), sourceOverrides = {}) {
  const files = {
    store: path.join(root, "data/logistic-engine-admin.json"),
    defaults: path.join(root, "api/admin/logistic-engine/_store.js"),
    clientRegions: path.join(root, "src/lib/geoRegionsStore.ts"),
    serverRegions: path.join(root, "api/admin/logistic-engine/_shared.js"),
    clientEngine: path.join(root, "src/core/logisticEngine.ts"),
    serverEngine: path.join(root, "api/_domain/logisticEngine.js"),
  };
  const sourceKeys = Object.keys(files);
  const [storeRaw, defaultsRaw, clientRegionsRaw, serverRegionsRaw, clientEngineRaw, serverEngineRaw] = await Promise.all(
    sourceKeys.map((key) =>
      Object.prototype.hasOwnProperty.call(sourceOverrides, key)
        ? String(sourceOverrides[key])
        : readFile(files[key], "utf8"),
    ),
  );
  const store = JSON.parse(storeRaw);
  const clientRegions = parseRegionLiterals(clientRegionsRaw, "CLIENT_DEFAULTS");
  const serverRegions = parseRegionLiterals(serverRegionsRaw, "SERVER_DEFAULTS");
  const knownCodes = [...new Set(clientRegions.map((row) => normalizeGeoToken(row.code)))];
  const records = [];

  for (const region of clientRegions) records.push({ kind: "GEO_REGION", source: region.source, key: `${region.country}:${region.code}`, classification: "AUTOMATICALLY_CONVERTIBLE", value: region });
  for (const region of serverRegions) {
    const duplicate = clientRegions.find((item) => item.country === region.country && item.code === region.code);
    records.push({ kind: "GEO_REGION", source: region.source, key: `${region.country}:${region.code}`, classification: duplicate ? "DUPLICATE" : "AUTOMATICALLY_CONVERTIBLE", value: region });
  }

  for (const zoneType of ["METRO", "INTERIOR"]) {
    const current = store.zoneTypeConfigs?.[zoneType] || store.zoneRules?.[zoneType];
    const duplicated = sameJson(store.zoneTypeConfigs?.[zoneType], store.zoneRules?.[zoneType]);
    records.push({ kind: "ZONE_RULE", source: "STORE_FILE", key: zoneType, classification: "AUTOMATICALLY_CONVERTIBLE", value: current });
    if (duplicated) records.push({ kind: "ZONE_RULE", source: "STORE_FILE_LEGACY_ALIAS", key: zoneType, classification: "DUPLICATE", value: store.zoneRules?.[zoneType] });
    const defaultMatch = defaultsRaw.match(new RegExp(`${zoneType}:[\\s\\S]{0,180}?kmRate:\\s*(\\d+)[\\s\\S]{0,100}?freeKm:\\s*(\\d+)`));
    if (defaultMatch && current && (Number(defaultMatch[1]) !== Number(current.kmRate) || Number(defaultMatch[2]) !== Number(current.freeKm))) {
      records.push({ kind: "ZONE_RULE", source: "COMPILED_DEFAULT", key: zoneType, classification: "CONTRADICTORY", reasons: ["DEFAULT_DIFFERS_FROM_STORE"] });
    }
  }

  for (const rule of store.transportRules || []) records.push({ kind: "TRANSPORT_RULE", source: "STORE_FILE", key: normalizeGeoToken(rule.zoneType), classification: "AUTOMATICALLY_CONVERTIBLE", value: rule });
  for (const [code, override] of Object.entries(store.regionOverrides || {})) {
    records.push({ kind: "REGION_OVERRIDE", source: "STORE_FILE", key: normalizeGeoToken(code), classification: knownCodes.includes(normalizeGeoToken(code)) ? "AUTOMATICALLY_CONVERTIBLE" : "AMBIGUOUS", value: override });
  }

  const highRiskZones = (store.riskRules?.highRiskZones || []).map(normalizeGeoToken);
  const aliases = highRiskZones.map((value) => {
    const normalized = canonicalizePlace(value, "DO");
    if (normalized.corrected) return { input: value, canonical: normalized.canonicalCode, kind: "TYPO_COMPATIBILITY", confirmed: true, correctedAutomatically: true };
    return { input: value, canonical: value, kind: knownCodes.includes(value) ? "CANONICAL" : "QUESTIONABLE", confirmed: knownCodes.includes(value), correctedAutomatically: false };
  });
  for (const alias of aliases) records.push({
    kind: "REGION_ALIAS", source: "STORE_FILE_RISK", key: alias.input,
    classification: alias.confirmed ? "AUTOMATICALLY_CONVERTIBLE" : "AMBIGUOUS", value: alias,
  });
  if (Object.prototype.hasOwnProperty.call(store.riskRules || {}, "autoExtendedSla")) records.push({ kind: "RISK_SETTING", source: "STORE_FILE", key: "autoExtendedSla", classification: "OBSOLETE", reasons: ["NO_RUNTIME_CONSUMER_FOUND"] });
  records.push({ kind: "LOCAL_CACHE", source: "BROWSER_LOCAL_STORAGE", key: "osi.geo-regions.local", classification: "INCOMPLETE", reasons: ["SERVER_DRY_RUN_CANNOT_READ_BROWSER_STORAGE"] });

  const questionableAliases = detectQuestionableAliases(highRiskZones, knownCodes).map((row) => ({ ...row, source: "riskRules.highRiskZones" }));
  const totals = Object.fromEntries(CLASSIFICATIONS.map((name) => [name, records.filter((row) => row.classification === name).length]));
  return {
    mode: "DRY_RUN_ONLY", writesPerformed: false,
    sourceHashes: {
      store: sha256(storeRaw), defaults: sha256(defaultsRaw), clientRegions: sha256(clientRegionsRaw),
      serverRegions: sha256(serverRegionsRaw), clientEngine: sha256(clientEngineRaw), serverEngine: sha256(serverEngineRaw),
    },
    sourceSummary: { clientDefaultRegions: clientRegions.length, serverDefaultRegions: serverRegions.length, transportRules: (store.transportRules || []).length, regionOverrides: Object.keys(store.regionOverrides || {}).length },
    confirmedAliases: aliases.filter((item) => item.confirmed), questionableAliases,
    totals, records,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = JSON.stringify(await analyzeLogisticsSources(), null, 2);
  if (process.env.DB01H_DRY_RUN_PATH) await writeFile(process.env.DB01H_DRY_RUN_PATH, `${report}\n`, "utf8");
  console.log(report);
}
