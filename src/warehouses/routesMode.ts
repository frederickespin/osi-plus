import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";
import { isWarehouseSheetUiEnabled } from "./sheetMode";

export const WAREHOUSE_ROUTES_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type WarehouseRoutesUiMode = typeof WAREHOUSE_ROUTES_UI_MODES[keyof typeof WAREHOUSE_ROUTES_UI_MODES];

export function resolveWarehouseRoutesUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): WarehouseRoutesUiMode {
  const value = environment.VITE_WAREHOUSE_ROUTES_UI_MODE;
  if (value === undefined || value === "DISABLED" || !isWarehouseSheetUiEnabled(environment, hostname)) return "DISABLED";
  if (value === "LOCAL_ONLY") {
    const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_") || key === "VITE_VERCEL_ENV");
    return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : "DISABLED";
  }
  return value === "PREVIEW_REHEARSAL" && environment.VITE_WAREHOUSE_ROUTES_UI_BATCH === "V17-WAREHOUSE-ROUTES-20D-PREVIEW"
    && environment.VITE_VERCEL_ENV === "preview" && isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF) ? value : "DISABLED";
}

export function isWarehouseRoutesUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) {
  return resolveWarehouseRoutesUiMode(environment, hostname) !== "DISABLED";
}
