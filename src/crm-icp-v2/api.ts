import { getMembershipRef } from "@/lib/sessionStore";

const API_ROOT = "/api/crm/icp-v2";
const MAX_RESPONSE_BYTES = 1_000_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type IcpClientProfile = "INDIVIDUAL" | "CORPORATE" | "LEAD_ACCOUNT" | "COMMERCIAL" | "DIPLOMATIC";
export type IcpChannel = "WHATSAPP" | "INSTAGRAM" | "FACEBOOK" | "RECOMMENDATION" | "YOUTUBE" | "OTHER_SOCIAL" | "PROMOTION" | "CALL" | "EMAIL" | "WEB" | "REFERRED";
export type IcpDestinationStatus = "CONFIRMED" | "APPROXIMATE" | "PENDING";

export type IcpAddressInput = Readonly<{
  countryCode: string;
  provinceState: string;
  cityMunicipality: string;
  sector: string;
  streetAndNumber: string;
  saveForClient: boolean;
  label: string;
}>;

export type IcpDraft = Readonly<{
  client: Readonly<{ kind: "EXISTING"; clientRef: string }> | Readonly<{
    kind: "INLINE";
    displayName: string;
    phone: string;
    email: string;
    duplicateFingerprint?: string | null;
  }>;
  clientProfileType: IcpClientProfile;
  caseContact: Readonly<{ displayName: string; phone: string; email: string }>;
  intakeChannel: IcpChannel;
  requirementNotes: string;
  destinationStatus: IcpDestinationStatus;
  origin: IcpAddressInput;
  destination: IcpAddressInput;
}>;

export type IcpClientSearchResult = Readonly<{
  clientRef: string;
  displayName: string;
  type: string;
  status: string;
  matchHints: Readonly<{ taxId: string | null; phone: string | null; email: string | null }>;
}>;

export type IcpCreateReceipt = Readonly<{ caseRef: string; clientRef: string; version: number; routeRevision: number; replayed: boolean }>;

export class CrmIcpV2ClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly matchFingerprint: string | null;
  constructor(status: number, code: string, matchFingerprint: string | null = null) {
    super(code);
    this.name = "CrmIcpV2ClientError";
    this.status = status;
    this.code = code;
    this.matchFingerprint = matchFingerprint;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_INVALID");
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/[^0-9+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\D/g, "")}` : "";
}

function normalizeAddress(input: IcpAddressInput) {
  return {
    countryCode: input.countryCode.trim().toUpperCase(),
    provinceState: input.provinceState.trim() || null,
    cityMunicipality: input.cityMunicipality.trim(),
    sector: input.sector.trim() || null,
    streetAndNumber: input.streetAndNumber.trim() || null,
    buildingResidential: null,
    floorUnit: null,
    arrivalReference: null,
    locationContactName: null,
    locationContactPhone: null,
  };
}

function rawSelection(input: IcpAddressInput) {
  return {
    kind: "NEW_ADDRESS",
    saveForClient: input.saveForClient,
    label: input.label.trim() || null,
    address: normalizeAddress(input),
  };
}

function normalizedSelection(input: IcpAddressInput) {
  return rawSelection(input);
}

function deriveMode(originCountry: string, destinationCountry: string | null) {
  if (destinationCountry === null || (originCountry === "DO" && destinationCountry === "DO")) return "LOCAL";
  if (originCountry === "DO") return "EXPORT";
  return "IMPORT";
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
}

async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createPayload(draft: IcpDraft, requestId: string) {
  const caseContact = {
    displayName: draft.caseContact.displayName.trim(),
    phone: draft.caseContact.phone.trim(),
    email: draft.caseContact.email.trim() || null,
  };
  const normalizedContact = {
    ...caseContact,
    phoneNormalized: normalizePhone(caseContact.phone),
    emailNormalized: caseContact.email?.toLowerCase() ?? null,
  };
  const client = draft.client.kind === "EXISTING"
    ? { kind: "EXISTING", clientRef: draft.client.clientRef }
    : {
        kind: "INLINE",
        displayName: draft.client.displayName.trim(),
        taxId: null,
        phone: draft.client.phone.trim(),
        email: draft.client.email.trim() || null,
        duplicateConfirmation: draft.client.duplicateFingerprint
          ? { confirmed: true, matchFingerprint: draft.client.duplicateFingerprint }
          : null,
      };
  const normalizedClient = draft.client.kind === "EXISTING" ? client : {
    ...client,
    taxId: null,
    phoneNormalized: normalizePhone(draft.client.phone.trim()),
    emailNormalized: draft.client.email.trim().toLowerCase() || null,
  };
  const route = {
    destinationStatus: draft.destinationStatus,
    origin: rawSelection(draft.origin),
    destination: draft.destinationStatus === "PENDING" ? null : rawSelection(draft.destination),
    additionalStops: [],
  };
  const mode = deriveMode(draft.origin.countryCode.trim().toUpperCase(), draft.destinationStatus === "PENDING" ? null : draft.destination.countryCode.trim().toUpperCase());
  const unsigned = {
    requestId,
    client,
    clientProfileType: draft.clientProfileType,
    caseContact,
    mode,
    serviceType: "PENDING_DEFINITION",
    intakeChannel: draft.intakeChannel,
    requirementNotes: draft.requirementNotes.trim() || null,
    requiresSurvey: false,
    surveyMethod: "NO_APLICA",
    route,
  };
  const normalized = {
    operation: "CREATE_ICP_V2",
    requestId,
    client: normalizedClient,
    clientProfileType: draft.clientProfileType,
    caseContact: normalizedContact,
    mode,
    serviceType: "PENDING_DEFINITION",
    intakeChannel: draft.intakeChannel,
    requirementNotes: draft.requirementNotes.trim() || null,
    estimatedCbm: null,
    requiresSurvey: false,
    surveyMethod: "NO_APLICA",
    route: {
      destinationStatus: draft.destinationStatus,
      origin: normalizedSelection(draft.origin),
      destination: draft.destinationStatus === "PENDING" ? null : normalizedSelection(draft.destination),
      additionalStops: [],
    },
  };
  return { ...unsigned, payloadHash: await sha256(normalized) };
}

async function readJson(response: Response) {
  const raw = await response.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_INVALID");
  try { return JSON.parse(raw) as unknown; } catch { throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_INVALID"); }
}

function assertPrivateJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const cache = (response.headers.get("cache-control") || "").toLowerCase().split(",").map((item) => item.trim());
  const vary = (response.headers.get("vary") || "").toLowerCase().split(",").map((item) => item.trim());
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
    || !cache.includes("private") || !cache.includes("no-store")
    || !vary.includes("authorization") || !vary.includes("origin") || vary.includes("*")) {
    throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_HEADERS_INVALID");
  }
}

export class CrmIcpV2Api {
  private readonly tokenProvider: () => string | null;
  private readonly membershipRefProvider: () => string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(
    tokenProvider: () => string | null,
    fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    membershipRefProvider: () => string | null = getMembershipRef,
  ) {
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.membershipRefProvider = membershipRefProvider;
  }

  private async post(path: string, body: unknown, signal?: AbortSignal) {
    const token = this.tokenProvider();
    if (!token) throw new CrmIcpV2ClientError(401, "COMMERCIAL_AUTH_REQUIRED");
    const membershipRef = this.membershipRefProvider();
    if (!membershipRef || !UUID_V4.test(membershipRef)) {
      throw new CrmIcpV2ClientError(400, "MT01B_MEMBERSHIP_SELECTION_INVALID");
    }
    const response = await this.fetchImpl(`${API_ROOT}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-OSI-Membership-Ref": membershipRef,
      },
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(body),
      signal,
    });
    assertPrivateJson(response);
    const payload = await readJson(response);
    if (!response.ok) {
      const row = object(payload);
      const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
      const code = typeof row.error === "string" && /^[A-Z][A-Z0-9_]{2,100}$/.test(row.error) ? row.error : "CRM_ICP_REQUEST_FAILED";
      throw new CrmIcpV2ClientError(response.status, code, typeof data.matchFingerprint === "string" && /^[0-9a-f]{64}$/.test(data.matchFingerprint) ? data.matchFingerprint : null);
    }
    return payload;
  }

  async searchClients(query: string, signal?: AbortSignal) {
    const root = object(await this.post("/clients/search", { query: query.trim(), page: 1, pageSize: 10 }, signal));
    exactKeys(root, ["ok", "total", "page", "pageSize", "data"]);
    if (root.ok !== true || !Array.isArray(root.data) || !Number.isSafeInteger(root.total)) throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_INVALID");
    const data = root.data.map((item) => {
      const row = object(item);
      exactKeys(row, ["clientRef", "displayName", "type", "status", "matchHints"]);
      if (typeof row.clientRef !== "string" || !UUID_V4.test(row.clientRef) || typeof row.displayName !== "string" || typeof row.type !== "string" || typeof row.status !== "string") throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_INVALID");
      const hints = object(row.matchHints);
      exactKeys(hints, ["taxId", "phone", "email"]);
      return Object.freeze({ clientRef: row.clientRef, displayName: row.displayName, type: row.type, status: row.status, matchHints: { taxId: typeof hints.taxId === "string" ? hints.taxId : null, phone: typeof hints.phone === "string" ? hints.phone : null, email: typeof hints.email === "string" ? hints.email : null } });
    });
    return Object.freeze({ total: Number(root.total), data: Object.freeze(data) });
  }

  async create(draft: IcpDraft, requestId: string): Promise<IcpCreateReceipt> {
    const root = object(await this.post("/pipeline-cases", await createPayload(draft, requestId)));
    exactKeys(root, ["ok", "data", "replayed"]);
    const data = object(root.data);
    exactKeys(data, ["caseRef", "version", "routeRevision", "clientRef"]);
    if (root.ok !== true || typeof root.replayed !== "boolean" || typeof data.caseRef !== "string" || !UUID_V4.test(data.caseRef) || typeof data.clientRef !== "string" || !UUID_V4.test(data.clientRef) || !Number.isSafeInteger(data.version) || !Number.isSafeInteger(data.routeRevision)) throw new CrmIcpV2ClientError(502, "CRM_ICP_RESPONSE_INVALID");
    return Object.freeze({ caseRef: data.caseRef, clientRef: data.clientRef, version: Number(data.version), routeRevision: Number(data.routeRevision), replayed: root.replayed });
  }
}
