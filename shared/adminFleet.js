import { isV17ConsolidatedPreviewBranch } from "./v17ConsolidatedPreview.js";

export function isAdminFleetPreviewBranch(branch) {
  return branch === "feature/v17-administration-fleet-19d" || isV17ConsolidatedPreviewBranch(branch);
}

export const ADMIN_FLEET_BATCH = "V17-ADMINISTRATION-FLEET-19D";
export const ADMIN_FLEET_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const ADMIN_FLEET_STATUSES = Object.freeze(["AVAILABLE", "IN_USE", "UNAVAILABLE", "RETIRED"]);
export const ADMIN_FLEET_WEIGHT_UNITS = Object.freeze(["KG", "LB"]);
export const ADMIN_FLEET_VOLUME_UNITS = Object.freeze(["CBM", "CFT"]);
export const ADMIN_FLEET_DIMENSION_UNITS = Object.freeze(["M", "CM", "FT", "IN"]);
export const ADMIN_FLEET_TRANSIT_CONFIGURATION_LABELS = Object.freeze({
  RIGID: "Vehículo rígido",
  TRACTOR_SEMITRAILER: "Cabezote con semirremolque",
  DOUBLE_TRAILER: "Doble remolque",
});
export const ADMIN_FLEET_TRANSIT_CONFIGURATIONS = Object.freeze(Object.keys(ADMIN_FLEET_TRANSIT_CONFIGURATION_LABELS));

const DIMENSION_TO_METRES = Object.freeze({ M: 1, CM: 0.01, FT: 0.3048, IN: 0.0254 });
const VOLUME_LENGTH_TO_METRES = Object.freeze({ CBM: 1, CFT: 0.3048 });

export function calculateFleetLoadVolume({ usableLength, usableWidth, usableHeight, dimensionUnit, volumeUnit }) {
  if (usableLength === null || usableWidth === null || usableHeight === null) return null;
  const scale = DIMENSION_TO_METRES[dimensionUnit] / VOLUME_LENGTH_TO_METRES[volumeUnit];
  const tenths = usableLength * usableWidth * usableHeight * scale ** 3 * 10;
  return Math.round(tenths + tenths * Number.EPSILON) / 10;
}
