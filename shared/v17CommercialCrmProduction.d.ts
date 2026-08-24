export const V17_COMMERCIAL_CRM_PRODUCTION_MODE: "PRODUCTION_READ";
export const V17_COMMERCIAL_CRM_PRODUCTION_BRANCH: "main";
export const V17_COMMERCIAL_CRM_PRODUCTION_BATCH: "CRM-01B3B1-PRODUCTION-V1";

export type V17CommercialCrmProductionClientConfiguration = Readonly<{
  hubMode?: unknown;
  clientMode?: unknown;
  readMode?: unknown;
  vercelEnvironment?: unknown;
  gitBranch?: unknown;
  hostname?: string;
}>;

export type V17CommercialCrmProductionClientAuthority = Readonly<{
  requested: boolean;
  enabled: boolean;
  valid: boolean;
  reason: "NOT_REQUESTED" | "AUTHORIZED_PRODUCTION" | "PRODUCTION_CONFIGURATION_INVALID";
}>;

export function hasV17CommercialCrmProductionServerSignal(environment?: Record<string, unknown>): boolean;
export function resolveV17CommercialCrmProductionClientAuthority(
  configuration?: V17CommercialCrmProductionClientConfiguration,
): V17CommercialCrmProductionClientAuthority;
