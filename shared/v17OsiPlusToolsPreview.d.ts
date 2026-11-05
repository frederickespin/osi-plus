export function hasV17OsiPlusToolsPreviewServerSignal(environment?: Record<string, unknown>): boolean;
export function isExactV17OsiPlusToolsPreviewServerEnvironment(environment?: Record<string, unknown>): boolean;
export function resolveV17OsiPlusToolsPreviewClientAuthority(configuration?: Readonly<{
  hubMode?: unknown;
  clientMode?: unknown;
  readMode?: unknown;
  batch?: unknown;
  vercelEnvironment?: unknown;
  gitBranch?: unknown;
  hostname?: string;
}>): Readonly<{
  requested: boolean;
  enabled: boolean;
  valid: boolean;
  reason: "NOT_REQUESTED" | "AUTHORIZED_PREVIEW" | "PREVIEW_CONFIGURATION_INVALID";
}>;
