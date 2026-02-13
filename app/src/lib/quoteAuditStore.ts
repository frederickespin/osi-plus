import type { UserRole } from "@/types/osi.types";

export type QuoteAuditEntry = {
  id: string;
  quoteId: string;
  proposalNumber?: string;
  actorId?: string;
  actorName?: string;
  actorRole: UserRole;
  at: string;
  changes: Array<{ field: string; from: any; to: any }>;
};

const KEY = "osi-plus.quoteAuditLog";

const nowIso = () => new Date().toISOString();
const uid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `qa_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export function loadQuoteAudit(quoteId?: string) {
  let list: QuoteAuditEntry[] = [];
  try {
    list = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    list = [];
  }
  return quoteId ? list.filter((x) => x.quoteId === quoteId) : list;
}

export function appendQuoteAudit(entry: Omit<QuoteAuditEntry, "id" | "at">) {
  const list = loadQuoteAudit();
  const next: QuoteAuditEntry = { ...entry, id: uid(), at: nowIso() };
  localStorage.setItem(KEY, JSON.stringify([next, ...list]));
  return next;
}
