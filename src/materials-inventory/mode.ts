import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const MATERIALS_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type MaterialsUiMode = typeof MATERIALS_UI_MODES[keyof typeof MATERIALS_UI_MODES];
export function resolveMaterialsUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): MaterialsUiMode {
  const value = environment.VITE_MATERIALS_INVENTORY_UI_MODE;
  if (value === undefined || value === MATERIALS_UI_MODES.DISABLED) return MATERIALS_UI_MODES.DISABLED;
  if (value === MATERIALS_UI_MODES.LOCAL_ONLY) {
    const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_") || key === "VITE_VERCEL_ENV");
    return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : MATERIALS_UI_MODES.DISABLED;
  }
  const preview = value === MATERIALS_UI_MODES.PREVIEW_REHEARSAL
    && environment.VITE_MATERIALS_INVENTORY_UI_BATCH === "V17-MATERIALS-INVENTORY-05A-PREVIEW"
    && environment.VITE_VERCEL_ENV === "preview"
    && (environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-materials-inventory" || isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF));
  return preview ? value : MATERIALS_UI_MODES.DISABLED;
}
export function isMaterialsUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) { return resolveMaterialsUiMode(environment, hostname) !== MATERIALS_UI_MODES.DISABLED; }
