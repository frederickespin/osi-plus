import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const LOGISTICS_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type LogisticsUiMode = typeof LOGISTICS_UI_MODES[keyof typeof LOGISTICS_UI_MODES];
export function resolveLogisticsUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): LogisticsUiMode {
  const value = environment.VITE_LOGISTICS_ENGINE_UI_MODE;
  if (value === undefined || value === "DISABLED") return "DISABLED";
  if (value === "LOCAL_ONLY") { const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_") || key === "VITE_VERCEL_ENV"); return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : "DISABLED"; }
  return value === "PREVIEW_REHEARSAL" && environment.VITE_LOGISTICS_ENGINE_UI_BATCH === "V17-LOGISTICS-ENGINE-07A-PREVIEW" && environment.VITE_VERCEL_ENV === "preview" && (environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-logistics-engine" || isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF)) ? value : "DISABLED";
}
export function isLogisticsUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) { return resolveLogisticsUiMode(environment, hostname) !== "DISABLED"; }
