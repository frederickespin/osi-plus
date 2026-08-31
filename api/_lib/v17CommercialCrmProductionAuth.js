import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { COMMERCIAL_TENANCY_MUTATION_MODES } from "./commercialTenancyMutation.js";
import {
  CRM_PIPELINE_MUTATION_MODES,
  CRM_PIPELINE_READ_MODES,
  resolveCrmPipelineContext,
  resolveCrmPipelineModes,
} from "./crmPipelineAccess.js";
import {
  V17_PRODUCTION_PILOT_GATES,
  requireV17ProductionPilotTenant,
  resolveV17ProductionPilotActivation,
} from "./v17ProductionPilotGate.js";
import { hasV17CommercialCrmProductionServerSignal } from "../../shared/v17CommercialCrmProduction.js";

function invalidConfiguration() {
  throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
}

function productionModes(env) {
  try {
    return resolveCrmPipelineModes(env);
  } catch {
    invalidConfiguration();
  }
}

function productionPilotActivation(env) {
  try {
    return resolveV17ProductionPilotActivation(env);
  } catch {
    invalidConfiguration();
  }
}

function hasAuthorizedCrmPilotTenant(activation) {
  return [...activation.tenants.values()]
    .some((gates) => gates.has(V17_PRODUCTION_PILOT_GATES.CRM_CASE_MUTATIONS));
}

/** Se ejecuta antes de auth/body/Prisma cuando el piloto productivo está solicitado. */
export function requireV17CommercialCrmProductionSessionMode(env = process.env) {
  if (!hasV17CommercialCrmProductionServerSignal(env)) return false;
  if (env.COMMERCIAL_TENANCY_MUTATION_MODE !== COMMERCIAL_TENANCY_MUTATION_MODES.DISABLED) {
    invalidConfiguration();
  }
  const modes = productionModes(env);
  if (!modes.production
    || modes.readMode !== CRM_PIPELINE_READ_MODES.PRODUCTION_READ
    || ![
      CRM_PIPELINE_MUTATION_MODES.DISABLED,
      CRM_PIPELINE_MUTATION_MODES.PRODUCTION_PILOT,
    ].includes(modes.mutationMode)) {
    invalidConfiguration();
  }
  if (modes.mutationMode === CRM_PIPELINE_MUTATION_MODES.PRODUCTION_PILOT
    && !hasAuthorizedCrmPilotTenant(productionPilotActivation(env))) {
    invalidConfiguration();
  }
  return true;
}

export function requireV17CommercialCrmProductionTenantMode(env, context) {
  const modes = productionModes(env);
  if (modes.mutationMode === CRM_PIPELINE_MUTATION_MODES.PRODUCTION_PILOT) {
    const activation = productionPilotActivation(env);
    requireV17ProductionPilotTenant(
      activation,
      context?.tenantCode,
      V17_PRODUCTION_PILOT_GATES.CRM_CASE_MUTATIONS,
    );
  }
  return context;
}

/** Revalida User, TenantMembership y Tenant mediante la autoridad CRM existente. */
export async function resolveV17CommercialCrmProductionSessionContext(request, { env = process.env, prisma } = {}) {
  if (!requireV17CommercialCrmProductionSessionMode(env)) return null;
  const context = await resolveCrmPipelineContext(request, { env, prisma });
  return requireV17CommercialCrmProductionTenantMode(env, context);
}
