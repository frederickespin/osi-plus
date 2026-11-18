import { getMembershipRef } from "@/lib/sessionStore";

export type ExecutionOrder = Readonly<{
  orderRef: string;
  orderCode: string;
  version: number;
  state: "DRAFT" | "ISSUED";
  kind: "MOVING" | "TRANSPORT";
  plannedStart: string;
  plannedEnd: string;
  contractEvidenceRef: string | null;
  coordinatorName: string | null;
  crewLeadName: string | null;
  driverName: string | null;
  vehicleName: string | null;
  instructions: string | null;
  issuedAt: string | null;
  updatedAt: string;
}>;

export type ExecutionOrderWorkspace = Readonly<{
  case: Readonly<{ caseRef: string; caseCode: string; clientName: string; mode: "LOCAL" | "EXPORT" | "IMPORT" }>;
  services: null | Readonly<{
    selectionRef: string;
    revision: number;
    mode: string;
    primary: Readonly<{ kind: string; code: string; name: string; category: string | null; position: number }> | null;
    associated: readonly Readonly<{ kind: string; code: string; name: string; category: string | null; position: number }>[];
  }>;
  proposal: null | Readonly<{
    proposalRef: string;
    reference: string;
    revisionRef: string;
    revision: number;
    name: string;
    currency: string;
    totals: Readonly<Record<string, number>>;
    acceptedAt: string;
    lines: readonly Readonly<{ concept: string; quantity: string; unit: string; quotedPrice: string | null; currency: string; position: number }>[];
  }>;
  route: readonly Readonly<{ role: "ORIGIN" | "DESTINATION" | "STOP"; stopOrder: number; countryCode: string; provinceState: string | null; cityMunicipality: string; sector: string | null; streetAndNumber: string | null; buildingResidential: string | null; floorUnit: string | null }>[];
  blockers: readonly Readonly<{ code: string; label: string }>[];
  order: ExecutionOrder | null;
  replayed?: boolean;
}>;

export class ExecutionOrderApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "ExecutionOrderApiError";
  }
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
  if (!authorization || !membershipRef) throw new ExecutionOrderApiError(401, "COMMERCIAL_AUTH_REQUIRED");
  const response = await fetch(`/api/crm/services/execution-orders/${encodeURIComponent(caseRef)}`, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${authorization}`,
      "X-OSI-Membership-Ref": membershipRef,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new ExecutionOrderApiError(response.status, typeof body?.error === "string" ? body.error : "EXECUTION_ORDER_UNAVAILABLE");
  return body.data as ExecutionOrderWorkspace;
}

export const executionOrderApi = Object.freeze({
  workspace: (authorization: string | undefined, caseRef: string, signal?: AbortSignal) => request(authorization, caseRef, { signal }),
  command: async (authorization: string | undefined, caseRef: string, input: Readonly<Record<string, unknown>>) => {
    const requestId = crypto.randomUUID();
    const operation = `EXECUTION_ORDER_${input.action}`;
    const payload = { operation, requestId, ...input };
    const payloadHash = await hash(payload);
    return request(authorization, caseRef, { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...input }) });
  },
});

