import {
  CommercialTenancyError,
  resolveCommercialContext,
  resolveCommercialTenancyModes,
  sendCommercialTenancyError,
} from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import {
  getBearerToken,
  verifyMembershipAccessToken,
  verifyStrictLegacyAccessToken,
} from "./auth.js";
import { assertCrmOwnerRefSecretConfigured } from "./crmOwnerRef.js";
import {
  V17_COMMERCIAL_CRM_PREVIEW_MODE,
  isExactV17CommercialCrmPreviewServerEnvironment,
} from "../../shared/v17CommercialCrmPreview.js";
import {
  V17_PRODUCTION_PILOT_MODE,
  resolveV17ProductionPilotActivation,
} from "./v17ProductionPilotGate.js";

export const CRM_PIPELINE_READ_MODES = Object.freeze({
  DISABLED: "DISABLED",
  READ_ONLY: "READ_ONLY",
  PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  PRODUCTION_READ: "PRODUCTION_READ",
});

export const CRM_PIPELINE_MUTATION_MODES = Object.freeze({
  DISABLED: "DISABLED",
  LOCAL_ONLY: "LOCAL_ONLY",
  PREVIEW_REHEARSAL: V17_COMMERCIAL_CRM_PREVIEW_MODE,
  PRODUCTION_WRITE: "PRODUCTION_WRITE",
  PRODUCTION_PILOT: V17_PRODUCTION_PILOT_MODE,
});

export const CRM_PIPELINE_ACTIVATION_BATCH = "CRM-01B3B1-PRODUCTION-V1";
export const CRM_PIPELINE_SCHEMA_AUTHORITY = "20260801015000_crm01b_pipeline_mutation_authority";
export const CRM_PIPELINE_ALLOWED_ROLES = Object.freeze(["A", "V"]);

function invalidConfiguration() {
  throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
}

function exactMode(value, allowed, fallback) {
  const mode = value === undefined ? fallback : value;
  if (typeof mode !== "string" || !Object.values(allowed).includes(mode)) invalidConfiguration();
  return mode;
}

function hasVercelEnvironment(env) {
  return Object.keys(env || {}).some((key) => key === "VERCEL" || key.startsWith("VERCEL_"));
}

function assertCommercialTenancyAuthority(env) {
  let commercial;
  try {
    commercial = resolveCommercialTenancyModes(env);
  } catch (cause) {
    throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503, undefined, { cause });
  }
  if (!commercial.tenantMode) invalidConfiguration();
}

function assertProductionAuthority(env) {
  if (env.VERCEL !== "1"
    || env.VERCEL_ENV !== "production"
    || env.VERCEL_GIT_COMMIT_REF !== "main"
    || env.CRM_PIPELINE_ACTIVATION_BATCH !== CRM_PIPELINE_ACTIVATION_BATCH
    || env.CRM_PIPELINE_MUTATION_MODE === undefined
    || env.MT01B_AUTH_MODE !== "LEGACY"
    || env.MT01B_TENANT_SWITCH_ENABLED !== "false"
    || env.VITE_MT01B2_CLIENT_ENABLED !== "false") {
    invalidConfiguration();
  }
  assertCommercialTenancyAuthority(env);
}

function assertPreviewAuthority(env) {
  if (!isExactV17CommercialCrmPreviewServerEnvironment(env)) invalidConfiguration();
  assertCommercialTenancyAuthority(env);
}

export function resolveCrmPipelineModes(env = process.env) {
  const readMode = exactMode(
    env.CRM_PIPELINE_RUNTIME_MODE,
    CRM_PIPELINE_READ_MODES,
    CRM_PIPELINE_READ_MODES.DISABLED,
  );
  const mutationMode = exactMode(
    env.CRM_PIPELINE_MUTATION_MODE,
    CRM_PIPELINE_MUTATION_MODES,
    CRM_PIPELINE_MUTATION_MODES.DISABLED,
  );
  const activationBatch = env.CRM_PIPELINE_ACTIVATION_BATCH;
  const authMode = env.MT01B_AUTH_MODE ?? "LEGACY";
  const tenantSwitch = env.MT01B_TENANT_SWITCH_ENABLED ?? "false";
  const clientV2 = env.VITE_MT01B2_CLIENT_ENABLED ?? "false";

  const disabled = readMode === CRM_PIPELINE_READ_MODES.DISABLED
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.DISABLED;
  const localRead = readMode === CRM_PIPELINE_READ_MODES.READ_ONLY
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.DISABLED;
  const localWrite = readMode === CRM_PIPELINE_READ_MODES.READ_ONLY
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY;
  const previewRead = readMode === CRM_PIPELINE_READ_MODES.PREVIEW_REHEARSAL
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.DISABLED;
  const previewWrite = readMode === CRM_PIPELINE_READ_MODES.PREVIEW_REHEARSAL
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.PREVIEW_REHEARSAL;
  const productionRead = readMode === CRM_PIPELINE_READ_MODES.PRODUCTION_READ
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.DISABLED;
  const productionWrite = readMode === CRM_PIPELINE_READ_MODES.PRODUCTION_READ
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.PRODUCTION_WRITE;
  const productionPilot = readMode === CRM_PIPELINE_READ_MODES.PRODUCTION_READ
    && mutationMode === CRM_PIPELINE_MUTATION_MODES.PRODUCTION_PILOT;

  if (!disabled && !localRead && !localWrite && !previewRead && !previewWrite && !productionRead && !productionWrite && !productionPilot) invalidConfiguration();
  if (!["LEGACY", "MEMBERSHIP_ONLY"].includes(authMode) || tenantSwitch !== "false" || clientV2 !== "false") invalidConfiguration();
  if ((disabled || localRead || localWrite) && activationBatch !== undefined) invalidConfiguration();
  if ((localRead || localWrite) && hasVercelEnvironment(env)) invalidConfiguration();
  if (previewRead || previewWrite) assertPreviewAuthority(env);
  if (productionRead || productionWrite || productionPilot) assertProductionAuthority(env);
  if (productionPilot) resolveV17ProductionPilotActivation(env);
  if (localWrite || productionWrite) assertCrmOwnerRefSecretConfigured(env);

  return Object.freeze({
    readMode,
    mutationMode,
    ...(previewRead || previewWrite ? { preview: true } : {}),
    production: productionRead || productionWrite || productionPilot,
  });
}

export function requireCrmPipelineRead(env = process.env) {
  const modes = resolveCrmPipelineModes(env);
  if (modes.readMode === CRM_PIPELINE_READ_MODES.DISABLED) {
    throw new CommercialTenancyError("CRM_PIPELINE_DISABLED", 409);
  }
  return modes.readMode;
}

export function requireCrmPipelineMutation(env = process.env) {
  const modes = resolveCrmPipelineModes(env);
  if (modes.mutationMode === CRM_PIPELINE_MUTATION_MODES.DISABLED
    || modes.mutationMode === CRM_PIPELINE_MUTATION_MODES.PRODUCTION_PILOT) {
    throw new CommercialTenancyError("CRM_PIPELINE_MUTATIONS_DISABLED", 409);
  }
  return modes.mutationMode;
}

export function requireCrmPipelineCaseMutation(env = process.env) {
  const modes = resolveCrmPipelineModes(env);
  if (modes.mutationMode === CRM_PIPELINE_MUTATION_MODES.DISABLED) {
    throw new CommercialTenancyError("CRM_PIPELINE_MUTATIONS_DISABLED", 409);
  }
  if (![CRM_PIPELINE_MUTATION_MODES.LOCAL_ONLY, CRM_PIPELINE_MUTATION_MODES.PREVIEW_REHEARSAL,
    CRM_PIPELINE_MUTATION_MODES.PRODUCTION_PILOT].includes(modes.mutationMode)) {
    throw new CommercialTenancyError("CRM_PIPELINE_CONFIGURATION_INVALID", 503);
  }
  return modes.mutationMode;
}

function rawHeaderCount(request, headerName) {
  if (!Array.isArray(request?.rawHeaders)) return null;
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (String(request.rawHeaders[index]).toLowerCase() === headerName) count += 1;
  }
  return count;
}

export function assertCrmAuthorizationHeader(request) {
  const count = rawHeaderCount(request, "authorization");
  const raw = request?.headers?.authorization ?? request?.headers?.Authorization;
  if ((count !== null && count > 1) || Array.isArray(raw) || (typeof raw === "string" && raw.includes(","))) {
    throw new CommercialTenancyError("COMMERCIAL_AUTH_INVALID", 401);
  }
}

function verifiedCrmTokenKind(token) {
  let legacy = false;
  let membership = false;
  try { verifyStrictLegacyAccessToken(token); legacy = true; } catch { /* contrato no LEGACY */ }
  try { verifyMembershipAccessToken(token); membership = true; } catch { /* contrato no V2 */ }
  if (legacy === membership) throw new CommercialTenancyError("COMMERCIAL_AUTH_INVALID", 401);
  return membership ? "V2" : "LEGACY";
}

export async function resolveCrmPipelineContext(request, options = {}) {
  try {
    assertCrmAuthorizationHeader(request);
    const token = getBearerToken(request);
    if (!token) throw new CommercialTenancyError("COMMERCIAL_AUTH_REQUIRED", 401);
    const tokenKind = verifiedCrmTokenKind(token);
    const authMode = options.env?.MT01B_AUTH_MODE ?? process.env.MT01B_AUTH_MODE ?? "LEGACY";
    if (tokenKind === "V2" && authMode !== "MEMBERSHIP_ONLY") {
      throw new CommercialTenancyError("COMMERCIAL_AUTH_INVALID", 401);
    }
    return await resolveCommercialContext(request, { ...options, verifiedTokenKind: tokenKind });
  } catch (cause) {
    if (cause instanceof CommercialTenancyError) throw cause;
    if (cause instanceof Mt01bAuthError) throw cause;
    throw new CommercialTenancyError("COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE", 503, undefined, { cause });
  }
}

export async function requireCrmPipelinePermission(request, permission, options = {}) {
  const context = await resolveCrmPipelineContext(request, options);
  if (!CRM_PIPELINE_ALLOWED_ROLES.includes(String(context.role))
    || !context.effectivePermissions.includes(String(permission))) {
    throw new CommercialTenancyError("COMMERCIAL_PERMISSION_FORBIDDEN", 403);
  }
  return context;
}

export async function requireCrmPipelinePermissionResponse(request, response, permission, options = {}) {
  try {
    return await requireCrmPipelinePermission(request, permission, options);
  } catch (error) {
    sendCommercialTenancyError(response, error);
    return null;
  }
}
