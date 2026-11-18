import { getMembershipRef } from "@/lib/sessionStore";

export type EconomicControlState = "DRAFT" | "READY" | "INVOICED" | "CLOSED";
export type ThirdPartyCostsStatus = "PENDING" | "NONE" | "CONFIRMED";
export type CollectionState = "NOT_VALIDATED" | "PENDING" | "PARTIAL" | "CURRENT" | "EXEMPTED";

export type EconomicControlWorkspace = Readonly<{
  case: Readonly<{ caseRef: string; caseCode: string; clientName: string }>;
  proposal: null | Readonly<{ proposalRef: string; reference: string; revisionRef: string; revision: number; currency: string; total: number; acceptedAt: string }>;
  authority: null | Readonly<{ kind: "EXECUTION_ORDER" | "STORAGE_AGREEMENT"; authorityRef: string; authorityCode: string; contractRef: string | null }>;
  financials: Readonly<{
    currency: string; baseAmount: number; addendaAmount: number; controlledTotal: number;
    changes: readonly Readonly<{ changeRef: string; changeCode: string; state: string; documentKind: string; changeKind: string; serviceName: string; currency: string; amount: number; economicControlReady: boolean }>[];
  }>;
  control: Readonly<{
    version: number; state: EconomicControlState; billingEvidenceRef: string | null; completionEvidenceRef: string | null;
    thirdPartyCostsStatus: ThirdPartyCostsStatus; thirdPartyEvidenceRef: string | null; collectionState: CollectionState;
    collectionEvidenceRef: string | null; invoiceRef: string | null; invoiceIssuedAt: string | null; closedAt: string | null;
    notes: string | null; history: readonly Readonly<{ action: string; at: string; actorMembershipId: string }>[];
  }>;
  blockers: readonly Readonly<{ code: string; label: string }>[];
  replayed?: boolean;
}>;

export type EconomicControlCommand = Readonly<{
  action: "SAVE_DRAFT" | "MARK_READY" | "RECORD_INVOICE" | "CLOSE";
  expectedVersion: number;
  billingEvidenceRef: string | null;
  completionEvidenceRef: string | null;
  thirdPartyCostsStatus: ThirdPartyCostsStatus;
  thirdPartyEvidenceRef: string | null;
  collectionState: CollectionState;
  collectionEvidenceRef: string | null;
  invoiceRef: string | null;
  notes: string | null;
}>;

export class EconomicControlApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = "EconomicControlApiError"; }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
}

async function hash(value: unknown) {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function request(authorization: string | undefined, caseRef: string, init: RequestInit = {}) {
  const membershipRef = getMembershipRef();
  if (!authorization || !membershipRef) throw new EconomicControlApiError(401, "COMMERCIAL_AUTH_REQUIRED");
  const response = await fetch(`/api/crm/services/economic-control/${encodeURIComponent(caseRef)}`, {
    ...init, credentials: "omit", cache: "no-store",
    headers: { Authorization: `Bearer ${authorization}`, "X-OSI-Membership-Ref": membershipRef, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new EconomicControlApiError(response.status, typeof body?.error === "string" ? body.error : "ECONOMIC_CONTROL_UNAVAILABLE");
  return body.data as EconomicControlWorkspace;
}

export const economicControlApi = Object.freeze({
  workspace: (authorization: string | undefined, caseRef: string, signal?: AbortSignal) => request(authorization, caseRef, { signal }),
  command: async (authorization: string | undefined, caseRef: string, input: EconomicControlCommand) => {
    const requestId = crypto.randomUUID();
    const operation = `ECONOMIC_CONTROL_${input.action}`;
    const payload = { operation, requestId, ...input };
    const payloadHash = await hash(payload);
    return request(authorization, caseRef, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...input }) });
  },
});
