import { CRM_PIPELINE_CLIENT_MODES, resolveCrmPipelineClientMode } from "./clientMode";
import type { PipelineMode } from "./types";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API = "/api/crm";

export type CrmCaseFields = Readonly<{
  clientRef: string | null;
  mode: PipelineMode;
  serviceType: string;
  customerType: "L1_AGENT" | "L2_INTL_DIRECT" | "L3_CORPORATE" | "L4_PERSONAL";
  estimatedCbm: number;
  requiresSurvey: boolean;
  surveyMethod: "PRESENCIAL" | "VIRTUAL" | "LISTADO_FOTOS" | "NO_APLICA";
  originLocation: string;
  destinationLocation: string;
  destinationContracted: boolean;
}>;
export type CrmClientOption = Readonly<{ clientRef: string; displayName: string; type: string | null; status: string }>;
export type CrmMutationReceipt = Readonly<{ caseRef: string; version: number; replayed: boolean }>;

export class CrmCaseMutationClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.name = "CrmCaseMutationClientError"; this.status = status; this.code = code; }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
}
async function sha256(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: readonly string[]) {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
}
function privateHeaders(response: Response) {
  const cache = (response.headers.get("cache-control") || "").toLowerCase();
  const vary = (response.headers.get("vary") || "").toLowerCase();
  if (!cache.includes("private") || !cache.includes("no-store") || !vary.includes("authorization") || !vary.includes("origin") || vary.includes("*")) {
    throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_HEADERS_INVALID");
  }
}
function safeRef(value: unknown) {
  if (typeof value !== "string" || !UUID_V4.test(value)) throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value;
}
function safeText(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  const invalidCharacter = typeof value === "string" && [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 || code === 0xfeff;
  });
  if (typeof value !== "string" || value.length > 2_000 || invalidCharacter) throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value;
}
async function json(response: Response) {
  privateHeaders(response);
  const text = await response.text();
  try { return JSON.parse(text) as unknown; } catch { throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID"); }
}

export function isCrmCaseMutationUiEnabled() {
  const result = resolveCrmPipelineClientMode();
  return result.valid && result.mode === CRM_PIPELINE_CLIENT_MODES.LOCAL_ONLY;
}

export class CrmCaseMutationApi {
  private readonly tokenProvider: () => string | null;
  private readonly fetchImpl: typeof fetch;
  constructor(tokenProvider: () => string | null, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
  }

  private async mutation(method: "POST" | "PATCH", path: string, operation: "CREATE" | "UPDATE", fields: CrmCaseFields, expectedVersion?: number) {
    const token = this.tokenProvider();
    if (!token) throw new CrmCaseMutationClientError(401, "COMMERCIAL_AUTH_REQUIRED");
    const requestId = crypto.randomUUID();
    const command = { operation, requestId, ...fields, ...(operation === "UPDATE" ? { expectedVersion } : {}) };
    const body = { ...command, payloadHash: await sha256(command) };
    delete (body as Record<string, unknown>).operation;
    const response = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", body: JSON.stringify(body),
    });
    const root = object(await json(response));
    if (!response.ok) {
      const code = typeof root.error === "string" ? root.error : "CRM_PIPELINE_REQUEST_FAILED";
      throw new CrmCaseMutationClientError(response.status, code);
    }
    exact(root, ["ok", "data", "replayed"]);
    if (root.ok !== true || typeof root.replayed !== "boolean") throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const data = object(root.data);
    exact(data, ["caseRef", "version"]);
    if (typeof data.version !== "number" || !Number.isSafeInteger(data.version) || data.version < 1) throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return Object.freeze({ caseRef: safeRef(data.caseRef), version: data.version, replayed: root.replayed });
  }

  create(fields: CrmCaseFields) { return this.mutation("POST", "/pipeline-cases", "CREATE", fields); }
  update(caseRef: string, expectedVersion: number, fields: CrmCaseFields) {
    if (!UUID_V4.test(caseRef)) throw new CrmCaseMutationClientError(404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
    return this.mutation("PATCH", `/pipeline-cases/${encodeURIComponent(caseRef)}`, "UPDATE", fields, expectedVersion);
  }

  async clients(search = "", page = 1): Promise<Readonly<{ total: number; data: readonly CrmClientOption[] }>> {
    const token = this.tokenProvider();
    if (!token) throw new CrmCaseMutationClientError(401, "COMMERCIAL_AUTH_REQUIRED");
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) query.set("q", search);
    const response = await this.fetchImpl(`${API}/client-options?${query}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
    });
    const root = object(await json(response));
    if (!response.ok) throw new CrmCaseMutationClientError(response.status, typeof root.error === "string" ? root.error : "CRM_PIPELINE_REQUEST_FAILED");
    exact(root, ["ok", "total", "page", "pageSize", "data"]);
    if (root.ok !== true || !Array.isArray(root.data) || !Number.isSafeInteger(root.total)) throw new CrmCaseMutationClientError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const data = root.data.map((candidate) => {
      const row = object(candidate); exact(row, ["clientRef", "displayName", "type", "status"]);
      return Object.freeze({ clientRef: safeRef(row.clientRef), displayName: safeText(row.displayName)!, type: safeText(row.type, true), status: safeText(row.status)! });
    });
    return Object.freeze({ total: Number(root.total), data: Object.freeze(data) });
  }
}
