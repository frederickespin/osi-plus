import {
  V17_COMMERCIAL_CRM_PREVIEW_MODE,
  resolveV17CommercialCrmPreviewClientAuthority,
} from "../../shared/v17CommercialCrmPreview.js";
import {
  V17_COMMERCIAL_CRM_PRODUCTION_MODE,
  resolveV17CommercialCrmProductionClientAuthority,
} from "../../shared/v17CommercialCrmProduction.js";

export const CRM_PIPELINE_CLIENT_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  PRODUCTION_READ: V17_COMMERCIAL_CRM_PRODUCTION_MODE,
} as const);

export const CRM_PIPELINE_READ_CLIENT_MODES = Object.freeze({
  DISABLED: "DISABLED",
  READ_ONLY: "READ_ONLY",
  PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  PRODUCTION_READ: V17_COMMERCIAL_CRM_PRODUCTION_MODE,
} as const);

export type CrmPipelineClientMode = typeof CRM_PIPELINE_CLIENT_MODES[keyof typeof CRM_PIPELINE_CLIENT_MODES];

export type CrmPipelineClientModeResult = Readonly<{
  mode: CrmPipelineClientMode;
  valid: boolean;
}>;

type ClientEnvironment = Readonly<Record<string, unknown>>;
type ClientRuntime = Readonly<{ hostname?: string; vercelEnvironment?: string | null; gitBranch?: string | null }>;

function defaultRuntime(): ClientRuntime {
  return {
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  };
}

function previewAuthority(environment: ClientEnvironment, runtime: ClientRuntime) {
  return resolveV17CommercialCrmPreviewClientAuthority({
    hubMode: environment.VITE_OSI_HUB_MODE,
    clientMode: environment.VITE_CRM_PIPELINE_CLIENT_MODE,
    readMode: environment.VITE_CRM_PIPELINE_READ_MODE,
    batch: environment.VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH,
    vercelEnvironment: runtime.vercelEnvironment,
    gitBranch: runtime.gitBranch,
    hostname: runtime.hostname,
  });
}

function productionAuthority(environment: ClientEnvironment, runtime: ClientRuntime) {
  return resolveV17CommercialCrmProductionClientAuthority({
    hubMode: environment.VITE_OSI_HUB_MODE,
    clientMode: environment.VITE_CRM_PIPELINE_CLIENT_MODE,
    readMode: environment.VITE_CRM_PIPELINE_READ_MODE,
    vercelEnvironment: runtime.vercelEnvironment,
    gitBranch: runtime.gitBranch,
    hostname: runtime.hostname,
  });
}

function isLoopback(hostname: string | undefined): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** Única autoridad frontend para la compuerta CRM relacional. */
export function resolveCrmPipelineClientMode(
  environment: ClientEnvironment = import.meta.env,
  runtime: ClientRuntime = defaultRuntime(),
): CrmPipelineClientModeResult {
  const raw = environment.VITE_CRM_PIPELINE_CLIENT_MODE;
  if (raw === undefined) return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: true });
  if (raw === CRM_PIPELINE_CLIENT_MODES.DISABLED) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: true });
  }
  if (raw === CRM_PIPELINE_CLIENT_MODES.PREVIEW_REHEARSAL) {
    const preview = previewAuthority(environment, runtime);
    return Object.freeze({
      mode: preview.enabled ? CRM_PIPELINE_CLIENT_MODES.PREVIEW_REHEARSAL : CRM_PIPELINE_CLIENT_MODES.DISABLED,
      valid: preview.valid,
    });
  }
  if (raw === CRM_PIPELINE_CLIENT_MODES.PRODUCTION_READ) {
    const production = productionAuthority(environment, runtime);
    return Object.freeze({
      mode: production.enabled ? CRM_PIPELINE_CLIENT_MODES.PRODUCTION_READ : CRM_PIPELINE_CLIENT_MODES.DISABLED,
      valid: production.valid,
    });
  }
  if (raw !== CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: false });
  }

  const vercelMarker = Object.keys(environment).some((key) => key.startsWith("VERCEL"));
  if (vercelMarker || runtime.vercelEnvironment != null || runtime.gitBranch != null || !isLoopback(runtime.hostname)) {
    return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.DISABLED, valid: false });
  }
  return Object.freeze({ mode: CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY, valid: true });
}

export function isRelationalCrmClientEnabled(result = resolveCrmPipelineClientMode()): boolean {
  return result.valid && (result.mode === CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY
    || result.mode === CRM_PIPELINE_CLIENT_MODES.PREVIEW_REHEARSAL
    || result.mode === CRM_PIPELINE_CLIENT_MODES.PRODUCTION_READ);
}

export type CrmPipelineReadClientModeResult = Readonly<{
  mode: (typeof CRM_PIPELINE_READ_CLIENT_MODES)[keyof typeof CRM_PIPELINE_READ_CLIENT_MODES];
  valid: boolean;
}>;

/** Compuerta declarativa de lectura. El backend sigue siendo la autoridad READ_ONLY definitiva. */
export function resolveCrmPipelineReadClientMode(
  environment: ClientEnvironment = import.meta.env,
  runtime: ClientRuntime = defaultRuntime(),
): CrmPipelineReadClientModeResult {
  const raw = environment.VITE_CRM_PIPELINE_READ_MODE;
  if (raw === undefined || raw === CRM_PIPELINE_READ_CLIENT_MODES.DISABLED) {
    return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.DISABLED, valid: true });
  }
  if (raw === CRM_PIPELINE_READ_CLIENT_MODES.PREVIEW_REHEARSAL) {
    const preview = previewAuthority(environment, runtime);
    return Object.freeze({
      mode: preview.enabled ? CRM_PIPELINE_READ_CLIENT_MODES.PREVIEW_REHEARSAL : CRM_PIPELINE_READ_CLIENT_MODES.DISABLED,
      valid: preview.valid,
    });
  }
  if (raw === CRM_PIPELINE_READ_CLIENT_MODES.PRODUCTION_READ) {
    const production = productionAuthority(environment, runtime);
    return Object.freeze({
      mode: production.enabled ? CRM_PIPELINE_READ_CLIENT_MODES.PRODUCTION_READ : CRM_PIPELINE_READ_CLIENT_MODES.DISABLED,
      valid: production.valid,
    });
  }
  if (raw !== CRM_PIPELINE_READ_CLIENT_MODES.READ_ONLY) {
    return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.DISABLED, valid: false });
  }
  const vercelMarker = Object.keys(environment).some((key) => key.startsWith("VERCEL"));
  if (vercelMarker || runtime.vercelEnvironment != null || runtime.gitBranch != null || !isLoopback(runtime.hostname)) {
    return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.DISABLED, valid: false });
  }
  return Object.freeze({ mode: CRM_PIPELINE_READ_CLIENT_MODES.READ_ONLY, valid: true });
}

export function isRelationalCrmReadEnabled(
  environment: ClientEnvironment = import.meta.env,
  runtime: ClientRuntime = defaultRuntime(),
): boolean {
  const client = resolveCrmPipelineClientMode(environment, runtime);
  const read = resolveCrmPipelineReadClientMode(environment, runtime);
  const localPair = client.mode === CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY
    && read.mode === CRM_PIPELINE_READ_CLIENT_MODES.READ_ONLY;
  const previewPair = client.mode === CRM_PIPELINE_CLIENT_MODES.PREVIEW_REHEARSAL
    && read.mode === CRM_PIPELINE_READ_CLIENT_MODES.PREVIEW_REHEARSAL;
  const productionPair = client.mode === CRM_PIPELINE_CLIENT_MODES.PRODUCTION_READ
    && read.mode === CRM_PIPELINE_READ_CLIENT_MODES.PRODUCTION_READ;
  return client.valid && read.valid && (localPair || previewPair || productionPair);
}
