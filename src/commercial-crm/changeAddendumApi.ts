import { getMembershipRef } from "@/lib/sessionStore";

export type ChangeClass = "NO_COST" | "ECONOMIC_OR_TERM" | "EMERGENCY";
export type ChangeState = "DRAFT" | "PENDING_CLIENT" | "PENDING_INTERNAL" | "APPROVED" | "EXECUTED" | "INVOICED" | "REJECTED" | "CANCELLED";

export type CaseChange = Readonly<{
  changeRef: string; changeCode: string; version: number; state: ChangeState; documentKind: "OPERATIONAL_RECORD" | "ADDENDUM"; changeClass: ChangeClass; changeKind: "ADDED" | "MODIFIED" | "REMOVED"; requestedBy: "CLIENT" | "COORDINATION" | "OPERATIONS" | "THIRD_PARTY";
  serviceCode: string | null; serviceName: string; reason: string; quantity: number | null; unit: string | null;
  currency: string; catalogAmount: number; adjustedAmount: number; adjustmentReason: string | null; scheduleDays: number; operationalImpact: string | null;
  requestEvidenceRef: string | null; clientAcceptanceRef: string | null; internalApprovalRef: string | null;
  provisionalAuthorizedAt: string | null; executedAt: string | null; ratifiedAt: string | null; economicControlReady: boolean;
  createdAt: string; updatedAt: string;
}>;

export type ChangeAddendumWorkspace = Readonly<{
  case: Readonly<{ caseRef: string; caseCode: string; clientName: string }>;
  services: null | Readonly<{ selectionRef: string; revision: number; mode: string; primary: Readonly<{ code: string; name: string }> | null; associated: readonly Readonly<{ code: string; name: string }>[] }>;
  proposal: null | Readonly<{ proposalRef: string; reference: string; revisionRef: string; revision: number; currency: string; total: number; acceptedAt: string }>;
  authority: null | Readonly<{ kind: "EXECUTION_ORDER" | "STORAGE_AGREEMENT"; authorityRef: string; authorityCode: string; contractRef: string | null; issuedAt: string | null }>;
  blockers: readonly Readonly<{ code: string; label: string }>[];
  workspaceVersion: number;
  changes: readonly CaseChange[];
  replayed?: boolean;
}>;

export type ChangeCommand = Readonly<{
  action: "SAVE_DRAFT" | "SEND_TO_CLIENT" | "RECORD_CLIENT_ACCEPTANCE" | "APPROVE_INTERNAL" | "AUTHORIZE_EMERGENCY" | "MARK_EXECUTED" | "REJECT" | "CANCEL";
  expectedWorkspaceVersion: number; changeRef: string | null; expectedChangeVersion: number;
  changeClass: ChangeClass | null; changeKind: "ADDED" | "MODIFIED" | "REMOVED" | null; requestedBy: "CLIENT" | "COORDINATION" | "OPERATIONS" | "THIRD_PARTY" | null;
  serviceCode: string | null; serviceName: string | null; reason: string | null; quantity: number | null; unit: string | null;
  catalogAmount: number | null; adjustedAmount: number | null; currency: string | null; adjustmentReason: string | null;
  scheduleDays: number; operationalImpact: string | null; evidenceRef: string | null;
}>;

export class ChangeAddendumApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = "ChangeAddendumApiError"; }
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
  if (!authorization || !membershipRef) throw new ChangeAddendumApiError(401, "COMMERCIAL_AUTH_REQUIRED");
  const response = await fetch(`/api/crm/services/change-addenda/${encodeURIComponent(caseRef)}`, { ...init, credentials: "omit", cache: "no-store", headers: { Authorization: `Bearer ${authorization}`, "X-OSI-Membership-Ref": membershipRef, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  const body = await response.json();
  if (!response.ok) throw new ChangeAddendumApiError(response.status, typeof body?.error === "string" ? body.error : "CHANGE_ADDENDUM_UNAVAILABLE");
  return body.data as ChangeAddendumWorkspace;
}

export const changeAddendumApi = Object.freeze({
  workspace: (authorization: string | undefined, caseRef: string, signal?: AbortSignal) => request(authorization, caseRef, { signal }),
  command: async (authorization: string | undefined, caseRef: string, input: ChangeCommand) => {
    const requestId = crypto.randomUUID();
    const payload = { operation: `CHANGE_ADDENDUM_${input.action}`, requestId, ...input };
    const payloadHash = await hash(payload);
    return request(authorization, caseRef, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...input }) });
  },
});
