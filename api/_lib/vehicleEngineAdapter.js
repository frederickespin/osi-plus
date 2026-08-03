import { compareVehicleEngineShadow } from "./vehicleEngineSettings.js";

export function vehicleEngineIntegrationMode(env = process.env) {
  const requested = String(env.DB01I_VEHICLE_ENGINE_MODE || "LEGACY_ONLY").toUpperCase();
  return requested === "LEGACY_ONLY" ? "LEGACY_ONLY" : "LEGACY_ONLY";
}

export async function evaluateVehicleEngineCompatibility({ legacyEvaluate, relationalPreview, mode = vehicleEngineIntegrationMode() }) {
  if (typeof legacyEvaluate !== "function") throw new TypeError("legacyEvaluate es obligatorio.");
  const legacyResult = await legacyEvaluate();
  if (mode !== "SHADOW") return { mode: "LEGACY_ONLY", authority: "LEGACY", effectsApplied: false, result: legacyResult };
  const relational = typeof relationalPreview === "function" ? await relationalPreview() : relationalPreview;
  return {
    mode: "SHADOW_PREVIEW_ONLY",
    authority: "LEGACY",
    effectsApplied: false,
    result: legacyResult,
    shadow: compareVehicleEngineShadow(legacyResult?.vehicleRules || legacyResult, relational?.vehicleRules || relational || {}),
  };
}
