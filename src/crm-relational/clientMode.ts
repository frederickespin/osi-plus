export const CRM_PIPELINE_CLIENT_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
} as const);

export const CRM_PIPELINE_READ_CLIENT_MODES = Object.freeze({
  DISABLED: "DISABLED",
  READ_ONLY: "READ_ONLY",
} as const);

export type CrmPipelineClientMode = typeof CRM_PIPELINE_CLIENT_MODES[keyof typeof CRM_PIPELINE_CLIENT_MODES];

export type CrmPipelineClientModeResult = Readonly<{
  mode: CrmPipelineClientMode;
  valid: boolean;
}>;

type ClientEnvironment = Readonly<Record<string, unknown>>;
type ClientRuntime = Readonly<{ hostname?: string }>;

function isLoopback(hostname: string | undefined): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** Única autoridad frontend para la compuerta CRM relacional. */
export function resolveCrmPipelineClientMode(
  environment: ClientEnvironment = import.meta.env,
  runtime: ClientRuntime = { hostname: typeof window === "undefined" ? undefined : window.location.hostname },
): CrmPipelineClientModeResult {
  const raw = environment.VITE_CRM_PIPELINE_CLIENT_MODE;
  if (raw === undefined) return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: true });
  if (raw === CRM_PIPELINE_CLIENT_MODES.DISABLED) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: true });
  }
  if (raw !== CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: false });
  }

  const vercelMarker = Object.keys(environment).some((key) => key.startsWith("VERCEL"));
  if (vercelMarker || !isLoopback(runtime.hostname)) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: false });
  }
  return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY, valid: true });
}

export function isRelationalCrmClientEnabled(result = resolveCrmPipelineClientMode()): boolean {
  return result.valid && result.mode === CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY;
}

export type CrmPipelineReadClientModeResult = Readonly<{
  mode: (typeof CRM_PIPELINE_READ_CLIENT_MODES)[keyof typeof CRM_PIPELINE_READ_CLIENT_MODES];
  valid: boolean;
}>;

/** Compuerta declarativa de lectura. El backend sigue siendo la autoridad READ_ONLY definitiva. */
export function resolveCrmPipelineReadClientMode(
  environment: ClientEnvironment = import.meta.env,
  runtime: ClientRuntime = { hostname: typeof window === "undefined" ? undefined : window.location.hostname },
): CrmPipelineReadClientModeResult {
  const raw = environment.VITE_CRM_PIPELINE_READ_MODE;
  if (raw === undefined || raw === CRM_PIPELINE_READ_CLIENT_MODES.DISABLED) {
    return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.DISABLED, valid: true });
  }
  if (raw !== CRM_PIPELINE_READ_CLIENT_MODES.READ_ONLY) {
    return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.DISABLED, valid: false });
  }
  const vercelMarker = Object.keys(environment).some((key) => key.startsWith("VERCEL"));
  if (vercelMarker || !isLoopback(runtime.hostname)) {
    return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.DISABLED, valid: false });
  }
  return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.READ_ONLY, valid: true });
}

export function isRelationalCrmReadEnabled(
  environment: ClientEnvironment = import.meta.env,
  runtime: ClientRuntime = { hostname: typeof window === "undefined" ? undefined : window.location.hostname },
): boolean {
  const client = resolveCrmPipelineClientMode(environment, runtime);
  const read = resolveCrmPipelineReadClientMode(environment, runtime);
  return isRelationalCrmClientEnabled(client)
    && read.valid
    && read.mode === CRM_PIPELINE_READ_CLIENT_MODES.READ_ONLY;
}
