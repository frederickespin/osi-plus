import { Prisma } from "@prisma/client";
import {
  ADMIN_MEMBERSHIP_PREVIEW_BATCH,
  isAdminMembershipPreviewBranch,
} from "../../shared/adminMembershipPreview.js";

export const ADMIN_MEMBERSHIP_PREVIEW_MODE = "PREVIEW_REHEARSAL";
export { ADMIN_MEMBERSHIP_PREVIEW_BATCH, ADMIN_MEMBERSHIP_PREVIEW_BRANCH } from "../../shared/adminMembershipPreview.js";

export class AdminMembershipPreviewError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "AdminMembershipPreviewError";
    this.code = code;
    this.status = status;
  }
}

function invalid() {
  throw new AdminMembershipPreviewError("ADMIN_MEMBERSHIP_PREVIEW_CONFIGURATION_INVALID", 503);
}

function exactText(value, pattern) {
  return typeof value === "string" && value === value.trim() && pattern.test(value);
}

function destination(env) {
  const database = env.ADMIN_MEMBERSHIP_PREVIEW_DATABASE;
  const neonBranch = env.ADMIN_MEMBERSHIP_PREVIEW_NEON_BRANCH_ID;
  const tenantCode = env.ADMIN_MEMBERSHIP_PREVIEW_TENANT_CODE;
  if (!exactText(database, /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/u)
    || !exactText(neonBranch, /^br-[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    || !exactText(tenantCode, /^[A-Z0-9][A-Z0-9_-]{1,159}$/u)) invalid();
  return Object.freeze({ database, neonBranch, tenantCode });
}

function authorizedDatabaseUrl(raw, database) {
  try {
    if (typeof raw !== "string" || raw !== raw.trim()) return false;
    const url = new URL(raw);
    return ["postgres:", "postgresql:"].includes(url.protocol)
      && decodeURIComponent(url.pathname.slice(1)) === database
      && url.searchParams.getAll("schema").length === 1
      && url.searchParams.get("schema") === "osi"
      && url.hash === "";
  } catch {
    return false;
  }
}

/** Server-only target configuration; never supplied by the browser or a request. */
export function assertAdminMembershipPreviewEnvironment(env = process.env) {
  const expected = destination(env);
  if (env.ADMIN_TENANT_MEMBERSHIP_MODE !== ADMIN_MEMBERSHIP_PREVIEW_MODE
    || env.VERCEL !== "1"
    || env.VERCEL_ENV !== "preview"
    || !isAdminMembershipPreviewBranch(env.VERCEL_GIT_COMMIT_REF)
    || env.ADMIN_MEMBERSHIP_PREVIEW_BATCH !== ADMIN_MEMBERSHIP_PREVIEW_BATCH
    || env.MT01B_AUTH_MODE !== "LEGACY"
    || env.MT01B_TENANT_SWITCH_ENABLED !== "false"
    || env.VITE_MT01B2_CLIENT_ENABLED !== "false"
    || !authorizedDatabaseUrl(env.DATABASE_URL, expected.database)) invalid();
  return expected;
}

export async function assertAdminMembershipPreviewDatabase(prisma, mode, env = process.env) {
  if (mode !== ADMIN_MEMBERSHIP_PREVIEW_MODE) return;
  const expected = assertAdminMembershipPreviewEnvironment(env);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT current_database() AS "database",
           current_setting('neon.branch_id', true) AS "branch",
           to_regnamespace('osi') IS NOT NULL AS "schema_exists"
  `);
  const identity = rows[0];
  if (rows.length !== 1 || identity?.database !== expected.database
    || identity?.branch !== expected.neonBranch || identity?.schema_exists !== true) invalid();
}

export function requireAdminMembershipPreviewContext(env, context) {
  const expected = assertAdminMembershipPreviewEnvironment(env);
  if (context?.tenantCode !== expected.tenantCode
    || context?.tenant?.code !== expected.tenantCode
    || context?.tenantStatus !== "ACTIVE"
    || context?.membershipStatus !== "ACTIVE"
    || context?.userStatus !== "ACTIVE"
    || context?.role !== "A"
    || context?.sessionKind !== "LEGACY") {
    throw new AdminMembershipPreviewError("ADMIN_MEMBERSHIP_PREVIEW_FORBIDDEN", 403);
  }
}
