import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import {
  CRM_PIPELINE_MUTATION_MODES,
  CRM_PIPELINE_READ_MODES,
  resolveCrmPipelineContext,
  resolveCrmPipelineModes,
} from "./crmPipelineAccess.js";
import { hasV17CommercialCrmProductionServerSignal } from "../../shared/v17CommercialCrmProduction.js";

function invalidConfiguration() {
  throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
}

/** Se ejecuta antes de auth/body/Prisma cuando el piloto productivo está solicitado. */
export function requireV17CommercialCrmProductionSessionMode(env = process.env) {
  if (!hasV17CommercialCrmProductionServerSignal(env)) return false;
  const modes = resolveCrmPipelineModes(env);
  if (!modes.production
    || modes.readMode !== CRM_PIPELINE_READ_MODES.PRODUCTION_READ
    || modes.mutationMode !== CRM_PIPELINE_MUTATION_MODES.DISABLED) {
    invalidConfiguration();
  }
  return true;
}

/** Revalida User, TenantMembership y Tenant mediante la autoridad CRM existente. */
export async function resolveV17CommercialCrmProductionSessionContext(request, { env = process.env, prisma } = {}) {
  if (!requireV17CommercialCrmProductionSessionMode(env)) return null;
  return resolveCrmPipelineContext(request, { env, prisma });
}
