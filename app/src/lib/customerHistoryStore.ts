export type HistoryKind =
  | "QUOTE_SENT"
  | "QUOTE_WON"
  | "QUOTE_LOST"
  | "SERVICE_COMPLETED"
  | "INVOICE_ISSUED"
  | "NOTE";

export type ServiceType =
  | "LOCAL"
  | "INTERNATIONAL"
  | "ART"
  | "IT"
  | "STORAGE"
  | "OTHER";

// Compat fields (createdAt/type/note) are kept optional so existing UI still works.
export type CustomerHistoryItem = {
  id: string;
  schemaVersion: 1;
  occurredAt: string;
  customerId: string;
  kind: HistoryKind;
  serviceType?: ServiceType;
  billingName?: string;
  billingTaxId?: string;
  projectId?: string;
  osiId?: string;
  quoteId?: string;
  amount?: number;
  currency?: "DOP" | "USD";
  notes?: string;
  score?: number;
  tags?: string[];
  createdAt: string;
  type: string;
  note?: string;
};

type HistoryIndexV1 = {
  version: 1;
  updatedAt: string;
  byCustomerId: Record<string, string[]>;
  byKind: Record<string, string[]>;
  byServiceType: Record<string, string[]>;
  byBillingTaxId: Record<string, string[]>;
  byYearMonth: Record<string, string[]>;
  tokens: Record<string, string[]>;
};

const HISTORY_KEY = "osi-plus.customerHistory.v1";
const LEGACY_KEY = "osi-plus.customerHistory";
const INDEX_KEY = "osi-plus.customerHistory.index.v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function uid() {
  return crypto?.randomUUID ? crypto.randomUUID() : `h_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function uniqPush(arr: string[], id: string) {
  if (!arr.includes(id)) arr.push(id);
}

function ym(iso: string) {
  return String(iso).slice(0, 7);
}

function tokenize(text: string): string[] {
  return (
    (text || "")
      .toLowerCase()
      .normalize("NFD")
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-z0-9]+/g) ?? []
  );
}

function mapLegacyTypeToKind(type?: string): HistoryKind {
  const t = String(type || "").toUpperCase();
  if (t === "QUOTE_SENT") return "QUOTE_SENT";
  if (t === "WON" || t === "QUOTE_WON") return "QUOTE_WON";
  if (t === "LOST" || t === "QUOTE_LOST") return "QUOTE_LOST";
  if (t === "SERVICE_COMPLETED") return "SERVICE_COMPLETED";
  if (t === "INVOICE_ISSUED") return "INVOICE_ISSUED";
  return "NOTE";
}

function mapKindToLegacyType(kind: HistoryKind): string {
  if (kind === "QUOTE_WON") return "WON";
  if (kind === "QUOTE_LOST") return "LOST";
  return kind;
}

function normalizeItem(item: Partial<CustomerHistoryItem>): CustomerHistoryItem {
  const occurredAt = item.occurredAt || item.createdAt || new Date().toISOString();
  const kind = item.kind ?? mapLegacyTypeToKind(item.type);
  return {
    id: item.id || uid(),
    schemaVersion: 1,
    occurredAt,
    customerId: String(item.customerId || ""),
    kind,
    serviceType: item.serviceType,
    billingName: item.billingName,
    billingTaxId: item.billingTaxId,
    projectId: item.projectId,
    osiId: item.osiId,
    quoteId: item.quoteId,
    amount: item.amount,
    currency: item.currency,
    notes: item.notes ?? item.note,
    score: item.score,
    tags: item.tags,
    createdAt: occurredAt,
    type: mapKindToLegacyType(kind),
    note: item.note ?? item.notes,
  };
}

function loadLegacyHistory(): CustomerHistoryItem[] {
  const legacy = safeParse<Partial<CustomerHistoryItem>[]>(localStorage.getItem(LEGACY_KEY), []);
  return legacy
    .filter((x) => x && x.customerId)
    .map((x) => normalizeItem(x));
}

export function loadHistory(): CustomerHistoryItem[] {
  let items = safeParse<CustomerHistoryItem[]>(localStorage.getItem(HISTORY_KEY), []);
  if (!items.length) {
    const migrated = loadLegacyHistory();
    if (migrated.length) {
      saveHistory(migrated);
      return migrated;
    }
  }

  items = items.map((x) => normalizeItem(x));
  ensureIndex(items);
  return items;
}

export function saveHistory(next: CustomerHistoryItem[]) {
  const normalized = next.map((x) => normalizeItem(x));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(normalized));
  localStorage.setItem(LEGACY_KEY, JSON.stringify(normalized));
  const idx = rebuildIndex(normalized);
  localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
}

function loadIndex(): HistoryIndexV1 | null {
  const idx = safeParse<HistoryIndexV1 | null>(localStorage.getItem(INDEX_KEY), null);
  return idx?.version === 1 ? idx : null;
}

function ensureIndex(items: CustomerHistoryItem[]) {
  const idx = loadIndex();
  if (!idx) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(rebuildIndex(items)));
  }
}

function rebuildIndex(items: CustomerHistoryItem[]): HistoryIndexV1 {
  const idx: HistoryIndexV1 = {
    version: 1,
    updatedAt: new Date().toISOString(),
    byCustomerId: {},
    byKind: {},
    byServiceType: {},
    byBillingTaxId: {},
    byYearMonth: {},
    tokens: {},
  };

  for (const it of items) {
    const id = it.id;

    (idx.byCustomerId[it.customerId] ??= []);
    uniqPush(idx.byCustomerId[it.customerId], id);

    (idx.byKind[it.kind] ??= []);
    uniqPush(idx.byKind[it.kind], id);

    if (it.serviceType) {
      (idx.byServiceType[it.serviceType] ??= []);
      uniqPush(idx.byServiceType[it.serviceType], id);
    }

    if (it.billingTaxId) {
      const k = String(it.billingTaxId).trim();
      if (k) {
        (idx.byBillingTaxId[k] ??= []);
        uniqPush(idx.byBillingTaxId[k], id);
      }
    }

    const kym = ym(it.occurredAt);
    (idx.byYearMonth[kym] ??= []);
    uniqPush(idx.byYearMonth[kym], id);

    const blob = [it.notes ?? "", it.billingName ?? "", (it.tags ?? []).join(" "), it.kind, it.serviceType ?? ""].join(
      " "
    );

    for (const t of tokenize(blob)) {
      (idx.tokens[t] ??= []);
      uniqPush(idx.tokens[t], id);
    }
  }

  return idx;
}

export function upsertHistoryItem(item: CustomerHistoryItem) {
  const list = loadHistory();
  const normalized = normalizeItem(item);
  const next = list.some((x) => x.id === normalized.id)
    ? list.map((x) => (x.id === normalized.id ? normalized : x))
    : [normalized, ...list];
  saveHistory(next);
}

export function deleteHistoryItem(id: string) {
  const list = loadHistory();
  saveHistory(list.filter((x) => x.id !== id));
}

export type HistoryQuery = {
  customerId?: string;
  kind?: HistoryKind;
  serviceType?: ServiceType;
  billingTaxId?: string;
  from?: string;
  to?: string;
  text?: string;
};

function intersect(a: Set<string>, b: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of b) if (a.has(id)) out.add(id);
  return out;
}

export function queryHistory(q: HistoryQuery): CustomerHistoryItem[] {
  const items = loadHistory();
  const idx = loadIndex() ?? rebuildIndex(items);

  let set = new Set(items.map((x) => x.id));

  if (q.customerId) set = intersect(set, idx.byCustomerId[q.customerId] ?? []);
  if (q.kind) set = intersect(set, idx.byKind[q.kind] ?? []);
  if (q.serviceType) set = intersect(set, idx.byServiceType[q.serviceType] ?? []);
  if (q.billingTaxId) set = intersect(set, idx.byBillingTaxId[String(q.billingTaxId).trim()] ?? []);

  if (q.text) {
    const tokens = tokenize(q.text);
    for (const t of tokens) {
      set = intersect(set, idx.tokens[t] ?? []);
      if (set.size === 0) break;
    }
  }

  let result = items.filter((x) => set.has(x.id));
  if (q.from) {
    const from = q.from;
    result = result.filter((x) => x.occurredAt >= from);
  }
  if (q.to) {
    const to = q.to;
    result = result.filter((x) => x.occurredAt <= to);
  }
  result.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return result;
}

export function historyByCustomer(customerId: string) {
  return queryHistory({ customerId });
}

// Compatibility helper used by existing modules.
export function addHistory(
  item: {
    customerId: string;
    kind?: HistoryKind;
    serviceType?: ServiceType;
    billingName?: string;
    billingTaxId?: string;
    projectId?: string;
    osiId?: string;
    quoteId?: string;
    amount?: number;
    currency?: "DOP" | "USD";
    notes?: string;
    score?: number;
    tags?: string[];
    type?: "CALL" | "WHATSAPP" | "VISIT" | "QUOTE_SENT" | "FEEDBACK" | "WON" | "LOST";
    note?: string;
    createdAt?: string;
  }
) {
  const entry = normalizeItem({
    ...item,
    id: uid(),
    schemaVersion: 1,
    occurredAt: item.createdAt || new Date().toISOString(),
    kind: item.kind ?? mapLegacyTypeToKind(item.type),
    notes: item.notes ?? item.note,
  });
  upsertHistoryItem(entry);
  return entry;
}
