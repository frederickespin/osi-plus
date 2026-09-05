export const COSTING_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type CostingUiMode = typeof COSTING_UI_MODES[keyof typeof COSTING_UI_MODES];

export function resolveCostingUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): CostingUiMode {
  const value = environment.VITE_COSTING_UI_MODE;
  if (value === undefined || value === "DISABLED") return "DISABLED";
  if (value === "LOCAL_ONLY") {
    const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_") || key === "VITE_VERCEL_ENV");
    return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : "DISABLED";
  }
  return value === "PREVIEW_REHEARSAL"
    && environment.VITE_COSTING_UI_BATCH === "V17-COSTING-08A-PREVIEW"
    && environment.VITE_VERCEL_ENV === "preview"
    && environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-costing"
    ? value
    : "DISABLED";
}

export function isCostingUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) {
  return resolveCostingUiMode(environment, hostname) !== "DISABLED";
}
