import {
  V17_COMMERCIAL_CRM_PREVIEW_MODE,
  resolveV17CommercialCrmPreviewClientAuthority,
} from "../../shared/v17CommercialCrmPreview.js";
import {
  V17_COMMERCIAL_CRM_PRODUCTION_MODE,
  resolveV17CommercialCrmProductionClientAuthority,
} from "../../shared/v17CommercialCrmProduction.js";

export const OSI_HUB_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  PRODUCTION_READ: V17_COMMERCIAL_CRM_PRODUCTION_MODE,
} as const);

export type OsiHubMode = (typeof OSI_HUB_MODES)[keyof typeof OSI_HUB_MODES];

export type OsiHubModeResolution = Readonly<{
  mode: OsiHubMode;
  enabled: boolean;
  valid: boolean;
  reason: "DISABLED" | "LOCAL_LOOPBACK" | "AUTHORIZED_PREVIEW" | "AUTHORIZED_PRODUCTION" | "VALUE_INVALID" | "REMOTE_FORBIDDEN" | "VERCEL_FORBIDDEN" | "PREVIEW_CONFIGURATION_INVALID" | "PRODUCTION_CONFIGURATION_INVALID";
}>;

type HubEnvironment = Record<string, unknown>;
type HubRuntime = { hostname?: string; vercelEnvironment?: string | null; gitBranch?: string | null };

function isLoopback(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function containsVercelEnvironment(environment: HubEnvironment) {
  return Object.keys(environment).some((key) => key.startsWith("VERCEL"));
}

export function resolveOsiHubMode(
  environment: HubEnvironment = import.meta.env,
  runtime: HubRuntime = {
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
    vercelEnvironment: typeof __V17_VERCEL_ENV__ === "undefined" ? null : __V17_VERCEL_ENV__,
    gitBranch: typeof __V17_VERCEL_GIT_COMMIT_REF__ === "undefined" ? null : __V17_VERCEL_GIT_COMMIT_REF__,
  },
): OsiHubModeResolution {
  const raw = environment.VITE_OSI_HUB_MODE;
  if (raw === undefined || raw === OSI_HUB_MODES.DISABLED) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: true, reason: "DISABLED" });
  }
  if (raw === OSI_HUB_MODES.PREVIEW_REHEARSAL) {
    const preview = resolveV17CommercialCrmPreviewClientAuthority({
      hubMode: raw,
      clientMode: environment.VITE_CRM_PIPELINE_CLIENT_MODE,
      readMode: environment.VITE_CRM_PIPELINE_READ_MODE,
      batch: environment.VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH,
      vercelEnvironment: runtime.vercelEnvironment,
      gitBranch: runtime.gitBranch,
      hostname: runtime.hostname,
    });
    return Object.freeze({
      mode: preview.enabled ? OSI_HUB_MODES.PREVIEW_REHEARSAL : OSI_HUB_MODES.DISABLED,
      enabled: preview.enabled,
      valid: preview.valid,
      reason: preview.reason === "AUTHORIZED_PREVIEW" ? "AUTHORIZED_PREVIEW" : "PREVIEW_CONFIGURATION_INVALID",
    });
  }
  if (raw === OSI_HUB_MODES.PRODUCTION_READ) {
    const production = resolveV17CommercialCrmProductionClientAuthority({
      hubMode: raw,
      clientMode: environment.VITE_CRM_PIPELINE_CLIENT_MODE,
      readMode: environment.VITE_CRM_PIPELINE_READ_MODE,
      vercelEnvironment: runtime.vercelEnvironment,
      gitBranch: runtime.gitBranch,
      hostname: runtime.hostname,
    });
    return Object.freeze({
      mode: production.enabled ? OSI_HUB_MODES.PRODUCTION_READ : OSI_HUB_MODES.DISABLED,
      enabled: production.enabled,
      valid: production.valid,
      reason: production.reason === "AUTHORIZED_PRODUCTION" ? "AUTHORIZED_PRODUCTION" : "PRODUCTION_CONFIGURATION_INVALID",
    });
  }
  if (raw !== OSI_HUB_MODES.LOCAL_ONLY) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: false, reason: "VALUE_INVALID" });
  }
  if (containsVercelEnvironment(environment) || runtime.vercelEnvironment != null || runtime.gitBranch != null) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: false, reason: "VERCEL_FORBIDDEN" });
  }
  if (!isLoopback(String(runtime.hostname || ""))) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: false, reason: "REMOTE_FORBIDDEN" });
  }
  return Object.freeze({ mode: OSI_HUB_MODES.LOCAL_ONLY, enabled: true, valid: true, reason: "LOCAL_LOOPBACK" });
}
