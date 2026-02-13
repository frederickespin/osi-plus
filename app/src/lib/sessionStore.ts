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

export function loadSession(): Session {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    const role = normalizeRole(s?.role);
    if (role) return { ...s, role };
  } catch {}
  return { role: "V" }; // default seguro
}

export function isAdminRole(role: UserRole) {
  return role === "A";
}
