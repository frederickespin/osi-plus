export const CRM_SURVEY_VISUAL_PREVIEW_BRANCH = "feature/v17-crm-survey-preview-09a";

type Runtime = Readonly<{ vercelEnvironment?: string | null; gitBranch?: string | null }>;

function runtimeDefaults(): Runtime {
  return {
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  };
}

export function isCrmSurveyVisualPreviewRoute(
  pathname = typeof window === "undefined" ? "" : window.location.pathname,
  runtime: Runtime = runtimeDefaults(),
) {
  return pathname === "/experience-preview/survey"
    && runtime.vercelEnvironment === "preview"
    && runtime.gitBranch === CRM_SURVEY_VISUAL_PREVIEW_BRANCH;
}
