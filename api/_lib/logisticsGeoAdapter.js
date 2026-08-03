import { compareLegacyToShadow, resolveRelationalLogisticsRules } from "./logisticsZoneRules.js";

export const LOGISTICS_GEO_MODES = Object.freeze({
  LEGACY_ONLY: "LEGACY_ONLY",
  SHADOW: "SHADOW",
  ENFORCED: "ENFORCED",
});

export function logisticsGeoIntegrationMode(env = process.env) {
  if (String(env.DB01H_LOGISTICS_GEO_ENABLED || "false").toLowerCase() !== "true") return LOGISTICS_GEO_MODES.LEGACY_ONLY;
  if (String(env.DB01H_LOGISTICS_GEO_SHADOW || "false").toLowerCase() === "true") return LOGISTICS_GEO_MODES.SHADOW;
  return LOGISTICS_GEO_MODES.LEGACY_ONLY;
}

/**
 * Adaptador experimental no importado por rutas activas.
 * El contexto empresarial debe ser construido por autenticación del servidor.
 */
export async function evaluateLogisticsWithCompatibility({
  prisma,
  context,
  input,
  legacyEvaluate,
  mode = logisticsGeoIntegrationMode(),
}) {
  if (typeof legacyEvaluate !== "function") throw new TypeError("legacyEvaluate es obligatorio");
  const legacy = await legacyEvaluate(input);
  if (mode === LOGISTICS_GEO_MODES.LEGACY_ONLY) {
    return { authority: "LEGACY", result: legacy, shadow: null, effectsApplied: true };
  }
  const preview = await resolveRelationalLogisticsRules(prisma, context, input);
  const relational = {
    ...(preview.selectedZones?.[0] || {}),
    ...(preview.selectedTransport || {}),
  };
  return {
    authority: "LEGACY",
    result: legacy,
    shadow: compareLegacyToShadow(legacy, relational),
    effectsApplied: true,
  };
}
