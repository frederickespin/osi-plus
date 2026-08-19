import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import {
  CRM_PIPELINE_READ_MODES,
  resolveCrmPipelineContext,
  resolveCrmPipelineModes,
} from "./crmPipelineAccess.js";
import { hasV17CommercialCrmPreviewServerSignal } from "../../shared/v17CommercialCrmPreview.js";

function invalidConfiguration() {
  throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
}

/** Se ejecuta antes de auth/body/Prisma cuando el ensayo está solicitado. */
export function requireV17CommercialCrmPreviewSessionMode(env = process.env) {
  if (!hasV17CommercialCrmPreviewServerSignal(env)) return false;
  const modes = resolveCrmPipelineModes(env);
  if (!modes.preview || modes.readMode !== CRM_PIPELINE_READ_MODES.PREVIEW_REHEARSAL) invalidConfiguration();
  return true;
}

/** Revalida User, TenantMembership y Tenant mediante la autoridad CRM existente. */
export async function resolveV17CommercialCrmPreviewSessionContext(request, { env = process.env, prisma } = {}) {
  if (!requireV17CommercialCrmPreviewSessionMode(env)) return null;
  return resolveCrmPipelineContext(request, { env, prisma });
}
