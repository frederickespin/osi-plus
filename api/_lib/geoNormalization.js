import { createHash } from "node:crypto";

export const CONFIRMED_GEO_ALIASES = Object.freeze({
  DO: Object.freeze({ COSNTANZA: "CONSTANZA" }),
});

export function canonicalJson(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function normalizeGeoToken(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function normalizeGeoName(value) {
  return normalizeGeoToken(value).replace(/_/g, " ");
}

export function canonicalizePlace(value, countryCode = "DO", aliases = CONFIRMED_GEO_ALIASES) {
  const country = normalizeGeoToken(countryCode).slice(0, 2) || "DO";
  const normalizedInput = normalizeGeoToken(value);
  const canonicalCode = aliases?.[country]?.[normalizedInput] || normalizedInput;
  return {
    countryCode: country,
    normalizedInput,
    canonicalCode,
    corrected: canonicalCode !== normalizedInput,
    aliasKind: canonicalCode !== normalizedInput ? "TYPO_COMPATIBILITY" : null,
  };
}

function aliasObject(value, kind = "HISTORICAL") {
  const alias = String(value ?? "").trim();
  const normalizedAlias = normalizeGeoToken(alias);
  return normalizedAlias ? { alias, normalizedAlias, kind } : null;
}

export function normalizeGeoRegionInput(input = {}) {
  const countryCode = normalizeGeoToken(input.countryCode || input.country || "DO").slice(0, 2);
  const canonical = canonicalizePlace(input.code, countryCode);
  const code = canonical.canonicalCode;
  const name = String(input.name || code.replace(/_/g, " ")).trim();
  const aliasMap = new Map();
  const add = (value, kind) => {
    const row = aliasObject(value, kind);
    if (row && !aliasMap.has(row.normalizedAlias)) aliasMap.set(row.normalizedAlias, row);
  };
  add(code, "CANONICAL");
  add(name, "CANONICAL");
  for (const row of Array.isArray(input.aliases) ? input.aliases : []) {
    if (row && typeof row === "object") add(row.alias, row.kind || "HISTORICAL");
    else add(row, "HISTORICAL");
  }
  if (code === "CONSTANZA") add("COSNTANZA", "TYPO_COMPATIBILITY");
  const latitude = Number(input.latitude ?? input.lat);
  const longitude = Number(input.longitude ?? input.lng);
  if (!countryCode || !code || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new TypeError("Región inválida: país, código, nombre y coordenadas son obligatorios.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new TypeError("Coordenadas fuera de rango.");
  }
  return {
    countryCode,
    code,
    normalizedCode: normalizeGeoToken(code),
    name,
    normalizedName: normalizeGeoName(name),
    administrativeDivision: input.administrativeDivision == null ? null : String(input.administrativeDivision).trim() || null,
    regionType: normalizeGeoToken(input.regionType || "ADMINISTRATIVE"),
    zoneType: normalizeGeoToken(input.zoneType || "INTERIOR"),
    latitude,
    longitude,
    slaHours: input.slaHours == null ? null : Number(input.slaHours),
    geography: input.geography && typeof input.geography === "object" && !Array.isArray(input.geography) ? input.geography : {},
    aliases: [...aliasMap.values()].sort((a, b) => a.normalizedAlias.localeCompare(b.normalizedAlias)),
    correctionApplied: canonical.corrected,
  };
}

export function detectQuestionableAliases(values, knownCanonicalCodes, countryCode = "DO") {
  const known = new Set((knownCanonicalCodes || []).map(normalizeGeoToken));
  return [...new Set((values || []).map(normalizeGeoToken).filter(Boolean))]
    .filter((value) => {
      const canonical = canonicalizePlace(value, countryCode);
      return !canonical.corrected && !known.has(canonical.canonicalCode);
    })
    .map((value) => ({ value, classification: "AMBIGUOUS", correctedAutomatically: false }));
}
