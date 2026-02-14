import { QuoteSchema, type Quote, type QuoteLine, type LeadLite } from "@/types/sales.types";
import { nextNumber } from "@/lib/sequenceStore";
import { appendQuoteAudit } from "@/lib/quoteAuditStore";
import type { UserRole } from "@/types/osi.types";

const LS_LEADS = "osi-plus.leads";
const LS_QUOTES = "osi-plus.quotes";

const nowIso = () => new Date().toISOString();
const uuid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadLeads(): LeadLite[] {
  const leads = safeParse<LeadLite[]>(localStorage.getItem(LS_LEADS), []);
  return Array.isArray(leads) ? leads : [];
}

export function saveLeads(leads: LeadLite[]) {
  localStorage.setItem(LS_LEADS, JSON.stringify(leads));
}

export function upsertLead(next: LeadLite): LeadLite {
  const leads = loadLeads();
  const merged = [
    { ...next, updatedAt: nowIso() },
    ...leads.filter((l) => l.id !== next.id),
  ];
  saveLeads(merged);
  return merged[0];
}

export function loadQuotes(): Quote[] {
  const quotes = safeParse<Quote[]>(localStorage.getItem(LS_QUOTES), []);
  return (Array.isArray(quotes) ? quotes : []).filter((q) => QuoteSchema.safeParse(q).success);
}

export function saveQuotes(quotes: Quote[]) {
  localStorage.setItem(LS_QUOTES, JSON.stringify(quotes));
}

type QuoteCustomerSnapshot = {
  customerLegalName?: string;
  customerTaxId?: string;
  customerAddress?: string;
  serviceOriginAddress?: string;
  serviceDestinationAddress?: string;
  billingLegalName?: string;
  billingTaxId?: string;
  billingAddress?: string;
  billingEmail?: string;
  billingPhone?: string;
};

export function getOrCreateQuoteForLead(
  leadId: string,
  clientName?: string,
  customerId?: string,
  snapshot?: QuoteCustomerSnapshot
): Quote {
  const quotes = loadQuotes();
  const existing = quotes.find((q) => q.leadId === leadId);
  if (existing) return existing;

  const q: Quote = {
    id: uuid(),
    leadId,
    proposalNumber: nextNumber("proposal", "P", 4),
    customerId,
    customerLegalName: snapshot?.customerLegalName,
    customerTaxId: snapshot?.customerTaxId,
    customerAddress: snapshot?.customerAddress,
    serviceOriginAddress: snapshot?.serviceOriginAddress,
    serviceDestinationAddress: snapshot?.serviceDestinationAddress,
    billingLegalName: snapshot?.billingLegalName,
    billingTaxId: snapshot?.billingTaxId,
    billingAddress: snapshot?.billingAddress,
    billingEmail: snapshot?.billingEmail,
    billingPhone: snapshot?.billingPhone,
    title: `Cotizacion - ${clientName || "Cliente"}`,
    currency: "RD$",
    notes: "",
    inclusions: [],
    exclusions: [],
    permits: [],
    contractClauses: [],
    resourcePlan: { plannedDays: 0, plannedTrucks: 0, plannedPeople: 0 },
    lines: [],
    totals: { subtotal: 0, discount: 0, total: 0 },
    updatedAt: nowIso(),
  };

  saveQuotes([q, ...quotes]);
  return q;
}

export function upsertQuote(next: Quote): Quote {
  const quotes = loadQuotes();
  const updated = { ...next, updatedAt: nowIso() };
  const merged = [updated, ...quotes.filter((q) => q.id !== updated.id)];
  saveQuotes(merged);
  return updated;
}

const isAdmin = (role: UserRole) => role === "A";

function restrictedDiff(prev: Quote, next: Quote) {
  const changes: Array<{ field: string; from: any; to: any }> = [];

  const check = (field: string, a: any, b: any) => {
    const ja = JSON.stringify(a ?? null);
    const jb = JSON.stringify(b ?? null);
    if (ja !== jb) changes.push({ field, from: a, to: b });
  };

  check("lines", prev.lines, next.lines);
  check("inclusions", prev.inclusions, next.inclusions);
  check("exclusions", prev.exclusions, next.exclusions);
  check("permits", prev.permits, next.permits);
  check("contractClauses", prev.contractClauses, next.contractClauses);
  check("resourcePlan", prev.resourcePlan, next.resourcePlan);
  check("discounts", prev.totals?.discount, next.totals?.discount);

  return changes;
}

export function upsertQuoteGuarded(opts: {
  prev: Quote;
  next: Quote;
  locked?: boolean;
  actor: { role: UserRole; id?: string; name?: string; proposalNumber?: string };
}) {
  const { prev, next, actor, locked = false } = opts;
  const changes = restrictedDiff(prev, next);

  if (locked && !isAdmin(actor.role) && changes.length > 0) {
    return { ok: false as const, error: "SOLO_ADMIN" as const };
  }

  const saved = upsertQuote(next);

  if (locked && isAdmin(actor.role) && changes.length > 0) {
    appendQuoteAudit({
      quoteId: saved.id,
      proposalNumber: (saved as any).proposalNumber,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      changes,
    });
  }

  return { ok: true as const, quote: saved };
}

export function recomputeTotals(lines: QuoteLine[]) {
  const subtotal = lines
    .filter((l) => l.category !== "DISCOUNT")
    .reduce((s, l) => s + (l.total || 0), 0);

  const discount = lines
    .filter((l) => l.category === "DISCOUNT")
    .reduce((s, l) => s + (l.total || 0), 0);

  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total };
}
