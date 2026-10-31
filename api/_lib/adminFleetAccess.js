import { Prisma } from "@prisma/client";
import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { ADMIN_MEMBERSHIP_PREVIEW_BATCH } from "../../shared/adminMembershipPreview.js";
import { ADMIN_FLEET_BATCH, ADMIN_FLEET_MODES } from "../../shared/adminFleet.js";
import { fleetFail } from "./adminFleetContract.js";
import { authorizeFleetContext } from "./fleetActor.js";

const PREVIEW = Object.freeze({ database: "v17_consolidated_preview_10b", neonBranch: "br-mute-credit-ahxnvfx0", tenantCode: "V17-CONSOLIDATED-PREVIEW-10B" });
const BRANCHES = Object.freeze(["feature/v17-administration-fleet-19d", "feature/v17-consolidated-preview"]);
function databaseUrlMatches(raw) {
  try {
    if (typeof raw !== "string" || raw !== raw.trim()) return false;
    const url = new URL(raw);
    return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname) && decodeURIComponent(url.pathname.slice(1)) === PREVIEW.database
      && url.searchParams.getAll("schema").length === 1 && url.searchParams.get("schema") === "osi" && !url.hash;
  } catch { return false; }
}
export function assertAdminFleetPreviewEnvironment(env = process.env) {
  if (env.ADMIN_FLEET_MODE !== ADMIN_FLEET_MODES.PREVIEW_REHEARSAL || env.ADMIN_FLEET_BATCH !== ADMIN_FLEET_BATCH
    || env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" || !BRANCHES.includes(env.VERCEL_GIT_COMMIT_REF)
    || env.ADMIN_TENANT_MEMBERSHIP_MODE !== "PREVIEW_REHEARSAL" || env.ADMIN_MEMBERSHIP_PREVIEW_BATCH !== ADMIN_MEMBERSHIP_PREVIEW_BATCH
    || env.ADMIN_MEMBERSHIP_PREVIEW_DATABASE !== PREVIEW.database || env.ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID !== PREVIEW.neonBranch
    || env.ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE !== PREVIEW.tenantCode
    || env.MT01B_AUTH_MODE !== "LEGACY" || env.MT01B_TENANT_SWITCH_ENABLED !== "false" || env.VITE_MT01B2_CLIENT_ENABLED !== "false"
    || !databaseUrlMatches(env.DATABASE_URL)) fleetFail("CONFIGURATION_INVALID", 503);
  return PREVIEW;
}
export function requireAdminFleetAccess(req, env = process.env) {
  const mode = env.ADMIN_FLEET_MODE ?? ADMIN_FLEET_MODES.DISABLED;
  if (mode === ADMIN_FLEET_MODES.DISABLED) fleetFail("DISABLED", 409);
  if (mode === ADMIN_FLEET_MODES.PREVIEW_REHEARSAL) { assertAdminFleetPreviewEnvironment(env); return mode; }
  if (mode !== ADMIN_FLEET_MODES.LOCAL_ONLY || env.ADMIN_TENANT_MEMBERSHIP_MODE !== "LOCAL_ONLY"
    || Object.keys(env).some((key) => key.toUpperCase().startsWith("VERCEL")) || !isRealLoopbackRequest(req)) fleetFail("CONFIGURATION_INVALID", 503);
  return mode;
}
export async function assertAdminFleetDatabase(prisma, mode, env = process.env) {
  if (![ADMIN_FLEET_MODES.LOCAL_ONLY, ADMIN_FLEET_MODES.PREVIEW_REHEARSAL].includes(mode)) fleetFail("CONFIGURATION_INVALID", 503);
  const expected = mode === ADMIN_FLEET_MODES.PREVIEW_REHEARSAL ? assertAdminFleetPreviewEnvironment(env) : null;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT current_database() AS "database", current_setting('neon.branch_id', true) AS "branch",
           to_regnamespace('osi') IS NOT NULL AS "schema_exists",
           to_regclass('osi.osi_vehicles') IS NOT NULL AS "vehicles_exists",
           to_regclass('osi.commercial_audit_logs') IS NOT NULL AS "audit_exists"
  `);
  if (rows.length !== 1 || rows[0]?.schema_exists !== true || rows[0]?.vehicles_exists !== true || rows[0]?.audit_exists !== true) fleetFail("SCHEMA_UNAVAILABLE", 503);
  if (expected && (rows[0].database !== expected.database || rows[0].branch !== expected.neonBranch)) fleetFail("CONFIGURATION_INVALID", 503);
}
export function requireAdminFleetContext(env, mode, context) {
  if (mode !== ADMIN_FLEET_MODES.PREVIEW_REHEARSAL) return;
  const expected = assertAdminFleetPreviewEnvironment(env);
  if (context?.tenantCode !== expected.tenantCode || context?.tenant?.code !== expected.tenantCode
    || context?.tenantStatus !== "ACTIVE" || context?.membershipStatus !== "ACTIVE" || context?.userStatus !== "ACTIVE"
    || context?.sessionKind !== "LEGACY") fleetFail("FORBIDDEN", 403);
  authorizeFleetContext(context);
}
