import {
  PIPELINE_CASE_STATUSES,
  type CrmPipelineCase,
  type CrmPipelineCaseDetail,
  type CrmPipelineFilters,
  type CrmPipelineList,
  type CrmPipelineSummary,
  type PipelineCaseStatus,
} from "./types";

const API_PREFIX = "/api/crm";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const STATUSES = new Set<string>(PIPELINE_CASE_STATUSES);
const MODES = new Set(["LOCAL", "EXPORT", "IMPORT"]);
const PUBLIC_ERROR_CODES = Object.freeze({
  401: new Set(["COMMERCIAL_AUTH_REQUIRED"]),
  403: new Set(["CRM_PIPELINE_PERMISSION_FORBIDDEN"]),
  404: new Set(["CRM_PIPELINE_RESOURCE_NOT_FOUND"]),
  409: new Set(["CRM_PIPELINE_DISABLED"]),
  503: new Set(["CRM_PIPELINE_CONFIGURATION_INVALID", "CRM_PIPELINE_DATABASE_UNAVAILABLE"]),
} as const);
const FALLBACK_ERROR_CODES = Object.freeze({
  401: "COMMERCIAL_AUTH_REQUIRED",
  403: "CRM_PIPELINE_PERMISSION_FORBIDDEN",
  404: "CRM_PIPELINE_RESOURCE_NOT_FOUND",
  409: "CRM_PIPELINE_DISABLED",
  503: "CRM_PIPELINE_DATABASE_UNAVAILABLE",
} as const);

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export class CrmPipelineReadError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "CrmPipelineReadError";
    this.status = status;
    this.code = code;
  }
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, allowed: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 || code === 0xfeff;
  });
}

function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > 2_000 || hasControlCharacters(value)) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return value;
}

function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return Number(value);
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return value;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value;
}

function status(value: unknown): PipelineCaseStatus {
  if (typeof value !== "string" || !STATUSES.has(value)) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return value as PipelineCaseStatus;
}

function iso(value: unknown): string {
  const parsed = text(value);
  if (parsed === null || !Number.isFinite(Date.parse(parsed))) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return parsed;
}

function owner(value: unknown): CrmPipelineCase["owner"] {
  if (value === null) return null;
  const row = record(value);
  exactKeys(row, ["displayName", "role", "membershipStatus"]);
  return Object.freeze({
    displayName: text(row.displayName)!,
    role: text(row.role)!,
    membershipStatus: text(row.membershipStatus)!,
  });
}

function pipelineCase(value: unknown): CrmPipelineCase {
  const row = record(value);
  exactKeys(row, [
    "id", "caseCode", "clientName", "mode", "serviceType", "customerType", "status",
    "estimatedCbm", "requiresSurvey", "surveyMethod", "originLocation", "destinationLocation",
    "destinationContracted", "assetsCount", "owner", "quoteCount", "eventCount", "createdAt", "updatedAt",
  ]);
  if (typeof row.mode !== "string" || !MODES.has(row.mode)) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return Object.freeze({
    id: text(row.id)!,
    caseCode: text(row.caseCode)!,
    clientName: text(row.clientName, true),
    mode: row.mode as CrmPipelineCase["mode"],
    serviceType: text(row.serviceType)!,
    customerType: text(row.customerType)!,
    status: status(row.status),
    estimatedCbm: finite(row.estimatedCbm),
    requiresSurvey: bool(row.requiresSurvey),
    surveyMethod: text(row.surveyMethod)!,
    originLocation: text(row.originLocation)!,
    destinationLocation: text(row.destinationLocation)!,
    destinationContracted: bool(row.destinationContracted),
    assetsCount: integer(row.assetsCount),
    owner: owner(row.owner),
    quoteCount: integer(row.quoteCount),
    eventCount: integer(row.eventCount),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  });
}

function serviceClient(value: unknown): CrmPipelineCaseDetail["client"] {
  if (value === null) return null;
  const row = record(value);
  exactKeys(row, ["displayName", "type", "status"]);
  return Object.freeze({
    displayName: text(row.displayName)!,
    type: text(row.type, true),
    status: text(row.status)!,
  });
}

function pipelineCaseDetail(value: unknown): CrmPipelineCaseDetail {
  const row = record(value);
  exactKeys(row, [
    "caseRef", "caseNumber", "status", "mode", "serviceType", "client", "owner", "createdAt", "updatedAt",
  ]);
  if (row.mode !== null && (typeof row.mode !== "string" || !MODES.has(row.mode))) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  let publicOwner: CrmPipelineCaseDetail["owner"] = null;
  if (row.owner !== null) {
    const value = record(row.owner);
    exactKeys(value, ["displayName"]);
    publicOwner = Object.freeze({ displayName: text(value.displayName)! });
  }
  return Object.freeze({
    caseRef: text(row.caseRef)!,
    caseNumber: text(row.caseNumber, true),
    status: status(row.status),
    mode: row.mode as CrmPipelineCaseDetail["mode"],
    serviceType: text(row.serviceType, true),
    client: serviceClient(row.client),
    owner: publicOwner,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  });
}

function assertResponseHeaders(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase().split(",").map((value) => value.trim());
  const vary = (response.headers.get("vary") || "").toLowerCase().split(",").map((value) => value.trim());
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
    || !cacheControl.includes("private")
    || !cacheControl.includes("no-store")
    || !vary.includes("authorization")
    || !vary.includes("origin")
    || vary.includes("*")) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_HEADERS_INVALID");
  }
}

function responseError(statusCode: number, value: unknown) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  const candidate = typeof body.code === "string" ? body.code : typeof body.error === "string" ? body.error : "";
  if (!Object.hasOwn(PUBLIC_ERROR_CODES, statusCode)) {
    return new CrmPipelineReadError(503, "CRM_PIPELINE_REQUEST_FAILED");
  }
  const status = statusCode as keyof typeof PUBLIC_ERROR_CODES;
  const code = PUBLIC_ERROR_CODES[status].has(candidate as never)
    ? candidate
    : FALLBACK_ERROR_CODES[status];
  return new CrmPipelineReadError(status, code);
}

async function readJson(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  const raw = await response.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
}

function linkSignal(external: AbortSignal | undefined, controller: AbortController) {
  if (!external) return () => undefined;
  if (external.aborted) controller.abort(external.reason);
  const abort = () => controller.abort(external.reason);
  external.addEventListener("abort", abort, { once: true });
  return () => external.removeEventListener("abort", abort);
}

export class CrmPipelineReadApi {
  private readonly fetchImpl: FetchLike;
  private readonly tokenProvider: () => string | null;
  private readonly timeoutMs: number;

  constructor(options: { fetchImpl?: FetchLike; tokenProvider?: () => string | null; timeoutMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.tokenProvider = options.tokenProvider ?? (() => null);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const token = this.tokenProvider();
    if (!token) throw new CrmPipelineReadError(401, "COMMERCIAL_AUTH_REQUIRED");
    const controller = new AbortController();
    const unlink = linkSignal(signal, controller);
    const timer = globalThis.setTimeout(() => controller.abort(new DOMException("Request timeout", "TimeoutError")), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${API_PREFIX}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      assertResponseHeaders(response);
      const payload = await readJson(response);
      if (response.status !== 200) {
        if (response.ok) throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
        throw responseError(response.status, payload);
      }
      return payload;
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) {
        throw new CrmPipelineReadError(503, "CRM_PIPELINE_REQUEST_TIMEOUT");
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
      unlink();
    }
  }

  async list(filters: CrmPipelineFilters, signal?: AbortSignal): Promise<CrmPipelineList> {
    if (!Number.isSafeInteger(filters.page) || filters.page < 1
      || !Number.isSafeInteger(filters.pageSize) || filters.pageSize < 1
      || (filters.status !== undefined && !STATUSES.has(filters.status))
      || (filters.mode !== undefined && !MODES.has(filters.mode))
      || (filters.owner !== undefined && !["assigned", "unassigned"].includes(filters.owner))
      || (filters.search !== undefined && (!filters.search || filters.search.length > 100 || filters.search !== filters.search.trim() || hasControlCharacters(filters.search)))) {
      throw new CrmPipelineReadError(400, "CRM_PIPELINE_FILTER_INVALID");
    }
    const requestedPageSize = Math.min(filters.pageSize, 100);
    const query = new URLSearchParams({ page: String(filters.page), pageSize: String(requestedPageSize) });
    if (filters.status) query.set("status", filters.status);
    if (filters.mode) query.set("mode", filters.mode);
    if (filters.owner) query.set("unassigned", filters.owner === "unassigned" ? "true" : "false");
    if (filters.search) query.set("q", filters.search);
    const root = record(await this.get(`/pipeline-cases?${query}`, signal));
    exactKeys(root, ["ok", "total", "page", "pageSize", "data"]);
    if (root.ok !== true || !Array.isArray(root.data)) throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const total = integer(root.total);
    const page = integer(root.page, 1);
    const pageSize = integer(root.pageSize, 1);
    const data = root.data.map(pipelineCase);
    const expectedRows = Math.min(pageSize, Math.max(0, total - ((page - 1) * pageSize)));
    if (page !== filters.page || pageSize !== requestedPageSize || data.length !== expectedRows
      || new Set(data.map((item) => item.id)).size !== data.length) {
      throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    }
    return Object.freeze({ total, page, pageSize, data: Object.freeze(data) });
  }

  async detail(caseRef: string, signal?: AbortSignal): Promise<CrmPipelineCaseDetail> {
    if (!caseRef || caseRef.length > 128 || hasControlCharacters(caseRef) || caseRef.includes("/") || caseRef !== caseRef.trim()) {
      throw new CrmPipelineReadError(400, "CRM_PIPELINE_FILTER_INVALID");
    }
    const root = record(await this.get(`/pipeline-cases/${encodeURIComponent(caseRef)}`, signal));
    exactKeys(root, ["ok", "data"]);
    if (root.ok !== true) throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const result = pipelineCaseDetail(root.data);
    if (result.caseRef !== caseRef) throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return result;
  }

  async summary(signal?: AbortSignal): Promise<CrmPipelineSummary> {
    const root = record(await this.get("/pipeline-summary", signal));
    exactKeys(root, ["ok", "data"]);
    if (root.ok !== true) throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const data = record(root.data);
    exactKeys(data, ["total", "assigned", "unassigned", "byStatus", "sla"]);
    const byStatus = record(data.byStatus);
    exactKeys(byStatus, [...PIPELINE_CASE_STATUSES]);
    const counts = Object.fromEntries(PIPELINE_CASE_STATUSES.map((item) => [item, integer(byStatus[item])])) as Record<PipelineCaseStatus, number>;
    const sla = record(data.sla);
    exactKeys(sla, ["overdue", "basis"]);
    if (sla.overdue !== null || sla.basis !== "UNAVAILABLE") throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const total = integer(data.total);
    const assigned = integer(data.assigned);
    const unassigned = integer(data.unassigned);
    const statusTotal = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (assigned + unassigned !== total || statusTotal !== total) {
      throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    }
    return Object.freeze({
      total,
      assigned,
      unassigned,
      byStatus: Object.freeze(counts),
      sla: Object.freeze({ overdue: null, basis: "UNAVAILABLE" }),
    });
  }
}

export function asCrmPipelineReadError(error: unknown) {
  return error instanceof CrmPipelineReadError
    ? error
    : new CrmPipelineReadError(503, "CRM_PIPELINE_REQUEST_FAILED");
}
