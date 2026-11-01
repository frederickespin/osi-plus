import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const WAREHOUSE_CONFIGURATION_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type WarehouseConfigurationUiMode = typeof WAREHOUSE_CONFIGURATION_UI_MODES[keyof typeof WAREHOUSE_CONFIGURATION_UI_MODES];

export function resolveWarehouseConfigurationUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): WarehouseConfigurationUiMode {
  const value = environment.VITE_WAREHOUSE_CONFIGURATION_UI_MODE;
  if (value === undefined || value === WAREHOUSE_CONFIGURATION_UI_MODES.DISABLED) return WAREHOUSE_CONFIGURATION_UI_MODES.DISABLED;
  if (value === WAREHOUSE_CONFIGURATION_UI_MODES.LOCAL_ONLY) {
    const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_") || key === "VITE_VERCEL_ENV");
    return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : WAREHOUSE_CONFIGURATION_UI_MODES.DISABLED;
  }
  const preview = value === WAREHOUSE_CONFIGURATION_UI_MODES.PREVIEW_REHEARSAL
    && environment.VITE_WAREHOUSE_CONFIGURATION_UI_BATCH === "V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW"
    && environment.VITE_VERCEL_ENV === "preview"
    && isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF);
  return preview ? value : WAREHOUSE_CONFIGURATION_UI_MODES.DISABLED;
}

export function isWarehouseConfigurationUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) {
  return resolveWarehouseConfigurationUiMode(environment, hostname) !== WAREHOUSE_CONFIGURATION_UI_MODES.DISABLED;
}
