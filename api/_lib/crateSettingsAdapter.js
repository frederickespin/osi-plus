import { LogisticsGeoError } from "./logisticsGeoSupport.js";
import { compareCrateSettingsShadow } from "./crateSettingsVersioned.js";

export const CRATE_SETTINGS_INTEGRATION = Object.freeze({
  defaultMode: "LEGACY_ONLY",
  relationalReadsEnabled: false,
  dualWriteEnabled: false,
  shadowEnabled: false,
  enforcedEnabled: false,
});

export function resolveCrateCalculationAuthority({ legacySettings, relationalSettings, requestedMode = "LEGACY_ONLY" }) {
  const mode = String(requestedMode || "LEGACY_ONLY").toUpperCase();
  if (mode === "LEGACY_ONLY") return { authority: "LEGACY", settings: legacySettings, effectsApplied: false, comparison: null };
  if (mode === "SHADOW") {
    if (!CRATE_SETTINGS_INTEGRATION.shadowEnabled) {
      return { authority: "LEGACY", settings: legacySettings, effectsApplied: false, comparison: compareCrateSettingsShadow(legacySettings, relationalSettings), disabled: true };
    }
    return { authority: "LEGACY", settings: legacySettings, effectsApplied: false, comparison: compareCrateSettingsShadow(legacySettings, relationalSettings) };
  }
  if (mode === "ENFORCED") throw new LogisticsGeoError("ENFORCED permanece deshabilitado.", { code: "CRATE_SETTINGS_ENFORCED_DISABLED", status: 409 });
  throw new LogisticsGeoError("Modo de integración inválido.", { code: "CRATE_SETTINGS_MODE_INVALID", status: 400 });
}
