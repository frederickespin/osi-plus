export const OSI_HUB_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
} as const);

export type OsiHubMode = (typeof OSI_HUB_MODES)[keyof typeof OSI_HUB_MODES];

export type OsiHubModeResolution = Readonly<{
  mode: OsiHubMode;
  enabled: boolean;
  valid: boolean;
  reason: "DISABLED" | "LOCAL_LOOPBACK" | "VALUE_INVALID" | "REMOTE_FORBIDDEN" | "VERCEL_FORBIDDEN";
}>;

type HubEnvironment = Record<string, unknown>;
type HubRuntime = { hostname?: string };

function isLoopback(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export function resolveOsiHubMode(
  environment: HubEnvironment = import.meta.env,
  runtime: HubRuntime = { hostname: typeof window === "undefined" ? undefined : window.location.hostname },
): OsiHubModeResolution {
  const raw = environment.VITE_OSI_HUB_MODE;
  if (raw === undefined || raw === OSI_HUB_MODES.DISABLED) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: true, reason: "DISABLED" });
  }
  if (raw !== OSI_HUB_MODES.LOCAL_ONLY) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: false, reason: "VALUE_INVALID" });
  }
  if (environment.VERCEL === "1" || environment.VERCEL_ENV !== undefined) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: false, reason: "VERCEL_FORBIDDEN" });
  }
  if (!isLoopback(String(runtime.hostname || ""))) {
    return Object.freeze({ mode: OSI_HUB_MODES.DISABLED, enabled: false, valid: false, reason: "REMOTE_FORBIDDEN" });
  }
  return Object.freeze({ mode: OSI_HUB_MODES.LOCAL_ONLY, enabled: true, valid: true, reason: "LOCAL_LOOPBACK" });
}
