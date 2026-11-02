import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";
import { resolveWarehouseSheetApiMode, WAREHOUSE_SHEET_API_MODES } from "./warehouseSheetMode.js";
import { warehouseSheetFail } from "./warehouseSheetContract.js";

export const WAREHOUSE_ROUTES_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const WAREHOUSE_ROUTES_PREVIEW_BATCH = "V17-WAREHOUSE-ROUTES-20D-PREVIEW";

// Disabled routes leave the existing 20C endpoint and its legacy-column reads active.
export function resolveWarehouseRoutesApiMode(env = process.env, req) {
  const mode = env.WAREHOUSE_ROUTES_API_MODE ?? WAREHOUSE_ROUTES_API_MODES.DISABLED;
  if (!Object.values(WAREHOUSE_ROUTES_API_MODES).includes(mode)) warehouseSheetFail("WAREHOUSE_ROUTES_CONFIGURATION_INVALID", 503);
  if (mode === WAREHOUSE_ROUTES_API_MODES.DISABLED) return mode;
  const sheetMode = resolveWarehouseSheetApiMode(env, req);
  if (mode === WAREHOUSE_ROUTES_API_MODES.LOCAL_ONLY) {
    if (sheetMode !== WAREHOUSE_SHEET_API_MODES.LOCAL_ONLY || Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL")) || !isRealLoopbackRequest(req)) warehouseSheetFail("WAREHOUSE_ROUTES_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const valid = sheetMode === WAREHOUSE_SHEET_API_MODES.PREVIEW_REHEARSAL
    && env.VERCEL === "1" && env.VERCEL_ENV === "preview" && isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF)
    && env.WAREHOUSE_ROUTES_API_BATCH === WAREHOUSE_ROUTES_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!valid) warehouseSheetFail("WAREHOUSE_ROUTES_CONFIGURATION_INVALID", 503);
  return mode;
}
