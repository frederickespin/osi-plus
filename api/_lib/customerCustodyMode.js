import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { CustomerCustodyError } from "./customerCustodyContract.js";

export const CUSTOMER_CUSTODY_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" });
export const CUSTOMER_CUSTODY_PREVIEW_BATCH = "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW";
export const CUSTOMER_CUSTODY_PREVIEW_BRANCH = "feature/v17-storage-commercial-contract-22a";
function fail(code, status) { throw new CustomerCustodyError(code, status); }
export function resolveCustomerCustodyMode(env = process.env, req) {
  const mode = env.CUSTOMER_CUSTODY_API_MODE ?? CUSTOMER_CUSTODY_MODES.DISABLED;
  if (!Object.values(CUSTOMER_CUSTODY_MODES).includes(mode)) fail("CUSTOMER_CUSTODY_CONFIGURATION_INVALID", 503);
  if (mode === CUSTOMER_CUSTODY_MODES.DISABLED) fail("CUSTOMER_CUSTODY_DISABLED", 409);
  if (mode === CUSTOMER_CUSTODY_MODES.LOCAL_ONLY) {
    if (Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL")) || !isRealLoopbackRequest(req)) fail("CUSTOMER_CUSTODY_CONFIGURATION_INVALID", 503);
    return mode;
  }
  const valid = env.VERCEL === "1" && env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === CUSTOMER_CUSTODY_PREVIEW_BRANCH
    && env.CUSTOMER_CUSTODY_API_BATCH === CUSTOMER_CUSTODY_PREVIEW_BATCH && env.MT01B_AUTH_MODE === "LEGACY"
    && env.MT01B_TENANT_SWITCH_ENABLED === "false" && env.VITE_MT01B2_CLIENT_ENABLED === "false";
  if (!valid) fail("CUSTOMER_CUSTODY_CONFIGURATION_INVALID", 503);
  return mode;
}
