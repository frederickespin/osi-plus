import { Prisma } from "@prisma/client";
import { isRealLoopbackRequest } from "./commercialTenancyMutation.js";
import { assertAdminMembershipPreviewDatabase, assertAdminMembershipPreviewEnvironment, requireAdminMembershipPreviewContext } from "./adminMembershipPreview.js";
import { ADMIN_USER_IDENTITY_BATCH, ADMIN_USER_IDENTITY_MODES } from "../../shared/adminUserIdentity.js";
import { identityFail } from "./adminUserIdentityContract.js";

export function requireUserIdentityAccess(req, env = process.env) {
  const mode = env.ADMIN_USER_IDENTITY_MODE ?? ADMIN_USER_IDENTITY_MODES.DISABLED;
  if (mode === ADMIN_USER_IDENTITY_MODES.DISABLED) identityFail("DISABLED", 409);
  if (mode === ADMIN_USER_IDENTITY_MODES.PREVIEW_REHEARSAL) {
    if (env.ADMIN_USER_IDENTITY_BATCH !== ADMIN_USER_IDENTITY_BATCH) identityFail("CONFIGURATION_INVALID", 503);
    assertAdminMembershipPreviewEnvironment(env);
    return mode;
  }
  if (mode !== ADMIN_USER_IDENTITY_MODES.LOCAL_ONLY || env.ADMIN_TENANT_MEMBERSHIP_MODE !== "LOCAL_ONLY"
    || Object.keys(env).some((key) => key === "VERCEL" || key.startsWith("VERCEL_")) || !isRealLoopbackRequest(req)) identityFail("CONFIGURATION_INVALID", 503);
  return mode;
}
export async function assertUserIdentityDatabase(prisma, mode, env = process.env) {
  await assertAdminMembershipPreviewDatabase(prisma, mode, env);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT to_regclass('osi.tenant_user_identities') IS NOT NULL AS "identities_exists",
           to_regclass('osi.user_enrollments') IS NOT NULL AS "enrollments_exists"
  `);
  if (rows.length !== 1 || rows[0].identities_exists !== true || rows[0].enrollments_exists !== true) identityFail("SCHEMA_UNAVAILABLE", 503);
}
export function requireUserIdentityContext(env, mode, context) {
  if (mode === ADMIN_USER_IDENTITY_MODES.PREVIEW_REHEARSAL) requireAdminMembershipPreviewContext(env, context);
}
export function userIdentityExpectedTenant(env, mode) {
  return mode === ADMIN_USER_IDENTITY_MODES.PREVIEW_REHEARSAL ? assertAdminMembershipPreviewEnvironment(env).tenantCode : undefined;
}

