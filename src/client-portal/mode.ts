export type ClientTemporaryPortalMode = "DISABLED" | "LOCAL_ONLY" | "PREVIEW_REHEARSAL";
export const productionApiEnabled = false as const;
export const CLIENT_TEMPORARY_PREVIEW_BATCH = "V17-CLIENT-PORTAL-PREVIEW-16B";
export const CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE = "SURVEY_EPHEMERAL_PREVIEW";

export function resolveClientTemporaryPortalMode(env: Record<string, string | boolean | undefined> = import.meta.env): Readonly<{ mode: ClientTemporaryPortalMode; enabled: boolean; valid: boolean }> {
  const raw = env.VITE_CLIENT_TEMPORARY_ACCESS_MODE ?? "DISABLED";
  if (raw === "DISABLED") return Object.freeze({ mode: "DISABLED", enabled: false, valid: true });
  const vercel = Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL"));
  if (raw === "LOCAL_ONLY" && !vercel && typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return Object.freeze({ mode: "LOCAL_ONLY", enabled: true, valid: true });
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  if (raw === "PREVIEW_REHEARSAL" && productionApiEnabled === false && !["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    && env.VITE_VERCEL_ENV === "preview" && env.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-consolidated-preview"
    && env.VITE_CLIENT_TEMPORARY_PREVIEW_BATCH === CLIENT_TEMPORARY_PREVIEW_BATCH
    && env.VITE_CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE === CLIENT_TEMPORARY_PREVIEW_STORAGE_MODE
    && env.VITE_OSI_HUB_MODE === "PREVIEW_REHEARSAL" && env.VITE_CRM_PIPELINE_CLIENT_MODE === "PREVIEW_REHEARSAL"
    && env.VITE_CRM_PIPELINE_READ_MODE === "PREVIEW_REHEARSAL" && env.VITE_MT01B2_CLIENT_ENABLED === "false"
    && env.VITE_COMMUNICATIONS_TRANSPORT_MODE === "DISABLED") return Object.freeze({ mode: "PREVIEW_REHEARSAL", enabled: true, valid: true });
  return Object.freeze({ mode: "DISABLED", enabled: false, valid: false });
}

export function isClientTemporaryPortalRoute(pathname = window.location.pathname) {
  return /^\/client-access\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(pathname);
}
