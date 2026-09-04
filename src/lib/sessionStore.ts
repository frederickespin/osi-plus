import type { UserRole } from "@/types/osi.types";

export type MembershipOption = Readonly<{
  membershipRef: string;
  tenantName: string;
  role: UserRole;
  preferred: boolean;
}>;

export type Session = {
  userId?: string;
  name?: string;
  role: UserRole; // 'A','V','K',...
  membershipRef: string;
  memberships: readonly MembershipOption[];
  token?: string;
  permissions?: readonly string[];
  deniedPermissions?: readonly string[];
  commercialCrmPreviewAuthorized?: boolean;
  commercialCrmProductionAuthorized?: boolean;
};

export type StoredSessionInspection =
  | { kind: "EMPTY"; session: null }
  | { kind: "INVALID"; session: null }
  | { kind: "VALID"; session: Session };

const KEY = "osi-plus.session";
const TOKEN_KEY = "osi-plus.token";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function normalizeRole(raw: unknown): UserRole | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();

  const valid: UserRole[] = [
    "A", "V", "K", "B", "C", "C1", "D", "E", "G", "N", "PA", "PB", "PC", "PD", "PF", "I", "PE", "RB",
  ];
  if (valid.includes(value as UserRole)) return value as UserRole;

  if (value === "ADMIN" || value === "ADMIN USER" || value === "ADMINISTRADOR" || value === "ADMINISTRATOR") return "A";
  if (value === "VENTAS" || value === "SALES") return "V";
  if (value === "RRHH" || value === "HR") return "I";
  if (value === "COORDINADOR" || value === "COORDINATOR") return "K";

  return null;
}

/**
 * Load session from localStorage.
 * Returns null if no valid session exists (requires token for authenticated session).
 */
export function inspectStoredSession(): StoredSessionInspection {
  try {
    const rawSession = localStorage.getItem(KEY);
    const token = localStorage.getItem(TOKEN_KEY);

    if (!rawSession && !token) return { kind: "EMPTY", session: null };
    if (!rawSession || !token) return { kind: "INVALID", session: null };

    const parsed: unknown = JSON.parse(rawSession);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "INVALID", session: null };
    }

    const stored = parsed as Record<string, unknown>;
    const role = normalizeRole(stored.role);
    const membershipRef = typeof stored.membershipRef === "string" && UUID_V4.test(stored.membershipRef)
      ? stored.membershipRef
      : null;
    const rawMemberships = Array.isArray(stored.memberships) ? stored.memberships : [];
    const memberships = rawMemberships.flatMap((value): MembershipOption[] => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const option = value as Record<string, unknown>;
      const optionRole = normalizeRole(option.role);
      if (typeof option.membershipRef !== "string" || !UUID_V4.test(option.membershipRef)
        || typeof option.tenantName !== "string" || !option.tenantName.trim() || !optionRole
        || typeof option.preferred !== "boolean") return [];
      return [{ membershipRef: option.membershipRef, tenantName: option.tenantName, role: optionRole, preferred: option.preferred }];
    });
    if (!role || (membershipRef !== null && !memberships.some((option) => option.membershipRef === membershipRef))) {
      return { kind: "INVALID", session: null };
    }

    return {
      kind: "VALID",
      session: {
        userId: typeof stored.userId === "string" ? stored.userId : undefined,
        name: typeof stored.name === "string" ? stored.name : undefined,
        role,
        membershipRef: membershipRef || "",
        memberships,
        token,
        permissions: Array.isArray(stored.permissions) && stored.permissions.every((value) => typeof value === "string") ? stored.permissions : undefined,
        deniedPermissions: Array.isArray(stored.deniedPermissions) && stored.deniedPermissions.every((value) => typeof value === "string") ? stored.deniedPermissions : undefined,
        commercialCrmPreviewAuthorized: stored.commercialCrmPreviewAuthorized === true,
        commercialCrmProductionAuthorized: stored.commercialCrmProductionAuthorized === true,
      },
    };
  } catch {
    return { kind: "INVALID", session: null };
  }
}

export function loadSession(): Session | null {
  const stored = inspectStoredSession();
  return stored.kind === "VALID" ? stored.session : null;
}

/**
 * Save session to localStorage.
 */
export function saveSession(session: Session): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...session,
        role: session.role,
      }),
    );
    if (session.token) {
      localStorage.setItem(TOKEN_KEY, session.token);
    }
  } catch {
    // no-op on storage errors
  }
}

/**
 * Clear session from localStorage.
 */
export function clearSession(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Get the current auth token.
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getMembershipRef(): string | null {
  const stored = inspectStoredSession();
  return stored.kind === "VALID" ? stored.session.membershipRef : null;
}

export function clearTenantScopedState(): void {
  const preserved = new Set([KEY, TOKEN_KEY]);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && !preserved.has(key)) localStorage.removeItem(key);
  }
  sessionStorage.clear();
}

export function isAdminRole(role: UserRole) {
  return role === "A";
}
