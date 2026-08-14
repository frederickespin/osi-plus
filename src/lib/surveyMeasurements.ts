export type SurveyShipmentMode = "AIR" | "SEA" | "LOCAL" | "STORAGE";

export const AIR_SURVEY_DENSITY_KG_M3 = 166;
export const STANDARD_SURVEY_DENSITY_KG_M3 = 100;

export function roundSurveyMeasurement(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function resolveSurveyShipmentMode(...values: unknown[]): SurveyShipmentMode {
  const haystack = normalizeText(values.filter(Boolean).join(" "));
  if (/\bair\b|aereo|airfreight|air freight/.test(haystack)) return "AIR";
  if (/maritimo|maritime|ocean|\bsea\b|lcl|fcl/.test(haystack)) return "SEA";
  if (/almacenaje|almacen|storage|warehouse/.test(haystack)) return "STORAGE";
  return "LOCAL";
}

export function resolveSurveyDensityKgM3(mode?: SurveyShipmentMode | string | null) {
  return String(mode || "").toUpperCase() === "AIR"
    ? AIR_SURVEY_DENSITY_KG_M3
    : STANDARD_SURVEY_DENSITY_KG_M3;
}

export function calculateSurveyVolumeFromDimensionsCm(
  lengthCm: unknown,
  widthCm: unknown,
  heightCm: unknown,
) {
  const length = Math.max(0, Number(lengthCm || 0));
  const width = Math.max(0, Number(widthCm || 0));
  const height = Math.max(0, Number(heightCm || 0));
  if (length <= 0 || width <= 0 || height <= 0) return 0;
  return roundSurveyMeasurement((length * width * height) / 1_000_000, 3);
}

export function calculateSurveyWeightFromVolume(
  volumeM3: unknown,
  densityKgM3: unknown,
) {
  const volume = Math.max(0, Number(volumeM3 || 0));
  const density = Math.max(0, Number(densityKgM3 || 0));
  if (volume <= 0 || density <= 0) return 0;
  return roundSurveyMeasurement(volume * density, 2);
}

export function calculateSurveyVolumeFromWeight(
  weightKg: unknown,
  densityKgM3: unknown,
) {
  const weight = Math.max(0, Number(weightKg || 0));
  const density = Math.max(0, Number(densityKgM3 || 0));
  if (weight <= 0 || density <= 0) return 0;
  return roundSurveyMeasurement(weight / density, 3);
}
