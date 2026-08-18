import { getToken } from "@/lib/sessionStore";
import {
  PIPELINE_CASE_STATUSES,
  type CrmPipelineCase,
  type CrmPipelineFilters,
  type CrmPipelineList,
  type CrmPipelineSummary,
  type PipelineCaseStatus,
} from "./types";

const API_PREFIX = "/api/crm";
const DEFAULT_TIMEOUT_MS = 10_000;
const STATUSES = new Set<string>(PIPELINE_CASE_STATUSES);
const MODES = new Set(["LOCAL", "EXPORT", "IMPORT"]);

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
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
}

function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > 2_000) {
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

function assertResponseHeaders(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase().split(",").map((value) => value.trim());
  const vary = (response.headers.get("vary") || "").toLowerCase().split(",").map((value) => value.trim());
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
    || !cacheControl.includes("private")
    || !cacheControl.includes("no-store")
    || !vary.includes("authorization")) {
    throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_HEADERS_INVALID");
  }
}

function responseError(statusCode: number, value: unknown) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  const candidate = typeof body.code === "string" ? body.code : typeof body.error === "string" ? body.error : "";
  const code = /^[A-Z][A-Z0-9_]{2,100}$/.test(candidate) ? candidate : "CRM_PIPELINE_REQUEST_FAILED";
  return new CrmPipelineReadError(statusCode, code);
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
    this.tokenProvider = options.tokenProvider ?? getToken;
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
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      assertResponseHeaders(response);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
      }
      if (!response.ok) throw responseError(response.status, payload);
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
    const query = new URLSearchParams({ page: String(filters.page), pageSize: String(Math.min(filters.pageSize, 100)) });
    if (filters.status) query.set("status", filters.status);
    if (filters.mode) query.set("mode", filters.mode);
    if (filters.owner) query.set("unassigned", filters.owner === "unassigned" ? "true" : "false");
    if (filters.search) query.set("q", filters.search);
    const root = record(await this.get(`/pipeline-cases?${query}`, signal));
    exactKeys(root, ["ok", "total", "page", "pageSize", "data"]);
    if (root.ok !== true || !Array.isArray(root.data)) throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return Object.freeze({
      total: integer(root.total),
      page: integer(root.page, 1),
      pageSize: integer(root.pageSize, 1),
      data: Object.freeze(root.data.map(pipelineCase)),
    });
  }

  async detail(caseId: string, signal?: AbortSignal): Promise<CrmPipelineCase> {
    const root = record(await this.get(`/pipeline-cases/${encodeURIComponent(caseId)}`, signal));
    exactKeys(root, ["ok", "data"]);
    if (root.ok !== true) throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return pipelineCase(root.data);
  }

  async summary(signal?: AbortSignal): Promise<CrmPipelineSummary> {
    const root = record(await this.get("/pipeline-summary", signal));
    exactKeys(root, ["ok", "data"]);
    const data = record(root.data);
    exactKeys(data, ["total", "assigned", "unassigned", "byStatus", "sla"]);
    const byStatus = record(data.byStatus);
    exactKeys(byStatus, [...PIPELINE_CASE_STATUSES]);
    const counts = Object.fromEntries(PIPELINE_CASE_STATUSES.map((item) => [item, integer(byStatus[item])])) as Record<PipelineCaseStatus, number>;
    const sla = record(data.sla);
    exactKeys(sla, ["overdue", "basis"]);
    if (sla.overdue !== null || sla.basis !== "UNAVAILABLE") throw new CrmPipelineReadError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return Object.freeze({
      total: integer(data.total),
      assigned: integer(data.assigned),
      unassigned: integer(data.unassigned),
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
