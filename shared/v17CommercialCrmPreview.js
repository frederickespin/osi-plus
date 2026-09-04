export const V17_COMMERCIAL_CRM_PREVIEW_MODE = "PREVIEW_REHEARSAL";
export const V17_COMMERCIAL_CRM_PREVIEW_BATCH = "V17-COMMERCIAL-CRM-PREVIEW-01";
export const V17_COMMERCIAL_CRM_PREVIEW_BRANCH = "feature/v17-commercial-crm-preview";
export const V17_COMMERCIAL_CRM_ICP_UI_PREVIEW_BRANCH = "feature/v17-auth-users-tenant-first";

const DISABLED = "DISABLED";
const LEGACY = "LEGACY";
const TENANT_READ = "TENANT_READ";
const TENANT_WRITE = "TENANT_WRITE";
const COMMERCIAL_BATCH = "MT-01C2B2-IPACKERS-DO-V1";

function exactOneOf(value, expected) {
  return expected.includes(value);
}

export function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function hasV17CommercialCrmPreviewServerSignal(environment = {}) {
  return environment.CRM_PIPELINE_RUNTIME_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE
    || environment.CRM_PIPELINE_ACTIVATION_BATCH === V17_COMMERCIAL_CRM_PREVIEW_BATCH;
}

/**
 * Autoridad compartida del servidor. No normaliza valores y no lee estado global.
 * La función sólo certifica la configuración; la autorización del actor se
 * revalida por separado contra User, TenantMembership y Tenant en cada request.
 */
export function isExactV17CommercialCrmPreviewServerEnvironment(environment = {}) {
  return environment.VERCEL === "1"
    && environment.VERCEL_ENV === "preview"
    && (environment.VERCEL_GIT_COMMIT_REF === V17_COMMERCIAL_CRM_PREVIEW_BRANCH
      || environment.VERCEL_GIT_COMMIT_REF === V17_COMMERCIAL_CRM_ICP_UI_PREVIEW_BRANCH)
    && environment.CRM_PIPELINE_RUNTIME_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && exactOneOf(environment.CRM_PIPELINE_MUTATION_MODE, [DISABLED, V17_COMMERCIAL_CRM_PREVIEW_MODE])
    && (environment.VERCEL_GIT_COMMIT_REF !== V17_COMMERCIAL_CRM_ICP_UI_PREVIEW_BRANCH
      || environment.CRM_PIPELINE_MUTATION_MODE === DISABLED)
    && environment.CRM_PIPELINE_ACTIVATION_BATCH === V17_COMMERCIAL_CRM_PREVIEW_BATCH
    && environment.VITE_OSI_HUB_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && environment.VITE_CRM_PIPELINE_CLIENT_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && environment.VITE_CRM_PIPELINE_READ_MODE === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && environment.VITE_V17_COMMERCIAL_CRM_PREVIEW_BATCH === V17_COMMERCIAL_CRM_PREVIEW_BATCH
    && environment.MT01B_AUTH_MODE === LEGACY
    && environment.MT01B_TENANT_SWITCH_ENABLED === "false"
    && environment.VITE_MT01B2_CLIENT_ENABLED === "false"
    && environment.COMMERCIAL_TENANCY_WRITE_MODE === TENANT_WRITE
    && environment.COMMERCIAL_TENANCY_READ_MODE === TENANT_READ
    && environment.COMMERCIAL_TENANCY_MUTATION_MODE === DISABLED
    && environment.COMMERCIAL_TENANCY_ACTIVATION_BATCH === COMMERCIAL_BATCH;
}

/**
 * Autoridad compartida del bundle. Los metadatos Vercel llegan desde constantes
 * de build no editables por query, storage ni headers del navegador.
 */
export function resolveV17CommercialCrmPreviewClientAuthority(configuration = {}) {
  const requested = [configuration.hubMode, configuration.clientMode, configuration.readMode]
    .some((value) => value === V17_COMMERCIAL_CRM_PREVIEW_MODE);
  if (!requested) return Object.freeze({ requested: false, enabled: false, valid: true, reason: "NOT_REQUESTED" });

  const exact = configuration.hubMode === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && configuration.clientMode === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && configuration.readMode === V17_COMMERCIAL_CRM_PREVIEW_MODE
    && configuration.batch === V17_COMMERCIAL_CRM_PREVIEW_BATCH
    && configuration.vercelEnvironment === "preview"
    && (configuration.gitBranch === V17_COMMERCIAL_CRM_PREVIEW_BRANCH
      || configuration.gitBranch === V17_COMMERCIAL_CRM_ICP_UI_PREVIEW_BRANCH)
    && !isLoopbackHostname(configuration.hostname);
  return Object.freeze({
    requested: true,
    enabled: exact,
    valid: exact,
    reason: exact ? "AUTHORIZED_PREVIEW" : "PREVIEW_CONFIGURATION_INVALID",
  });
}
