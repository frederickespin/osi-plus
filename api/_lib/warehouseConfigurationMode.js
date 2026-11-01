import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";
import { warehouseConfigurationFail } from "./warehouseConfigurationContract.js";

export const WAREHOUSE_CONFIGURATION_API_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const WAREHOUSE_CONFIGURATION_PREVIEW_BATCH = "V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW";

// Consumers check this before issuing any new-table queries. Disabled remains
// compatible with a database whose canonical chain still ends before 20B.
export function isWarehouseConfigurationEnabled(env = process.env) {
  const mode = env.WAREHOUSE_CONFIGURATION_API_MODE ?? WAREHOUSE_CONFIGURATION_API_MODES.DISABLED;
  if (!Object.values(WAREHOUSE_CONFIGURATION_API_MODES).includes(mode)) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INVALID", 503);
  if (mode === WAREHOUSE_CONFIGURATION_API_MODES.DISABLED) return false;
  if (mode === WAREHOUSE_CONFIGURATION_API_MODES.LOCAL_ONLY) {
    if (Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL"))) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INVALID", 503);
    return true;
  }
  const valid = env.VERCEL === "1" && env.VERCEL_ENV === "preview" && isV17ConsolidatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF)
    && env.WAREHOUSE_CONFIGURATION_API_BATCH === WAREHOUSE_CONFIGURATION_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!valid) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INVALID", 503);
  return true;
}

export function resolveWarehouseConfigurationApiMode(env = process.env, req) {
  if (!isWarehouseConfigurationEnabled(env)) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_DISABLED", 409);
  if (env.WAREHOUSE_CONFIGURATION_API_MODE === WAREHOUSE_CONFIGURATION_API_MODES.LOCAL_ONLY && !isRealLoopbackRequest(req)) warehouseConfigurationFail("WAREHOUSE_CONFIGURATION_INVALID", 503);
  return env.WAREHOUSE_CONFIGURATION_API_MODE;
}
