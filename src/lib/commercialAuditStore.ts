import type { UserRole } from "@/types/osi.types";

export type CommercialAuditAction =
  | "QUOTE_COST_CHANGE"
  | "QUOTE_CONDITION_CHANGE"
  | "QUOTE_LINE_ADD"
  | "QUOTE_LINE_REMOVE"
  | "CALENDAR_LIMIT_CHANGE";

export type CommercialAuditItem = {
  id: string;
  createdAt: string;
  userRole: UserRole;
  action: CommercialAuditAction;
  entityType: "QUOTE" | "CALENDAR";
  entityId: string;
  note?: string;
  before?: unknown;
  after?: unknown;
};

const KEY = "osi-plus.commercial.auditLog";
const nowIso = () => new Date().toISOString();
const uid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `aud_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCommercialAuditLog(): CommercialAuditItem[] {
  return safeParse<CommercialAuditItem[]>(localStorage.getItem(KEY), []);
}

export function addCommercialAudit(item: Omit<CommercialAuditItem, "id" | "createdAt">) {
  const list = loadCommercialAuditLog();
  const next: CommercialAuditItem = {
    ...item,
    id: uid(),
    createdAt: nowIso(),
  };
  localStorage.setItem(KEY, JSON.stringify([next, ...list].slice(0, 1000)));
  return next;
}
