import {
  V17_COMMERCIAL_CRM_PREVIEW_BATCH,
  V17_COMMERCIAL_CRM_PREVIEW_MODE,
  V17_OSI_PLUS_TOOLS_PREVIEW_BRANCH,
  isLoopbackHostname,
} from "./v17CommercialCrmPreview.js";

export function hasV17OsiPlusToolsPreviewServerSignal(environment = {}) {
  return environment.VERCEL_GIT_COMMIT_REF === V17_OSI_PLUS_TOOLS_PREVIEW_BRANCH
    || (environment.VITE_OSI_HUB_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE
      && environment.VITE_CRM_PIPELINE_CLIENT_MODE === "DISABLED"
      && environment.VITE_CRM_PIPELINE_READ_MODE === "DISABLED");
}

export function isExactV17OsiPlusToolsPreviewServerEnvironment(environment = {}) {
  return environment.VERCEL === "1"
    && environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === V17_OSI_PLUS_TOOLS_PREVIEW_BRANCH
    && environment.VITE_OSI_HUB_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && environment.VITE_CRM_PIPELINE_CLIENT_MODE === "DISABLED"
    && environment.VITE_CRM_PIPELINE_READ_MODE === "DISABLED"
    && environment.VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH === V17_COMMERCIAL_CRM_PREVIEW_BATCH
    && environment.CRM_PIPELINE_RUNTIME_MODE === "DISABLED"
    && environment.CRM_PIPELINE_MUTATION_MODE === "DISABLED"
    && environment.CRM_PIPELINE_ACTIVATION_BATCH === undefined
    && environment.MT01B_AUTH_MODE === "LEGACY"
    && environment.MT01B_TENANT_SWITCH_ENABLED === "false"
    && environment.VITE_MT01B2_CLIENT_ENABLED === "false"
    && environment.COMMERCIAL_TENANCY_WRITE_MODE === "LEGACY_ONLY"
    && environment.COMMERCIAL_TENANCY_READ_MODE === "LEGACY_ONLY"
    && environment.COMMERCIAL_TENANCY_MUTATION_MODE === "DISABLED"
    && environment.COMMERCIAL_TENANCY_ACTIVATION_BATCH === undefined;
}

export function resolveV17OsiPlusToolsPreviewClientAuthority(configuration = {}) {
  const requested = configuration.hubMode === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && configuration.gitBranch === V17_OSI_PLUS_TOOLS_PREVIEW_BRANCH;
  if (!requested) return Object.freeze({ requested: false, enabled: false, valid: true, reason: "NOT_REQUESTED" });
  const exact = configuration.clientMode === "DISABLED"
    && configuration.readMode === "DISABLED"
    && configuration.batch === V17_COMMERCIAL_CRM_PREVIEW_BATCH
    && configuration.vercelEnvironment === "preview"
    && !isLoopbackHostname(configuration.hostname);
  return Object.freeze({
    requested: true,
    enabled: exact,
    valid: exact,
    reason: exact ? "AUTHORIZED_PREVIEW" : "PREVIEW_CONFIGURATION_INVALID",
  });
}
