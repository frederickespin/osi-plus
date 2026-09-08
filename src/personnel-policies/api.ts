export type PersonnelProfile = Readonly<{
  profileRef: string;
  displayName: string;
  jobTitle: string | null;
  employmentStatus: string;
  availabilityStatus: string;
  restrictions: Record<string, unknown>;
  notes: string | null;
  validFrom: string | null;
  validTo: string | null;
  capabilities: readonly Readonly<{
    assignmentRef: string;
    capabilityRef: string;
    code: string;
    name: string;
  }>[];
  zones: readonly Readonly<{
    assignmentRef: string;
    ruleRef: string;
    code: string;
    name: string;
  }>[];
  overrides: readonly Readonly<{
    overrideRef: string;
    kind: string;
    startsAt: string;
    endsAt: string;
    method: string | null;
    travelBufferMinutes: number | null;
    reason: string;
    status: string;
    version: number;
  }>[];
}>;
export type PersonnelCapability = Readonly<{
  capabilityRef: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
}>;
export type VisitPolicy = Readonly<{
  policyRef: string;
  seriesRef: string;
  version: number;
  state: string;
  timezone: string;
  defaultVisitMinutes: number;
  minimumTravelBufferMinutes: number;
  virtualPreparationMinutes: number;
  validFrom: string | null;
  validTo: string | null;
  windows: readonly Readonly<{
    windowRef: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
    capacity: number;
    method: string;
    calendarDate: string | null;
    zone: null | { ruleRef: string; code: string; name: string };
    requiresApproval: boolean;
    kind: string;
  }>[];
}>;
export type VisitReason = Readonly<{
  reasonRef: string;
  code: string;
  name: string;
  kind: string;
  requesterOrigin: string | null;
  visibleToClient: boolean;
  visibleToEvaluator: boolean;
}>;
export type VisitException = Readonly<{
  requestRef: string;
  caseRef: string;
  caseCode: string;
  evaluator: { profileRef: string; displayName: string };
  reason: { reasonRef: string; code: string; name: string };
  method: string;
  requestedStart: string;
  requestedEnd: string;
  requesterOrigin: string;
  reasonDescription: string;
  requiredResources: readonly unknown[];
  impact: Record<string, unknown>;
  violatedRules: readonly string[];
  status: string;
  evaluatorResponse: string;
  adminDecision: string;
  alternativeStart: string | null;
  alternativeEnd: string | null;
  version: number;
  expiresAt: string | null;
}>;
export type PersonnelPoliciesWorkspace = Readonly<{
  personnel: readonly PersonnelProfile[];
  capabilities: readonly PersonnelCapability[];
  activePolicy: VisitPolicy | null;
  reasons: readonly VisitReason[];
  exceptions: readonly VisitException[];
  zones: readonly { ruleRef: string; code: string; name: string }[];
  precedence: readonly string[];
  generatedAt: string;
}>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function request<T>(
  authorization: string | undefined,
  init: RequestInit = {},
) {
  const response = await fetch("/api/personnel/policies", {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: {
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const type = response.headers.get("content-type") || "";
  const cache = response.headers.get("cache-control") || "";
  const vary = response.headers.get("vary") || "";
  if (
    !type.toLowerCase().includes("application/json") ||
    !cache.toLowerCase().includes("no-store") ||
    !/authorization/i.test(vary) ||
    !/origin/i.test(vary)
  )
    throw new Error("PERSONNEL_POLICIES_PRIVATE_CONTRACT_INVALID");
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok)
    throw Object.assign(
      new Error(body.error || "PERSONNEL_POLICIES_REQUEST_FAILED"),
      { status: response.status, code: body.error },
    );
  return body.data as T;
}
export function createPersonnelPoliciesApi(authorization?: string) {
  return Object.freeze({
    workspace: () => request<PersonnelPoliciesWorkspace>(authorization),
    mutate: async <T>(operation: string, payload: Record<string, unknown>) => {
      const requestId = crypto.randomUUID();
      const command = { operation, requestId, ...payload };
      return request<T>(authorization, {
        method: "POST",
        body: JSON.stringify({
          ...command,
          payloadHash: await sha256(command),
        }),
      });
    },
  });
}
