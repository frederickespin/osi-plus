import { canonicalJson, sha256 } from "./geoNormalization.js";
import { LogisticsGeoError, asDate, optionalText, requiredText } from "./logisticsGeoSupport.js";

const PROFILES = ["STANDARD_LOCAL", "EXPORT_ISPM15", "PREMIUM_ART_IT", "MACHINERY_ISPM15"];
const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_CATALOG_REFS = 100;

function invalid(message) {
  throw new LogisticsGeoError(message, { code: "CRATE_SETTINGS_INPUT_INVALID", status: 400 });
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${field} debe ser un objeto.`);
  return value;
}

function bool(value, field) {
  if (typeof value !== "boolean") invalid(`${field} debe ser booleano.`);
  return value;
}

function number(value, field, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) invalid(`${field} no es válido.`);
  return parsed;
}

function numericList(value, field, options = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) invalid(`${field} debe contener entre 1 y 50 elementos.`);
  return [...new Set(value.map((item, index) => number(item, `${field}[${index}]`, options)))].sort((a, b) => a - b);
}

function exactKeys(value, field, keys) {
  const source = object(value, field);
  const unexpected = Object.keys(source).filter((key) => !keys.includes(key));
  if (unexpected.length) invalid(`${field} contiene parámetros sin consumidor activo: ${unexpected.join(", ")}.`);
  return source;
}

function dimension(value, field) {
  const source = exactKeys(value, field, ["w", "h"]);
  return { w: number(source.w, `${field}.w`, { min: 0.001 }), h: number(source.h, `${field}.h`, { min: 0.001 }) };
}

function validateTechnical(input) {
  const technical = exactKeys(input, "technical", ["materials", "nesting", "protectionByFragility", "engineering"]);
  const materials = exactKeys(technical.materials, "technical.materials", ["lumber", "plywood", "foam", "cardboard"]);
  const lumber = exactKeys(materials.lumber, "technical.materials.lumber", ["lengthsIn", "types"]);
  const lumberTypes = Array.isArray(lumber.types) ? [...new Set(lumber.types)] : [];
  if (!lumberTypes.length || lumberTypes.some((item) => !["1x4", "2x4"].includes(item))) invalid("Tipos de listón inválidos.");
  const plywood = exactKeys(materials.plywood, "technical.materials.plywood", ["sheetSizeIn", "thicknessOptionsIn"]);
  const foam = exactKeys(materials.foam, "technical.materials.foam", ["sheetSizeIn", "thicknessOptionsIn"]);
  const cardboard = exactKeys(materials.cardboard, "technical.materials.cardboard", ["thicknessIn"]);
  const nesting = exactKeys(technical.nesting, "technical.nesting", ["maxDepthForNestingCm", "maxItemsPerBox", "similarityTolerancePct", "allowRotationDefault"]);
  const protections = Array.isArray(technical.protectionByFragility) ? technical.protectionByFragility : [];
  if (protections.length !== 5) invalid("Debe existir una protección para cada fragilidad 1 a 5.");
  const seenFragility = new Set();
  const protectionByFragility = protections.map((entry, index) => {
    const item = exactKeys(entry, `technical.protectionByFragility[${index}]`, ["fragility", "perimeterFoamIn", "betweenItemsFoamIn", "cardboardIn", "doublePerimeter"]);
    const fragility = number(item.fragility, "fragility", { min: 1, max: 5, integer: true });
    if (seenFragility.has(fragility)) invalid("Fragilidad duplicada.");
    seenFragility.add(fragility);
    return {
      fragility,
      perimeterFoamIn: number(item.perimeterFoamIn, "perimeterFoamIn", { min: 0 }),
      betweenItemsFoamIn: number(item.betweenItemsFoamIn, "betweenItemsFoamIn", { min: 0 }),
      cardboardIn: number(item.cardboardIn, "cardboardIn", { min: 0 }),
      doublePerimeter: bool(item.doublePerimeter, "doublePerimeter"),
    };
  }).sort((a, b) => a.fragility - b.fragility);
  const engineering = exactKeys(technical.engineering, "technical.engineering", ["thresholds", "plywoodThicknessByProfileIn", "profileDefaults"]);
  const thresholds = exactKeys(engineering.thresholds, "technical.engineering.thresholds", [
    "use2x4IfWeightLbAbove", "use2x4IfLongestSideInAbove", "skidIfWeightLbAbove", "skidIfLongestSideInAbove",
    "addRibsIfLongestSideInAbove", "addXBracingIfAspectRatioAbove",
  ]);
  const plywoodByProfile = exactKeys(engineering.plywoodThicknessByProfileIn, "technical.engineering.plywoodThicknessByProfileIn", PROFILES);
  const defaults = exactKeys(engineering.profileDefaults, "technical.engineering.profileDefaults", PROFILES);
  return {
    materials: {
      lumber: { lengthsIn: numericList(lumber.lengthsIn, "lengthsIn", { min: 0.001 }), types: lumberTypes.sort() },
      plywood: { sheetSizeIn: dimension(plywood.sheetSizeIn, "plywood.sheetSizeIn"), thicknessOptionsIn: numericList(plywood.thicknessOptionsIn, "plywood.thicknessOptionsIn", { min: 0.001 }) },
      foam: { sheetSizeIn: dimension(foam.sheetSizeIn, "foam.sheetSizeIn"), thicknessOptionsIn: numericList(foam.thicknessOptionsIn, "foam.thicknessOptionsIn", { min: 0.001 }) },
      cardboard: { thicknessIn: number(cardboard.thicknessIn, "cardboard.thicknessIn", { min: 0 }) },
    },
    nesting: {
      maxDepthForNestingCm: number(nesting.maxDepthForNestingCm, "maxDepthForNestingCm", { min: 0.001 }),
      maxItemsPerBox: number(nesting.maxItemsPerBox, "maxItemsPerBox", { min: 1, max: 1000, integer: true }),
      similarityTolerancePct: number(nesting.similarityTolerancePct, "similarityTolerancePct", { min: 0, max: 100 }),
      allowRotationDefault: bool(nesting.allowRotationDefault, "allowRotationDefault"),
    },
    protectionByFragility,
    engineering: {
      thresholds: Object.fromEntries(Object.entries(thresholds).map(([key, value]) => [key, number(value, key, { min: key === "addXBracingIfAspectRatioAbove" ? 0.001 : 0 })])),
      plywoodThicknessByProfileIn: Object.fromEntries(PROFILES.map((key) => [key, number(plywoodByProfile[key], key, { min: 0.001 })])),
      profileDefaults: Object.fromEntries(PROFILES.map((key) => {
        const entry = exactKeys(defaults[key], `profileDefaults.${key}`, ["minFragility", "ispm15Required", "defaultLumber", "skidPreferred"]);
        if (!["1x4", "2x4"].includes(entry.defaultLumber)) invalid(`defaultLumber inválido para ${key}.`);
        return [key, {
          minFragility: number(entry.minFragility, "minFragility", { min: 1, max: 5, integer: true }),
          ispm15Required: bool(entry.ispm15Required, "ispm15Required"),
          defaultLumber: entry.defaultLumber,
          skidPreferred: bool(entry.skidPreferred, "skidPreferred"),
        }];
      })),
    },
  };
}

function numericRecord(value, field, keys, options = {}) {
  const source = exactKeys(value, field, keys);
  return Object.fromEntries(keys.map((key) => [key, number(source[key], `${field}.${key}`, options)]));
}

function validateEconomic(input) {
  const economic = exactKeys(input, "economic", ["pricing", "adders"]);
  const pricing = exactKeys(economic.pricing, "economic.pricing", ["rounding", "wastePctByMaterial", "labor", "unitCosts", "markupPctByProfile"]);
  const rounding = exactKeys(pricing.rounding, "pricing.rounding", ["stepUnits", "mode", "hoursRule"]);
  if (rounding.mode !== "UP" || rounding.hoursRule !== "HALF_HOUR_UP") invalid("Regla de redondeo no soportada por el motor actual.");
  const labor = exactKeys(pricing.labor, "pricing.labor", ["enabled", "ratePerHour", "hoursPerBox"]);
  const costs = exactKeys(pricing.unitCosts, "pricing.unitCosts", ["lumberPerStick", "plywoodPerSheetByThicknessIn", "foamPerSheetByThicknessIn", "cardboardPerSheet"]);
  const recordCosts = (value, field) => Object.fromEntries(Object.entries(object(value, field)).map(([key, amount]) => [key, number(amount, `${field}.${key}`, { min: 0 })]).sort(([a], [b]) => a.localeCompare(b)));
  const adders = exactKeys(economic.adders, "economic.adders", ["fumigation", "fasteners", "cornerProtectors"]);
  const fumigation = exactKeys(adders.fumigation, "adders.fumigation", ["enabled", "mode", "rate", "transportToPlantEnabled", "transportToPlantRate", "markingIppcEnabled", "markingIppcRatePerBox"]);
  if (!["FIXED", "PER_M3", "PER_BOX"].includes(fumigation.mode)) invalid("Modo de fumigación inválido.");
  const fasteners = exactKeys(adders.fasteners, "adders.fasteners", ["enabled", "mode", "boxVolumeThresholdsIn3", "rateBySize", "ratePerSheet"]);
  if (!["FIXED_PER_BOX", "PER_SHEET"].includes(fasteners.mode)) invalid("Modo de fijaciones inválido.");
  const thresholds = numericRecord(fasteners.boxVolumeThresholdsIn3, "boxVolumeThresholdsIn3", ["smallMax", "mediumMax"], { min: 0.001 });
  if (thresholds.mediumMax <= thresholds.smallMax) invalid("El límite mediano debe superar al pequeño.");
  const corners = exactKeys(adders.cornerProtectors, "adders.cornerProtectors", ["enabled", "ratePerBox"]);
  return {
    pricing: {
      rounding: { stepUnits: number(rounding.stepUnits, "stepUnits", { min: 0.001 }), mode: rounding.mode, hoursRule: rounding.hoursRule },
      wastePctByMaterial: numericRecord(pricing.wastePctByMaterial, "wastePctByMaterial", ["plywood", "lumber", "foam"], { min: 0, max: 1 }),
      labor: { enabled: bool(labor.enabled, "labor.enabled"), ratePerHour: number(labor.ratePerHour, "ratePerHour", { min: 0 }), hoursPerBox: number(labor.hoursPerBox, "hoursPerBox", { min: 0 }) },
      unitCosts: {
        lumberPerStick: numericRecord(costs.lumberPerStick, "lumberPerStick", ["1x4", "2x4"], { min: 0 }),
        plywoodPerSheetByThicknessIn: recordCosts(costs.plywoodPerSheetByThicknessIn, "plywoodPerSheetByThicknessIn"),
        foamPerSheetByThicknessIn: recordCosts(costs.foamPerSheetByThicknessIn, "foamPerSheetByThicknessIn"),
        cardboardPerSheet: number(costs.cardboardPerSheet, "cardboardPerSheet", { min: 0 }),
      },
      markupPctByProfile: numericRecord(pricing.markupPctByProfile, "markupPctByProfile", PROFILES, { min: 0, max: 5 }),
    },
    adders: {
      fumigation: {
        enabled: bool(fumigation.enabled, "fumigation.enabled"), mode: fumigation.mode,
        rate: number(fumigation.rate, "fumigation.rate", { min: 0 }),
        transportToPlantEnabled: bool(fumigation.transportToPlantEnabled, "transportToPlantEnabled"),
        transportToPlantRate: number(fumigation.transportToPlantRate, "transportToPlantRate", { min: 0 }),
        markingIppcEnabled: bool(fumigation.markingIppcEnabled, "markingIppcEnabled"),
        markingIppcRatePerBox: number(fumigation.markingIppcRatePerBox, "markingIppcRatePerBox", { min: 0 }),
      },
      fasteners: {
        enabled: bool(fasteners.enabled, "fasteners.enabled"), mode: fasteners.mode, boxVolumeThresholdsIn3: thresholds,
        rateBySize: numericRecord(fasteners.rateBySize, "rateBySize", ["small", "medium", "large"], { min: 0 }),
        ratePerSheet: number(fasteners.ratePerSheet, "ratePerSheet", { min: 0 }),
      },
      cornerProtectors: { enabled: bool(corners.enabled, "cornerProtectors.enabled"), ratePerBox: number(corners.ratePerBox, "cornerProtectors.ratePerBox", { min: 0 }) },
    },
  };
}

function validateCatalogRefs(input) {
  if (!Array.isArray(input) || input.length > MAX_CATALOG_REFS) invalid(`catalogRefs admite hasta ${MAX_CATALOG_REFS} referencias.`);
  const refs = input.map((item, index) => {
    const source = exactKeys(item, `catalogRefs[${index}]`, ["catalog", "code", "purpose"]);
    return { catalog: requiredText(source.catalog, "catalog", 80).toUpperCase(), code: requiredText(source.code, "code", 120), purpose: requiredText(source.purpose, "purpose", 120).toUpperCase() };
  });
  const unique = new Map(refs.map((item) => [`${item.catalog}:${item.code}:${item.purpose}`, item]));
  return [...unique.values()].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}

function validateUnits(input) {
  const source = exactKeys(input, "units", ["inputLength", "engineeringLength", "inputWeight", "engineeringWeight", "volume"]);
  const values = {
    inputLength: String(source.inputLength || "").toUpperCase(), engineeringLength: String(source.engineeringLength || "").toUpperCase(),
    inputWeight: String(source.inputWeight || "").toUpperCase(), engineeringWeight: String(source.engineeringWeight || "").toUpperCase(), volume: String(source.volume || "").toUpperCase(),
  };
  if (!["CM", "IN"].includes(values.inputLength) || values.engineeringLength !== "IN" || !["KG", "LB"].includes(values.inputWeight) || values.engineeringWeight !== "LB" || !["CBM", "CFT"].includes(values.volume)) invalid("Unidades incompatibles con el motor actual.");
  return values;
}

export function normalizeCrateSettingsInput(input = {}) {
  const operationMode = String(input.operationMode || "LEGACY_ONLY").toUpperCase();
  if (!['LEGACY_ONLY', 'SHADOW', 'ENFORCED'].includes(operationMode)) invalid("Modo inválido.");
  const currencyCode = String(input.currencyCode || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) invalid("currencyCode ISO-4217 explícito es obligatorio.");
  const technical = validateTechnical(input.technical);
  const economic = validateEconomic(input.economic);
  const catalogRefs = validateCatalogRefs(input.catalogRefs || []);
  const units = validateUnits(input.units);
  const schemaVersion = number(input.schemaVersion ?? 1, "schemaVersion", { min: 1, integer: true });
  const configuration = { schemaVersion, technical, economic, catalogRefs, units, currencyCode };
  if (Buffer.byteLength(canonicalJson(configuration), "utf8") > MAX_CONFIG_BYTES) invalid("La configuración excede 256 KiB.");
  const validFrom = asDate(input.validFrom, "validFrom");
  const validTo = asDate(input.validTo, "validTo");
  if (validFrom && validTo && validTo <= validFrom) invalid("Vigencia inválida.");
  return {
    code: requiredText(input.code, "code", 80), normalizedCode: requiredText(input.code, "code", 80).trim().toUpperCase(),
    name: requiredText(input.name, "name", 180), scope: requiredText(input.scope || "GLOBAL", "scope", 120).toUpperCase(),
    schemaVersion, operationMode, technical, economic, catalogRefs, units, currencyCode, configuration,
    configurationHash: sha256(canonicalJson(configuration)), validFrom, validTo,
    source: requiredText(input.source || "ADMIN", "source", 120).toUpperCase(),
    evidence: input.evidence && typeof input.evidence === "object" && !Array.isArray(input.evidence) ? input.evidence : {},
    replacesSettingsId: optionalText(input.replacesSettingsId, 191),
  };
}

export function convertCrateLength(value, from, to) {
  const numberValue = number(value, "value");
  if (from === to) return numberValue;
  if (from === "CM" && to === "IN") return numberValue / 2.54;
  if (from === "IN" && to === "CM") return numberValue * 2.54;
  invalid("Conversión de longitud no soportada.");
}

export function convertCrateWeight(value, from, to) {
  const numberValue = number(value, "value");
  if (from === to) return numberValue;
  if (from === "KG" && to === "LB") return numberValue * 2.2046226218;
  if (from === "LB" && to === "KG") return numberValue / 2.2046226218;
  invalid("Conversión de peso no soportada.");
}

export const __crateValidationInternals = Object.freeze({ MAX_CONFIG_BYTES, MAX_CATALOG_REFS, PROFILES, validateTechnical, validateEconomic, validateUnits });
