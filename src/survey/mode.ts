import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const SURVEY_UI_MODES = Object.freeze({ DISABLED: "DISABLED", LOCAL_ONLY: "LOCAL_ONLY", PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" } as const);
export type SurveyUiMode = typeof SURVEY_UI_MODES[keyof typeof SURVEY_UI_MODES];
export function resolveSurveyUiMode(environment: Readonly<Record<string, unknown>> = import.meta.env, hostname = window.location.hostname): SurveyUiMode {
  const value = environment.VITE_CRM_SURVEY_UI_MODE;
  if (value === undefined || value === SURVEY_UI_MODES.DISABLED) return SURVEY_UI_MODES.DISABLED;
  if (value === SURVEY_UI_MODES.LOCAL_ONLY) {
    const vercel = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"));
    return !vercel && ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? value : SURVEY_UI_MODES.DISABLED;
  }
  const preview = value === SURVEY_UI_MODES.PREVIEW_REHEARSAL
    && environment.VITE_CRM_SURVEY_UI_BATCH === "V17-SURVEY-FOUNDATION-04A-PREVIEW"
    && environment.VITE_VERCEL_ENV === "preview"
    && (environment.VITE_VERCEL_GIT_COMMIT_REF === "feature/v17-survey-foundation" || isV17ConsolidatedPreviewBranch(environment.VITE_VERCEL_GIT_COMMIT_REF));
  return preview ? value : SURVEY_UI_MODES.DISABLED;
}
export function isSurveyUiEnabled(environment?: Readonly<Record<string, unknown>>, hostname?: string) { return resolveSurveyUiMode(environment, hostname) !== SURVEY_UI_MODES.DISABLED; }
