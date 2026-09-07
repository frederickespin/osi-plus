export type CommunicationsUiMode = "DISABLED" | "LOCAL_ONLY" | "PREVIEW_REHEARSAL";
export const productionApiEnabled = false as const;
export const COMMUNICATIONS_PREVIEW_BATCH = "V17-COMMUNICATIONS-PREVIEW-13B";
export function resolveCommunicationsUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): CommunicationsUiMode {
  const mode = environment.VITE_COMMUNICATIONS_MODE ?? "DISABLED";
  if (mode !== "DISABLED" && mode !== "LOCAL_ONLY" && mode !== "PREVIEW_REHEARSAL") return "DISABLED";
  if (mode === "LOCAL_ONLY" && (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) && !Object.keys(environment).some((key) => key.toUpperCase().startsWith("VERCEL"))) return mode;
  if (mode === "PREVIEW_REHEARSAL" && productionApiEnabled === false && !["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    && environment.VITE_VERCEL_ENV === "preview" && environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-consolidated-preview"
    && environment.VITE_COMMUNICATIONS_PREVIEW_BATCH === COMMUNICATIONS_PREVIEW_BATCH && environment.VITE_COMMUNICATIONS_TRANSPORT_MODE === "DISABLED"
    && environment.VITE_OSI_HUB_MODE === "PREVIEW_REHEARSAL" && environment.VITE_CRM_PIPELINE_CLIENT_MODE === "PREVIEW_REHEARSAL"
    && environment.VITE_CRM_PIPELINE_READ_MODE === "PREVIEW_REHEARSAL" && environment.VITE_MT01B2_CLIENT_ENABLED === "false") return mode;
  return "DISABLED";
}
export function isCommunicationsUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) { return resolveCommunicationsUiMode(environment, hostname) !== "DISABLED"; }
