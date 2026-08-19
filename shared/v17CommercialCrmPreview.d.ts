export const V17_COMMERCIAL_CRM_PREVIEW_MODE: "PREVIEW_REHEARSAL";
export const V17_COMMERCIAL_CRM_PREVIEW_BATCH: "V17-COMMERCIAL-CRM-PREVIEW-01";
export const V17_COMMERCIAL_CRM_PREVIEW_BRANCH: "feature/v17-commercial-crm-preview";

export type V17CommercialCrmPreviewClientConfiguration = Readonly<{
  hubMode?: unknown;
  clientMode?: unknown;
  readMode?: unknown;
  batch?: unknown;
  vercelEnvironment?: unknown;
  gitBranch?: unknown;
  hostname?: string;
}>;

export type V17CommercialCrmPreviewClientAuthority = Readonly<{
  requested: boolean;
  enabled: boolean;
  valid: boolean;
  reason: "NOT_REQUESTED" | "AUTHORIZED_PREVIEW" | "PREVIEW_CONFIGURATION_INVALID";
}>;

export function isLoopbackHostname(hostname?: string): boolean;
export function hasV17CommercialCrmPreviewServerSignal(environment?: Record<string, unknown>): boolean;
export function isExactV17CommercialCrmPreviewServerEnvironment(environment?: Record<string, unknown>): boolean;
export function resolveV17CommercialCrmPreviewClientAuthority(
  configuration?: V17CommercialCrmPreviewClientConfiguration,
): V17CommercialCrmPreviewClientAuthority;
