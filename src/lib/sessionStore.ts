import type { UserRole } from "@/types/osi.types";

export type Session = {
  userId?: string;
  name?: string;
  role: UserRole; // 'A','V','K',...
  token?: string;
};

const KEY = "osi-plus.session";
const TOKEN_KEY = "osi-plus.token";

function normalizeRole(raw: unknown): UserRole | null {
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
export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    const token = localStorage.getItem(TOKEN_KEY);
    const role = normalizeRole(s?.role);
    
    // Require both role and token for a valid session
    if (role && token) {
      return { ...s, role, token };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save session to localStorage.
 */
export function saveSession(session: Session): void {
  localStorage.setItem(KEY, JSON.stringify(session));
  if (session.token) {
    localStorage.setItem(TOKEN_KEY, session.token);
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

export function isAdminRole(role: UserRole) {
  return role === "A";
}
