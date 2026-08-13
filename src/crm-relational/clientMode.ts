export const CRM_PIPELINE_CLIENT_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL",
} as const);

export type CrmPipelineClientMode = typeof CRM_PIPELINE_CLIENT_MODES[keyof typeof CRM_PIPELINE_CLIENT_MODES];

export type CrmPipelineClientModeResult = Readonly<{
  mode: CrmPipelineClientMode;
  valid: boolean;
}>;

type ClientEnvironment = Readonly<Record<string, unknown>>;
type ClientRuntime = Readonly<{ hostname?: string }>;
declare const __CRM_PREVIEW_BUILD__: ClientEnvironment;

function defaultClientEnvironment(): ClientEnvironment {
  const build = typeof __CRM_PREVIEW_BUILD__ === "undefined" ? {} : __CRM_PREVIEW_BUILD__;
  return Object.freeze({ ...import.meta.env, ...build });
}

function isLoopback(hostname: string | undefined): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** Única autoridad frontend para la compuerta CRM relacional. */
export function resolveCrmPipelineClientMode(
  environment: ClientEnvironment = defaultClientEnvironment(),
  runtime: ClientRuntime = { hostname: typeof window === "undefined" ? undefined : window.location.hostname },
): CrmPipelineClientModeResult {
  const raw = environment.VITE_CRM_PIPELINE_CLIENT_MODE;
  if (raw === undefined) return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: true });
  if (raw === CRM_PIPELINE_CLIENT_MODES.DISABLED) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: true });
  }
  if (raw === CRM_PIPELINE_CLIENT_MODES.PREVIEW_REHEARSAL) {
    const preview = environment.VERCEL_ENV === "preview"
      && environment.VERCEL_GIT_COMMIT_REF === "feature/crm01c1a-integrated-preview-rehearsal"
      && typeof environment.VERCEL_GIT_COMMIT_SHA === "string"
      && environment.VERCEL_GIT_COMMIT_SHA === environment.CRM01C1A_EXPECTED_GIT_SHA
      && typeof runtime.hostname === "string"
      && runtime.hostname === environment.VERCEL_URL;
    return Object.freeze({ mode: preview ? raw : CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: preview });
  }
  if (raw !== CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: false });
  }

  const vercelMarker = Object.keys(environment).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"));
  if (vercelMarker || !isLoopback(runtime.hostname)) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: false });
  }
  return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY, valid: true });
}

export function isRelationalCrmClientEnabled(result = resolveCrmPipelineClientMode()): boolean {
  return result.valid && (result.mode === CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY
    || result.mode === CRM_PIPELINE_CLIENT_MODES.PREVIEW_REHEARSAL);
}
