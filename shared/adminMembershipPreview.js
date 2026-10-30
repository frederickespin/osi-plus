import { isV17ConsolidatedPreviewBranch } from "./v17ConsolidatedPreview.js";

export const ADMIN_MEMBERSHIP_PREVIEW_BATCH = "V17-ADMINISTRATION-USERS-ROLES-19B";
export const ADMIN_MEMBERSHIP_PREVIEW_BRANCH = "feature/v17-administration-users-roles-19b";

export function isAdminMembershipPreviewBranch(branch) {
  return branch === ADMIN_MEMBERSHIP_PREVIEW_BRANCH || isV17ConsolidatedPreviewBranch(branch);
}

export function isAdminMembershipPreviewClientEnvironment({ hostname, vercelEnvironment, gitBranch }) {
  return typeof hostname === "string" && /^[a-z0-9][a-z0-9.-]*\.vercel\.app$/u.test(hostname)
    && vercelEnvironment === "preview" && isAdminMembershipPreviewBranch(gitBranch);
}
