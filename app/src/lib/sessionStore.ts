import type { UserRole } from "@/types/osi.types";

export type Session = {
  userId?: string;
  name?: string;
  role: UserRole; // 'A','V','K',...
};

const KEY = "osi-plus.session";

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

function parseSessionCandidate(candidate: unknown): Session | null {
  if (typeof candidate === "string") {
    const role = normalizeRole(candidate);
    return role ? { role } : null;
  }

  if (candidate && typeof candidate === "object") {
    const raw = candidate as Record<string, unknown>;
    const role = normalizeRole(raw.role ?? raw.userRole ?? raw.roleCode);
    if (!role) return null;

    const name =
      typeof raw.name === "string"
        ? raw.name.trim() || undefined
        : typeof raw.userName === "string"
          ? raw.userName.trim() || undefined
          : undefined;
    const userId =
      typeof raw.userId === "string"
        ? raw.userId.trim() || undefined
        : typeof raw.id === "string"
          ? raw.id.trim() || undefined
          : undefined;

    return { role, name, userId };
  }

  return null;
}

function persistSession(session: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
}

export function loadSession(): Session {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null");
    const session = parseSessionCandidate(parsed);
    if (session) {
      // Reescribe formato normalizado por compatibilidad entre versiones.
      persistSession(session);
      return session;
    }
  } catch {}

  // Entorno sin login implementado: usar Admin para evitar falsas restricciones de navegación.
  const fallback: Session = { role: "A", name: "Admin User" };
  persistSession(fallback);
  return fallback;
}

export function isAdminRole(role: UserRole) {
  return role === "A";
}
