export type ClientPortalData = Readonly<{
  accessRef: string;
  purpose: "VISIT" | "INFORMATION_REQUEST" | "MINI_SURVEY";
  expiresAt: string;
  credentialKind: "TOKEN" | "SHORT_CODE";
  scopes: readonly string[];
  contactName: string;
  case: Readonly<{ caseCode: string }>;
  visit: Readonly<{
    visitRef: string;
    method: string | null;
    scheduledStart: string;
    scheduledEnd: string | null;
    status: string;
    instructions: string | null;
    reason: string | null;
    evaluator: Readonly<{ evaluatorRef: string | null; displayName: string; role: string }>;
    route: readonly Readonly<{ role: string; order: number; countryCode: string; provinceState: string | null; cityMunicipality: string; sector: string | null; streetAndNumber: string | null; buildingResidential: string | null; floorUnit: string | null; arrivalReference: string | null }>[];
    fee: Readonly<{ disposition: string; amount: number; currency: string }> | null;
    clientResponse: Readonly<{ state: string; version: number }>;
  }> | null;
  reasons: readonly Readonly<{ reasonRef: string; name: string; kind: string }>[];
  miniCatalog: readonly Readonly<{ articleRef: string; name: string }>[];
  contribution: Readonly<{ contributionRef: string; revision: number; version: number; status: string; source: string; notes: string | null; estimatedWeightKg: number; estimatedVolumeM3: number; metricLabel: string; items: readonly Readonly<{ itemRef: string; articleRef: string; name: string; quantity: number; measurements: unknown; notes: string | null; unitWeightKg: number | null; unitVolumeM3: number | null }>[]; assets: readonly Readonly<{ assetRef: string; category: string; documentType: string | null }>[] }> | null;
  notices: Readonly<{ surveySource: string; quoteAcceptanceAvailable: false; externalTransportEnabled: false }>;
}>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export async function clientPortalPayloadHash(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type InternalClientAccess = Readonly<{
  accessRef: string;
  purpose: "VISIT" | "INFORMATION_REQUEST" | "MINI_SURVEY";
  status: string;
  scopes: readonly string[];
  expiresAt: string;
  maxUses: number;
  useCount: number;
  version: number;
  contact: Readonly<{ contactRef: string; displayName: string }>;
  assignmentRef: string | null;
  communicationRef: string | null;
  clientResponseState: string;
  lastUsedAt: string | null;
}>;

async function internalResult<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok || payload.data === undefined) throw new Error(payload.error || "CLIENT_TEMPORARY_REQUEST_FAILED");
  return payload.data;
}

export function createInternalClientAccessApi(authorization?: string) {
  const request = <T>(url: string, init: RequestInit = {}) => fetch(url, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
  }).then(internalResult<T>);
  return Object.freeze({
    list: (caseRef: string) => request<readonly InternalClientAccess[]>(`/api/client-access/internal?caseRef=${encodeURIComponent(caseRef)}`),
    create: async (input: Readonly<{ caseRef: string; assignmentRef: string; contactRef: string; purpose: "VISIT" | "MINI_SURVEY"; scopes: readonly string[]; expiresAt: string; maxUses: number; shortCodeEnabled: boolean }>) => {
      const requestId = crypto.randomUUID();
      const signed = { operation: "ACCESS_CREATE", requestId, caseRef: input.caseRef, assignmentRef: input.assignmentRef, contactRef: input.contactRef, communicationRef: null, purpose: input.purpose, scopes: [...input.scopes].sort(), expiresAt: input.expiresAt, maxUses: input.maxUses, shortCodeEnabled: input.shortCodeEnabled };
      const payloadHash = await clientPortalPayloadHash(signed);
      return request<Readonly<{ access: InternalClientAccess; oneTimeCredentials: Readonly<{ link: string; shortCode: string | null }> | null; replayed: boolean }>>("/api/client-access/internal", { method: "POST", body: JSON.stringify({ requestId, payloadHash, ...input, communicationRef: null, scopes: signed.scopes }) });
    },
    revoke: async (access: InternalClientAccess, reason: string) => {
      const requestId = crypto.randomUUID(); const signed = { operation: "ACCESS_REVOKE", requestId, expectedVersion: access.version, reason }; const payloadHash = await clientPortalPayloadHash(signed);
      return request<Readonly<{ access: InternalClientAccess; replayed: boolean }>>(`/api/client-access/internal/${encodeURIComponent(access.accessRef)}`, { method: "POST", body: JSON.stringify({ requestId, payloadHash, expectedVersion: access.version, reason }) });
    },
  });
}

async function result<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; data?: T; error?: string };
  if (!response.ok || payload.ok !== true || payload.data === undefined) throw new Error(payload.error || "CLIENT_TEMPORARY_REQUEST_FAILED");
  return payload.data;
}

export function createClientPortalApi(accessRef: string, token: string | null) {
  const headers = () => ({ "Content-Type": "application/json", ...(token ? { Authorization: `ClientAccess ${token}` } : {}) });
  const post = <T>(path: string, body: unknown) => fetch(`/api/client-access/${encodeURIComponent(accessRef)}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body), credentials: "omit", cache: "no-store" }).then(result<T>);
  return Object.freeze({
    open: () => post<ClientPortalData>("", {}),
    openWithCode: (code: string) => fetch(`/api/client-access/${encodeURIComponent(accessRef)}/code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), credentials: "omit", cache: "no-store" }).then(result<ClientPortalData>),
    visit: async (action: "VISIT_CONFIRM" | "VISIT_CHANGE_REQUEST" | "VISIT_CANCEL_REQUEST", expectedVersion: number, reasonRef: string | null, comment: string | null, suggestedAvailability: readonly string[]) => {
      const requestId = crypto.randomUUID(); const signed = { operation: action, requestId, expectedVersion, reasonRef, comment, suggestedAvailability }; const payloadHash = await clientPortalPayloadHash(signed);
      return post<{ state: string; version: number }>("/visit", { requestId, payloadHash, action, expectedVersion, reasonRef, comment, suggestedAvailability });
    },
    mini: async (expectedVersion: number, submit: boolean, notes: string | null, items: readonly Readonly<{ articleRef: string; quantity: number; measurements: null; notes: string | null }>[]) => {
      const requestId = crypto.randomUUID(); const signed = { operation: submit ? "MINI_SURVEY_COMPLETE" : "MINI_SURVEY_SAVE", requestId, expectedVersion, submit, notes, items }; const payloadHash = await clientPortalPayloadHash(signed);
      return post<{ contribution: ClientPortalData["contribution"]; missingMetricCount: number }>("/mini", { requestId, payloadHash, expectedVersion, submit, notes, items });
    },
    qr: async (qrPayload: string) => { const requestId = crypto.randomUUID(); const signed = { operation: "QR_CONFIRM", requestId, qrPayload }; const payloadHash = await clientPortalPayloadHash(signed); return post<{ verified: boolean }>("/qr", { requestId, payloadHash, qrPayload }); },
    upload: async (file: File, category: "PHOTO" | "DOCUMENT", documentType: string | null) => {
      const bytes = await file.arrayBuffer(); const sha = await crypto.subtle.digest("SHA-256", bytes); const sha256 = [...new Uint8Array(sha)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); const requestId = crypto.randomUUID();
      const signed = { operation: "SURVEY_ASSET_UPLOAD", requestId, category, documentType, mimeType: file.type, sizeBytes: file.size, sha256 }; const payloadHash = await clientPortalPayloadHash(signed);
      const response = await fetch(`/api/client-access/${encodeURIComponent(accessRef)}/upload`, { method: "POST", headers: { Authorization: `ClientAccess ${token || ""}`, "Content-Type": file.type, "x-client-request-id": requestId, "x-client-payload-hash": payloadHash, "x-client-asset-category": category, ...(documentType ? { "x-client-document-type": documentType } : {}) }, body: bytes, credentials: "omit", cache: "no-store" });
      return result<{ assetRef: string; category: string }>(response);
    },
  });
}
