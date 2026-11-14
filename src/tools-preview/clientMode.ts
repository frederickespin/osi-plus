export const V17_TOOLS_VISUAL_PREVIEW_BRANCH = "feature/v17-tools-consolidated-11b";
export const V17_TOOLS_VISUAL_PREVIEW_ROUTE = "/experience-preview/tools";

type Runtime = Readonly<{
  vercelEnvironment?: string | null;
  gitBranch?: string | null;
}>;

function runtimeDefaults(): Runtime {
  return {
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  };
}

export function isV17ToolsVisualPreviewRoute(
  pathname = typeof window === "undefined" ? "" : window.location.pathname,
  runtime: Runtime = runtimeDefaults(),
) {
  return pathname === V17_TOOLS_VISUAL_PREVIEW_ROUTE
    && runtime.vercelEnvironment === "preview"
    && runtime.gitBranch === V17_TOOLS_VISUAL_PREVIEW_BRANCH;
}
