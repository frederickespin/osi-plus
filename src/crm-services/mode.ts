import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const CRM_SERVICES_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type CrmServicesUiMode = typeof CRM_SERVICES_UI_MODES[keyof typeof CRM_SERVICES_UI_MODES];

export function resolveCrmServicesUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): CrmServicesUiMode {
  const value = environment.VITE_CRM_SERVICES_UI_MODE;
  if (value === undefined || value === CRM_SERVICES_UI_MODES.DISABLED) return CRM_SERVICES_UI_MODES.DISABLED;
  if (value === CRM_SERVICES_UI_MODES.LOCAL_ONLY) {
    const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"));
    return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : CRM_SERVICES_UI_MODES.DISABLED;
  }
  const preview = value === CRM_SERVICES_UI_MODES.PREVIEW_REHEARSAL
    && environment.VITE_CRM_SERVICES_UI_BATCH === "V17-SERVICES-TENANT-FIRST-03A-PREVIEW"
    && environment.VITE_VERCEL_ENV === "preview"
    && (environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-services-tenant-first" || isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF));
  return preview ? value : CRM_SERVICES_UI_MODES.DISABLED;
}
export function isCrmServicesUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) {
  return resolveCrmServicesUiMode(environment, hostname) !== CRM_SERVICES_UI_MODES.DISABLED;
}
