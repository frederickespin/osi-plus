export const ADMIN_MEMBERSHIP_PREVIEW_BATCH: "V17-ADMINISTRATION-USERS-ROLES-19B";
export const ADMIN_MEMBERSHIP_PREVIEW_BRANCH: "feature/v17-administration-users-roles-19b";
export function isAdminMembershipPreviewBranch(branch: unknown): boolean;
export function isAdminMembershipPreviewClientEnvironment(runtime: Readonly<{
  hostname?: string;
  vercelEnvironment?: string | null;
  gitBranch?: string | null;
}>): boolean;
