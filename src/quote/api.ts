export type QuoteLine = Readonly<{ lineRef: string; sourceKind: "COSTING" | "MANUAL"; concept: string; quantity: string; unit: string; economicClass: "PR" | "EX" | "DE"; capturedCost?: string | null; suggestedPrice?: string | null; quotedPrice: string | null; currency: string; priceStatus: "CONFIRMED" | "PENDING"; position: number }>;
export type QuoteProposal = Readonly<{ proposalRef: string; reference: string; position: number; state: string; revisionRef: string; revision: number; proposalName: string; costingRevisionRef: string; currency: string; issueDate: string; validUntil: string; totals: Record<string, number>; lines: readonly QuoteLine[]; issues: readonly { code: string; message: string }[]; logicalSha256: string }>;
export type QuoteCase = Readonly<{ caseRef: string; caseCode: string; destinationStatus: string | null; proposals: readonly QuoteProposal[] }>;

async function request<T>(authorization: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "omit", cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), ...(init.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "QUOTE_REQUEST_FAILED");
  return body.data as T;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(",")}}`;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function command<T>(authorization: string | undefined, path: string, operation: string, payload: Record<string, unknown>) {
  const requestId = crypto.randomUUID();
  const payloadHash = await sha256(canonicalJson({ operation, requestId, ...payload }));
  return request<T>(authorization, path, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...payload }) });
}

export const quoteApi = Object.freeze({
  case: (authorization: string | undefined, caseRef: string) => request<QuoteCase>(authorization, `/api/quote/cases/${encodeURIComponent(caseRef)}`),
  create: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/create", "QUOTE_PROPOSAL_CREATE", payload),
  revise: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/revise", "QUOTE_PROPOSAL_REVISE", payload),
  publish: (authorization: string | undefined, proposalRef: string, expectedRevision: number) => command<QuoteProposal>(authorization, "/api/quote/proposals/publish", "QUOTE_PROPOSAL_PUBLISH", { proposalRef, expectedRevision }),
  send: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/send", "QUOTE_PROPOSAL_SEND", payload),
  decision: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/decision", "QUOTE_CLIENT_DECISION", payload),
  cancel: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/cancel", "QUOTE_PROPOSAL_CANCEL", payload),
});
