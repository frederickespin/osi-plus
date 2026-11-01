import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";
import { resolveWarehouseConfigurationApiMode } from "./warehouseConfigurationMode.js";
import { warehouseSheetFail } from "./warehouseSheetContract.js";

export const WAREHOUSE_SHEET_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const WAREHOUSE_SHEET_PREVIEW_BATCH = "V17-WAREHOUSE-SHEET-20C-PREVIEW";
export function resolveWarehouseSheetApiMode(env = process.env, req) {
  const mode = env.WAREHOUSE_SHEET_API_MODE ?? WAREHOUSE_SHEET_API_MODES.DISABLED;
  if (!Object.values(WAREHOUSE_SHEET_API_MODES).includes(mode)) warehouseSheetFail("WAREHOUSE_SHEET_CONFIGURATION_INVALID", 503);
  if (mode === WAREHOUSE_SHEET_API_MODES.DISABLED) warehouseSheetFail("WAREHOUSE_SHEET_DISABLED", 409);
  resolveWarehouseConfigurationApiMode(env, req);
  if (mode === WAREHOUSE_SHEET_API_MODES.LOCAL_ONLY) {
    if (Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL")) || !isRealLoopbackRequest(req)) warehouseSheetFail("WAREHOUSE_SHEET_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const valid = env.VERCEL === "1" && env.VERCEL_ENV === "preview" && isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF)
    && env.WAREHOUSE_SHEET_API_BATCH === WAREHOUSE_SHEET_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!valid) warehouseSheetFail("WAREHOUSE_SHEET_CONFIGURATION_INVALID", 503);
  return mode;
}
