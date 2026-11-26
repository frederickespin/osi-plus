export type QuoteLine = Readonly<{
  lineRef: string; sourceKind: "COSTING" | "MANUAL"; packageMinimum?: boolean; concept: string; quantity: string; unit: string;
  economicClass: "PR" | "EX" | "DE"; capturedCost?: string | null; suggestedPrice?: string | null; quotedPrice: string | null;
  currency: string; priceStatus: "CONFIRMED" | "PENDING"; position: number;
  reason?: string | null;
  costingLineRef?: string | null; catalog?: Readonly<{ ruleRef: string; version: number; unitPrice: string }>;
}>;
type QuoteCommercialParty = null | Readonly<{ kind: string; reference: string; displayName: string; version: number; validFrom: string | null; validUntil: string | null }>;
type QuoteTerms = Readonly<{
  groupName?: string | null; paymentTerms: string; scope: string; exclusions: readonly string[];
  clientNotes: string | null; specialConditions: readonly string[]; templateRef: string | null; templateVersion: number | null;
}>;
type QuoteClientSnapshot = Readonly<{
  caseCode: string; client: { displayName: string } | null;
  route: readonly Readonly<{ role: string; stopOrder: number; kind?: "PICKUP" | "DELIVERY" | null; streetAndNumber: string | null; buildingResidential: string | null;
    floorUnit: string | null; sector: string | null; cityMunicipality: string | null; provinceState: string | null; countryCode: string | null }>[];
}>;
export type QuoteVersion = Readonly<{ revisionRef: string; revision: number; state: string; createdAt?: string }>;
export type QuoteProposal = Readonly<{
  proposalRef: string; reference: string; position: number; state: string; revisionRef: string; revision: number;
  proposalName: string; costingRevisionRef: string; sourceMode?: "CATALOG" | "PACKAGE" | "COSTING"; groupName?: string | null; flexibleBasis?: boolean;
  packageScope?: Readonly<{ name: string; version: number; pricingVersion: number; volumeM3: number; minimumSale?: string; adjustmentReason?: string | null }>;
  currency: string; issueDate: string; validUntil: string;
  commercialContext: Readonly<{ company: QuoteCommercialParty; leadAccount: QuoteCommercialParty; booker: QuoteCommercialParty; tariff: QuoteCommercialParty; associations: readonly string[]; referral: QuoteCommercialParty; commissionContext: unknown | null }>;
  payer: Readonly<{ kind: string; reference: string; displayName: string; sourceVersion: number; validFrom: string | null; validUntil: string | null; conditions?: string | null }>;
  terms?: QuoteTerms; exchange?: Readonly<Record<string, unknown>> | null; discount?: Readonly<Record<string, unknown>> | null;
  marginAuthorization?: Readonly<{ authorizationRef?: string; reason?: string }> | null;
  client?: QuoteClientSnapshot; versions?: readonly QuoteVersion[];
  totals: Record<string, number>; lines: readonly QuoteLine[];
  issues: readonly { code: string; message: string; severity?: string; status?: string }[]; logicalSha256: string;
}>;
export type QuoteClientProposal = Pick<QuoteProposal, "proposalRef" | "reference" | "revisionRef" | "revision" | "state" |
  "proposalName" | "groupName" | "currency" | "issueDate" | "validUntil" | "client" | "exchange"> & Readonly<{
  payer: { displayName: string }; terms?: Pick<QuoteTerms, "paymentTerms" | "scope" | "exclusions" | "clientNotes" | "specialConditions">;
  totals: { grossQuotedPrice?: number; discountAmount?: number; totalQuotedPrice?: number };
  packageScope?: { name: string; volumeM3: number };
  lines: readonly Pick<QuoteLine, "lineRef" | "concept" | "quantity" | "unit" | "quotedPrice" | "currency" | "position">[];
}>;
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

async function command<T>(authorization: string | undefined, path: string, operation: string, payload: Record<string, unknown>, requestId: string = crypto.randomUUID()) {
  const payloadHash = await sha256(canonicalJson({ operation, requestId, ...payload }));
  return request<T>(authorization, path, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...payload }) });
}

export const quoteApi = Object.freeze({
  case: (authorization: string | undefined, caseRef: string) => request<QuoteCase>(authorization, `/api/quote/cases/${encodeURIComponent(caseRef)}`),
  clientVersion: (authorization: string | undefined, proposalRef: string, revisionRef: string, signal: AbortSignal) =>
    request<QuoteClientProposal>(authorization, `/api/quote/proposals/${encodeURIComponent(proposalRef)}/client?revisionRef=${encodeURIComponent(revisionRef)}`, { signal }),
  create: (authorization: string | undefined, payload: Record<string, unknown>, requestId?: string) => command<QuoteProposal>(authorization, "/api/quote/proposals/create", "QUOTE_PROPOSAL_CREATE", payload, requestId),
  revise: (authorization: string | undefined, payload: Record<string, unknown>, requestId?: string) => command<QuoteProposal>(authorization, "/api/quote/proposals/revise", "QUOTE_PROPOSAL_REVISE", payload, requestId),
  publish: (authorization: string | undefined, proposalRef: string, expectedRevision: number, marginApprovalReason?: string) =>
    command<QuoteProposal>(authorization, "/api/quote/proposals/publish", "QUOTE_PROPOSAL_PUBLISH", {
      proposalRef, expectedRevision, ...(marginApprovalReason && { marginApprovalReason }),
    }),
  send: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/send", "QUOTE_PROPOSAL_SEND", payload),
  decision: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/decision", "QUOTE_CLIENT_DECISION", payload),
  cancel: (authorization: string | undefined, payload: Record<string, unknown>) => command<QuoteProposal>(authorization, "/api/quote/proposals/cancel", "QUOTE_PROPOSAL_CANCEL", payload),
});
