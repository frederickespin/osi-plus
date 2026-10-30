export type AdminMembershipRoleCode = "A" | "V" | "K" | "B" | "C" | "C1" | "D" | "E" | "G" | "N" | "PA" | "PB" | "PC" | "PD" | "PF" | "I" | "PE";
export const ADMIN_MEMBERSHIP_ROLE_OPTIONS: readonly Readonly<{ code: AdminMembershipRoleCode; label: string }>[];
export function isAdminMembershipRole(value: unknown): value is AdminMembershipRoleCode;
export function adminMembershipPermissionPresentation(code: string): Readonly<{ label: string; group: string }>;
