import { isLoopbackHostname } from "./v17CommercialCrmPreview.js";

export const V17_COMMERCIAL_CRM_PRODUCTION_MODE = "PRODUCTION_READ";
export const V17_COMMERCIAL_CRM_PRODUCTION_BRANCH = "main";
export const V17_COMMERCIAL_CRM_PRODUCTION_BATCH = "CRM-01B3B1-PRODUCTION-V1";

export function hasV17CommercialCrmProductionServerSignal(environment = {}) {
  return environment.CRM_PIPELINE_RUNTIME_MODE === V17_COMMERCIAL_CRM_PRODUCTION_MODE
    || environment.CRM_PIPELINE_ACTIVATION_BATCH === V17_COMMERCIAL_CRM_PRODUCTION_BATCH;
}

/**
 * Autoridad pura del bundle. Sólo usa los tres modos públicos y metadata de
 * build de Vercel; tenancy y Auth LEGACY se confirman por separado desde el
 * servidor antes de montar cualquier chunk protegido.
 */
export function resolveV17CommercialCrmProductionClientAuthority(configuration = {}) {
  const requested = [configuration.hubMode, configuration.clientMode, configuration.readMode]
    .some((value) => value === V17_COMMERCIAL_CRM_PRODUCTION_MODE);
  if (!requested) return Object.freeze({ requested: false, enabled: false, valid: true, reason: "NOT_REQUESTED" });

  const exact = configuration.hubMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE
    && configuration.clientMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE
    && configuration.readMode === V17_COMMERCIAL_CRM_PRODUCTION_MODE
    && configuration.vercelEnvironment === "production"
    && configuration.gitBranch === V17_COMMERCIAL_CRM_PRODUCTION_BRANCH
    && !isLoopbackHostname(configuration.hostname);
  return Object.freeze({
    requested: true,
    enabled: exact,
    valid: exact,
    reason: exact ? "AUTHORIZED_PRODUCTION" : "PRODUCTION_CONFIGURATION_INVALID",
  });
}
