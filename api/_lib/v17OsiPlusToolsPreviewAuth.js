import { CommercialTenancyError, resolveCommercialContext } from "./commercialTenancyWrite.js";
import {
  hasV17OsiPlusToolsPreviewServerSignal,
  isExactV17OsiPlusToolsPreviewServerEnvironment,
} from "../../shared/v17OsiPlusToolsPreview.js";

function invalidConfiguration() {
  throw new CommercialTenancyError("OSI_PLUS_TOOLS_PREVIEW_CONFIGURATION_INVALID", 503);
}

export function requireV17OsiPlusToolsPreviewSessionMode(env = process.env) {
  if (!hasV17OsiPlusToolsPreviewServerSignal(env)) return false;
  if (!isExactV17OsiPlusToolsPreviewServerEnvironment(env)) invalidConfiguration();
  return true;
}

export async function resolveV17OsiPlusToolsPreviewSessionContext(request, { env = process.env, prisma } = {}) {
  if (!requireV17OsiPlusToolsPreviewSessionMode(env)) return null;
  return resolveCommercialContext(request, { env, prisma });
}
