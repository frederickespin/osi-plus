import { isV17ConsolidatedPreviewBranch } from "../../shared/v17ConsolidatedPreview.js";

export const CRM_ICP_V2_UI_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL",
} as const);

export const CRM_ICP_V2_UI_PREVIEW_BRANCH = "feature/v17-auth-users-tenant-first";
export const CRM_ICP_V2_UI_PREVIEW_BATCH = "V17-ICP-CONSOLIDATION-02A-PREVIEW";

type Environment = Readonly<Record<string, unknown>>;
type Runtime = Readonly<{ hostname?: string; vercelEnvironment?: string | null; gitBranch?: string | null }>;

function runtimeDefaults(): Runtime {
  return {
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  };
}

function isLoopback(hostname: string | undefined) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function resolveCrmIcpV2UiMode(
  environment: Environment = import.meta.env,
  runtime: Runtime = runtimeDefaults(),
) {
  const requested = environment.VITE_CRM_ICP_V2_UI_MODE;
  if (requested === undefined || requested === CRM_ICP_V2_UI_MODES.DISABLED) {
    return Object.freeze({ mode: CRM_ICP_V2_UI_MODES.DISABLED, enabled: false, valid: true });
  }
  if (requested === CRM_ICP_V2_UI_MODES.LOCAL_ONLY) {
    const hasVercelSignal = Object.keys(environment).some((key) => key.startsWith("VERCEL"));
    const enabled = !hasVercelSignal && runtime.vercelEnvironment == null && runtime.gitBranch == null && isLoopback(runtime.hostname);
    return Object.freeze({ mode: enabled ? requested : CRM_ICP_V2_UI_MODES.DISABLED, enabled, valid: enabled });
  }
  if (requested !== CRM_ICP_V2_UI_MODES.PREVIEW_REHEARSAL) {
    return Object.freeze({ mode: CRM_ICP_V2_UI_MODES.DISABLED, enabled: false, valid: false });
  }
  const enabled = environment.VITE_CRM_ICP_V2_UI_BATCH === CRM_ICP_V2_UI_PREVIEW_BATCH
    && runtime.vercelEnvironment === "preview"
    && (runtime.gitBranch === CRM_ICP_V2_UI_PREVIEW_BRANCH || isV17ConsolidatedPreviewBranch(runtime.gitBranch))
    && !isLoopback(runtime.hostname);
  return Object.freeze({ mode: enabled ? requested : CRM_ICP_V2_UI_MODES.DISABLED, enabled, valid: enabled });
}

export function isCrmIcpV2UiEnabled() {
  const result = resolveCrmIcpV2UiMode();
  return result.valid && result.enabled;
}

export function isCrmIcpV2VisualPreviewRoute(
  pathname = typeof window === "undefined" ? "" : window.location.pathname,
  runtime: Runtime = runtimeDefaults(),
) {
  return pathname === "/experience-preview/icp"
    && runtime.vercelEnvironment === "preview"
    && (runtime.gitBranch === CRM_ICP_V2_UI_PREVIEW_BRANCH || isV17ConsolidatedPreviewBranch(runtime.gitBranch));
}
