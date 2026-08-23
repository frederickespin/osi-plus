import { getToken } from "@/lib/sessionStore";
import {
  PIPELINE_CASE_STATUSES,
  type AssignOwnerInput,
  type CrmAllowedTransitions,
  type CrmMutationReceipt,
  type CrmOwnerCatalog,
  type CrmOwnerOption,
  type CrmPipelineCase,
  type CrmPipelineFilters,
  type CrmPipelineList,
  type CrmPipelineSummary,
  type EvidenceType,
  type PipelineCaseStatus,
  type TransitionInput,
  type UnassignOwnerInput,
} from "@/crm-relational/types";

const API_PREFIX = "/api/crm";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_RETRY_AFTER_MS = 5_000;
const SAFE_RETRY_AFTER_MS = 150;
const STATUS = new Set<string>(PIPELINE_CASE_STATUSES);
const MODE = new Set(["LOCAL", "EXPORT", "IMPORT"]);
const EVIDENCE = new Set(["SURVEY", "QUOTE", "PROJECT", "APPROVAL", "ADDENDUM"]);
const COMMAND = new Set(["TRANSITION", "REOPEN", "ASSIGN_OWNER", "UNASSIGN_OWNER"]);
const PUBLIC_CASE_REF_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export class CrmPipelineError extends Error {
  readonly status: number;
  readonly code: string;
  readonly recoverable: boolean;
  readonly retryAfterMs: number | null;

  constructor(status: number, code: string, options: { recoverable?: boolean; retryAfterMs?: number | null } = {}) {
    super(code);
    this.name = "CrmPipelineError";
    this.status = status;
    this.code = code;
    this.recoverable = options.recoverable === true;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value as JsonRecord;
}
function exactKeys(value: JsonRecord, allowed: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
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
    throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return Number(value);
}
function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value;
}
function status(value: unknown): PipelineCaseStatus {
  if (typeof value !== "string" || !STATUS.has(value)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return value as PipelineCaseStatus;
}
function iso(value: unknown): string {
  const result = text(value);
  if (result === null || !Number.isFinite(Date.parse(result))) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return result;
}

function parseOwner(value: unknown): CrmPipelineCase["owner"] {
  if (value === null) return null;
  const row = object(value);
  exactKeys(row, ["displayName", "role", "membershipStatus"]);
  return Object.freeze({ displayName: text(row.displayName)!, role: text(row.role)!, membershipStatus: text(row.membershipStatus)! });
}

function parseOwnerOption(value: unknown): CrmOwnerOption {
  const row = object(value);
  exactKeys(row, ["ownerRef", "displayName", "role"]);
  if (row.role !== "V") throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  const ownerRef = text(row.ownerRef);
  const displayName = text(row.displayName);
  if (!ownerRef || !displayName) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return Object.freeze({ presentationKey: crypto.randomUUID(), ownerRef, displayName, role: "V" });
}

function parseCase(value: unknown): CrmPipelineCase {
  const row = object(value);
  exactKeys(row, ["caseRef", "caseCode", "clientName", "mode", "serviceType", "customerType", "status", "estimatedCbm", "requiresSurvey", "surveyMethod", "originLocation", "destinationLocation", "destinationContracted", "assetsCount", "owner", "quoteCount", "eventCount", "createdAt", "updatedAt"]);
  if (typeof row.mode !== "string" || !MODE.has(row.mode)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  if (typeof row.caseRef !== "string" || !PUBLIC_CASE_REF_PATTERN.test(row.caseRef)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  return Object.freeze({
    caseRef: row.caseRef, caseCode: text(row.caseCode)!, clientName: text(row.clientName, true), mode: row.mode as CrmPipelineCase["mode"],
    serviceType: text(row.serviceType)!, customerType: text(row.customerType)!, status: status(row.status), estimatedCbm: finite(row.estimatedCbm),
    requiresSurvey: bool(row.requiresSurvey), surveyMethod: text(row.surveyMethod)!, originLocation: text(row.originLocation)!, destinationLocation: text(row.destinationLocation)!,
    destinationContracted: bool(row.destinationContracted), assetsCount: integer(row.assetsCount), owner: parseOwner(row.owner), quoteCount: integer(row.quoteCount),
    eventCount: integer(row.eventCount), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
  });
}

function parseError(responseStatus: number, value: unknown): CrmPipelineError {
  let code = "CRM_PIPELINE_REQUEST_FAILED";
  let recoverable = false;
  let retryAfterMs: number | null = null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as JsonRecord;
    if (typeof row.code === "string" && /^[A-Z][A-Z0-9_]{2,100}$/.test(row.code)) code = row.code;
    recoverable = row.recoverable === true;
    if (Number.isSafeInteger(row.retryAfterMs) && Number(row.retryAfterMs) >= 0 && Number(row.retryAfterMs) <= MAX_RETRY_AFTER_MS) retryAfterMs = Number(row.retryAfterMs);
  }
  return new CrmPipelineError(responseStatus, code, { recoverable, retryAfterMs });
}

function linkedSignal(external: AbortSignal | undefined, controller: AbortController): () => void {
  if (!external) return () => undefined;
  if (external.aborted) controller.abort(external.reason);
  const abort = () => controller.abort(external.reason);
  external.addEventListener("abort", abort, { once: true });
  return () => external.removeEventListener("abort", abort);
}

function assertJsonResponse(response: Response): void {
  const contentType = response.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_CONTENT_TYPE_INVALID");
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
    throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  const raw = await response.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
  }
}

export type CrmCommandIntent = Readonly<{
  execute(signal?: AbortSignal): Promise<CrmMutationReceipt>;
  retry(signal?: AbortSignal): Promise<CrmMutationReceipt>;
  cancel(): void;
}>;

export class CrmPipelineApi {
  private readonly fetchImpl: FetchLike;
  private readonly tokenProvider: () => string | null;
  private readonly timeoutMs: number;

  constructor(options: { fetchImpl?: FetchLike; tokenProvider?: () => string | null; timeoutMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.tokenProvider = options.tokenProvider ?? getToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request(path: string, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string; signal?: AbortSignal } = {}): Promise<unknown> {
    const token = this.tokenProvider();
    if (!token) throw new CrmPipelineError(401, "COMMERCIAL_AUTH_REQUIRED");
    const controller = new AbortController();
    const unlink = linkedSignal(options.signal, controller);
    const timer = globalThis.setTimeout(() => controller.abort(new DOMException("Request timeout", "TimeoutError")), this.timeoutMs);
    try {
      const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${token}` });
      if (options.body !== undefined) headers.set("Content-Type", "application/json");
      if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
      const response = await this.fetchImpl(`${API_PREFIX}${path}`, {
        method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
      assertJsonResponse(response);
      const payload = await readJsonResponse(response);
      if (!response.ok) throw parseError(response.status, payload);
      return payload;
    } finally {
      globalThis.clearTimeout(timer);
      unlink();
    }
  }

  async list(filters: CrmPipelineFilters, signal?: AbortSignal): Promise<CrmPipelineList> {
    const requestedPageSize = Math.min(filters.pageSize, 100);
    const params = new URLSearchParams({ page: String(filters.page), pageSize: String(requestedPageSize) });
    if (filters.status) params.set("status", filters.status);
    if (filters.owner) params.set("unassigned", filters.owner === "unassigned" ? "true" : "false");
    if (filters.search) params.set("q", filters.search);
    const root = object(await this.request(`/pipeline-cases?${params}`, { signal }));
    exactKeys(root, ["ok", "total", "page", "pageSize", "data"]);
    if (root.ok !== true || !Array.isArray(root.data)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const total = integer(root.total);
    const page = integer(root.page, 1);
    const pageSize = integer(root.pageSize, 1);
    const data = root.data.map(parseCase);
    if (page !== filters.page || pageSize !== requestedPageSize || data.length > pageSize || data.length > total
      || new Set(data.map((item) => item.caseRef)).size !== data.length) {
      throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    }
    return Object.freeze({ total, page, pageSize, data: Object.freeze(data) });
  }

  async detail(caseRef: string, signal?: AbortSignal): Promise<CrmPipelineCase> {
    if (!PUBLIC_CASE_REF_PATTERN.test(caseRef)) throw new CrmPipelineError(404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
    const root = object(await this.request(`/pipeline-cases/${encodeURIComponent(caseRef)}`, { signal }));
    exactKeys(root, ["ok", "data"]);
    if (root.ok !== true) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const result = parseCase(root.data);
    if (result.caseRef !== caseRef) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return result;
  }

  async summary(signal?: AbortSignal): Promise<CrmPipelineSummary> {
    const root = object(await this.request("/pipeline-summary", { signal }));
    exactKeys(root, ["ok", "data"]);
    if (root.ok !== true) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const data = object(root.data);
    exactKeys(data, ["total", "assigned", "unassigned", "byStatus", "sla"]);
    const byStatus = object(data.byStatus);
    exactKeys(byStatus, [...PIPELINE_CASE_STATUSES]);
    const counts = Object.fromEntries(PIPELINE_CASE_STATUSES.map((item) => [item, integer(byStatus[item])])) as Record<PipelineCaseStatus, number>;
    const sla = object(data.sla);
    exactKeys(sla, ["overdue", "basis"]);
    if (sla.overdue !== null || sla.basis !== "UNAVAILABLE") throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const total = integer(data.total);
    const assigned = integer(data.assigned);
    const unassigned = integer(data.unassigned);
    if (assigned + unassigned !== total || Object.values(counts).reduce((sum, value) => sum + value, 0) !== total) {
      throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    }
    return Object.freeze({ total, assigned, unassigned, byStatus: Object.freeze(counts), sla: Object.freeze({ overdue: null, basis: "UNAVAILABLE" }) });
  }

  async allowedTransitions(caseId: string, signal?: AbortSignal): Promise<CrmAllowedTransitions> {
    const root = object(await this.request(`/pipeline-cases/${encodeURIComponent(caseId)}/allowed-transitions`, { signal }));
    exactKeys(root, ["ok", "case"]);
    const row = object(root.case);
    exactKeys(row, ["caseId", "version", "status", "transitions"]);
    if (!Array.isArray(row.transitions)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    const transitions = row.transitions.map((item) => {
      const value = object(item); exactKeys(value, ["toStatus", "evidenceType"]);
      const evidenceType = value.evidenceType === null ? null : text(value.evidenceType);
      if (evidenceType !== null && !EVIDENCE.has(evidenceType)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
      return Object.freeze({ toStatus: status(value.toStatus), evidenceType: evidenceType as EvidenceType | null });
    });
    return Object.freeze({ caseId: text(row.caseId)!, version: integer(row.version, 1), status: status(row.status), transitions: Object.freeze(transitions) });
  }


  async ownerOptions(filters: { page: number; pageSize: number; search?: string }, signal?: AbortSignal): Promise<CrmOwnerCatalog> {
    const params = new URLSearchParams({ page: String(filters.page), pageSize: String(Math.min(filters.pageSize, 100)) });
    if (filters.search) params.set("q", filters.search);
    const root = object(await this.request(`/pipeline-owner-options?${params}`, { signal }));
    exactKeys(root, ["ok", "total", "page", "pageSize", "data"]);
    if (root.ok !== true || !Array.isArray(root.data)) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    return Object.freeze({
      total: integer(root.total),
      page: integer(root.page, 1),
      pageSize: integer(root.pageSize, 1),
      data: Object.freeze(root.data.map(parseOwnerOption)),
    });
  }

  private async mutate(path: string, key: string, body: unknown, signal?: AbortSignal): Promise<CrmMutationReceipt> {
    const root = object(await this.request(path, { method: "POST", body, idempotencyKey: key, signal }));
    exactKeys(root, ["ok", "command"]);
    const row = object(root.command);
    exactKeys(row, ["caseId", "commandType", "previousVersion", "resultingVersion", "previousStatus", "resultingStatus", "owner", "replayed"]);
    if (typeof row.commandType !== "string" || !COMMAND.has(row.commandType) || typeof row.replayed !== "boolean") throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    if (row.owner !== null) {
      const owner = object(row.owner);
      exactKeys(owner, ["assigned"]);
      if (owner.assigned !== true) throw new CrmPipelineError(502, "CRM_PIPELINE_RESPONSE_INVALID");
    }
    return Object.freeze({ caseId: text(row.caseId)!, commandType: row.commandType as CrmMutationReceipt["commandType"], previousVersion: integer(row.previousVersion, 1), resultingVersion: integer(row.resultingVersion, 2), previousStatus: status(row.previousStatus), resultingStatus: status(row.resultingStatus), replayed: row.replayed });
  }

  private intent(path: string, initialBody: unknown): CrmCommandIntent {
    const key = crypto.randomUUID();
    const body = initialBody;
    let cancelled = false;
    let automaticRetryUsed = false;
    let activeController: AbortController | null = null;
    const run = async (signal?: AbortSignal): Promise<CrmMutationReceipt> => {
      if (cancelled) throw new CrmPipelineError(409, "CRM_PIPELINE_INTENT_CANCELLED");
      const controller = new AbortController();
      activeController = controller;
      const unlink = linkedSignal(signal, controller);
      try { return await this.mutate(path, key, body, controller.signal); }
      catch (error) {
        if (error instanceof CrmPipelineError && error.code === "CRM_PIPELINE_COMMAND_IN_PROGRESS" && !automaticRetryUsed) {
          automaticRetryUsed = true;
          const retryAfterMs = error.retryAfterMs ?? SAFE_RETRY_AFTER_MS;
          await new Promise<void>((resolve, reject) => {
            const finish = () => { controller.signal.removeEventListener("abort", abort); resolve(); };
            const timer = globalThis.setTimeout(finish, retryAfterMs);
            const abort = () => { globalThis.clearTimeout(timer); controller.signal.removeEventListener("abort", abort); reject(controller.signal.reason); };
            controller.signal.addEventListener("abort", abort, { once: true });
          });
          if (cancelled) throw new CrmPipelineError(409, "CRM_PIPELINE_INTENT_CANCELLED");
          return this.mutate(path, key, body, controller.signal);
        }
        throw error;
      } finally {
        unlink();
        if (activeController === controller) activeController = null;
      }
    };
    return Object.freeze({ execute: run, retry: run, cancel: () => { cancelled = true; activeController?.abort(new DOMException("Intent cancelled", "AbortError")); } });
  }

  transition(input: TransitionInput): CrmCommandIntent {
    return this.intent(`/pipeline-cases/${encodeURIComponent(input.caseId)}/transition`, { expectedVersion: input.expectedVersion, toStatus: input.toStatus, reasonCode: input.reasonCode, evidence: input.evidence });
  }
  assignOwner(input: AssignOwnerInput): CrmCommandIntent {
    return this.intent(`/pipeline-cases/${encodeURIComponent(input.caseId)}/assign-owner`, { expectedVersion: input.expectedVersion, ownerRef: input.ownerRef });
  }
  unassignOwner(input: UnassignOwnerInput): CrmCommandIntent {
    return this.intent(`/pipeline-cases/${encodeURIComponent(input.caseId)}/unassign-owner`, { expectedVersion: input.expectedVersion });
  }
}
