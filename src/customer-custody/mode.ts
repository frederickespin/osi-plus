import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

const MODES = new Set(["DISABLED", "LOCAL_ONLY", "PREVIEW_REHEARSAL"]);
export function resolveCustomerCustodyUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname) {
  const value = environment.VITE_CUSTOMER_CUSTODY_UI_MODE;
  if (typeof value !== "string" || !MODES.has(value) || value === "DISABLED") return "DISABLED";
  if (value === "LOCAL_ONLY") return ["localhost", "127.0.0.1", "::1"].includes(hostname) ? value : "DISABLED";
  return environment.VITE_VERCEL_ENV === "preview"
    && (environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-storage-commercial-contract-22a"
      || isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF))
    && environment.VITE_CUSTOMER_CUSTODY_UI_BATCH === "V17-STORAGE-COMMERCIAL-CONTRACT-22A-PREVIEW"
    ? value
    : "DISABLED";
}
export function isCustomerCustodyUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) { return resolveCustomerCustodyUiMode(environment, hostname) !== "DISABLED"; }
