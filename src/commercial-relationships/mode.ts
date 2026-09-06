export type CommercialRelationshipsMode = "DISABLED" | "LOCAL_ONLY" | "PREVIEW_REHEARSAL";
export const productionApiEnabled = false as const;

export function resolveCommercialRelationshipsUiMode(env: Record<string, unknown> = import.meta.env): CommercialRelationshipsMode {
  const raw = env.VITE_COMMERCIAL_RELATIONSHIPS_MODE;
  if (raw === undefined || raw === "DISABLED") return "DISABLED";
  if (raw === "LOCAL_ONLY") return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) && !Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL")) ? raw : "DISABLED";
  if (raw === "PREVIEW_REHEARSAL"
    && env.VITE_COMMERCIAL_RELATIONSHIPS_BATCH === "V17-COMMERCIAL-RELATIONSHIPS-12A-PREVIEW"
    && env.VITE_VERCEL_ENV === "preview"
    && env.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-consolidated-preview"
    && env.VITE_MT01B2_CLIENT_ENABLED === "false") return raw;
  return "DISABLED";
}

export function isCommercialRelationshipsUiEnabled(env?: Record<string, unknown>) { return resolveCommercialRelationshipsUiMode(env) !== "DISABLED"; }
