export const CRM01C1A_PREVIEW_GIT_REF = "feature/crm01c1a-integrated-preview-rehearsal";
export const CRM01C1A_PREVIEW_DATABASE = "crm01c1a_rehearsal";
export const CRM01C1A_PREVIEW_BRANCH_ID = "br-mute-credit-ahxnvfx0";
export const CRM01C1A_PREVIEW_BATCH = "CRM-01C1A-PREVIEW-20260813-V1";

const SHA = /^[0-9a-f]{40}$/;
const VERCEL_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function exact(value, expected) {
  return typeof value === "string" && value === expected;
}

export function isCrm01c1aPreviewRehearsal(env = process.env) {
  const expectedSha = env.CRM01C1A_EXPECTED_GIT_SHA;
  return exact(env.VERCEL_ENV, "preview")
    && exact(env.VERCEL_GIT_COMMIT_REF, CRM01C1A_PREVIEW_GIT_REF)
    && typeof expectedSha === "string"
    && SHA.test(expectedSha)
    && exact(env.VERCEL_GIT_COMMIT_SHA, expectedSha)
    && exact(env.CRM_PIPELINE_ACTIVATION_BATCH, CRM01C1A_PREVIEW_BATCH)
    && exact(env.CRM01C1A_DATABASE_NAME, CRM01C1A_PREVIEW_DATABASE)
    && exact(env.CRM01C1A_NEON_BRANCH_ID, CRM01C1A_PREVIEW_BRANCH_ID)
    && exact(env.COMMERCIAL_TENANCY_ACTIVATION_BATCH, "MT-01C2B2-IPACKERS-DO-V1")
    && exact(env.COMMERCIAL_TENANCY_READ_MODE, "TENANT_READ")
    && exact(env.COMMERCIAL_TENANCY_WRITE_MODE, "TENANT_WRITE")
    && exact(env.MT01B_AUTH_MODE ?? "LEGACY", "LEGACY")
    && exact(env.MT01B_TENANT_SWITCH_ENABLED ?? "false", "false")
    && exact(env.VITE_MT01B2_CLIENT_ENABLED ?? "false", "false")
    && typeof env.VERCEL_URL === "string"
    && VERCEL_HOST.test(env.VERCEL_URL);
}

export function crm01c1aPreviewOrigin(env = process.env) {
  if (!isCrm01c1aPreviewRehearsal(env)) return null;
  return `https://${env.VERCEL_URL}`;
}

export function isCrm01c1aPreviewDatabaseUrl(raw, env = process.env) {
  if (!isCrm01c1aPreviewRehearsal(env) || typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    return ["postgres:", "postgresql:"].includes(url.protocol)
      && decodeURIComponent(url.pathname.slice(1)) === CRM01C1A_PREVIEW_DATABASE
      && url.searchParams.get("schema") === "osi";
  } catch {
    return false;
  }
}
