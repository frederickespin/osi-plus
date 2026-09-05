import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const QUOTE_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type QuoteUiMode = typeof QUOTE_UI_MODES[keyof typeof QUOTE_UI_MODES];

export function resolveQuoteUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): QuoteUiMode {
  const value = environment.VITE_QUOTE_UI_MODE;
  if (value === undefined || value === "DISABLED") return "DISABLED";
  if (value === "LOCAL_ONLY") {
    const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_") || key === "VITE_VERCEL_ENV");
    return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : "DISABLED";
  }
  return value === "PREVIEW_REHEARSAL"
    && environment.VITE_QUOTE_UI_BATCH === "V17-QUOTE-09A-PREVIEW"
    && environment.VITE_VERCEL_ENV === "preview"
    && (environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-quote" || isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF))
    ? value
    : "DISABLED";
}

export function isQuoteUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) {
  return resolveQuoteUiMode(environment, hostname) !== "DISABLED";
}
