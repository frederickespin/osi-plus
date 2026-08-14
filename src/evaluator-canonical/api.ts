import { getToken } from "@/lib/sessionStore";
import type {
  EvaluatorCatalogItem,
  EvaluatorDraftEnvelope,
  EvaluatorListQuery,
  EvaluatorServerGateway,
  EvaluatorSubmissionReceipt,
  EvaluatorVisitDetail,
  EvaluatorVisitSummary,
} from "@/evaluator-canonical/contracts";

const API_PREFIX = "/api/evaluator";
const DEFAULT_TIMEOUT_MS = 10_000;

export class EvaluatorApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "EvaluatorApiError";
    this.status = status;
    this.code = code;
  }
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EvaluatorApiError(502, "EVALUATOR_RESPONSE_INVALID");
  }
  return value as JsonObject;
}

function parseError(status: number, value: unknown): EvaluatorApiError {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
  const code = typeof row?.code === "string" && /^[A-Z][A-Z0-9_]{2,100}$/.test(row.code)
    ? row.code
    : "EVALUATOR_REQUEST_FAILED";
  return new EvaluatorApiError(status, code);
}

/**
 * Contrato preparado para un backend relacional futuro. No contiene mocks,
 * fallback local ni headers de identidad heredados.
 */
export class EvaluatorApi implements EvaluatorServerGateway {
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider: () => string | null;
  private readonly timeoutMs: number;

  constructor(
    fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    tokenProvider: () => string | null = getToken,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.fetchImpl = fetchImpl;
    this.tokenProvider = tokenProvider;
    this.timeoutMs = timeoutMs;
  }

  private async request(path: string, options: Readonly<{
    method?: "GET" | "PUT" | "POST";
    body?: unknown;
    idempotencyKey?: string;
    signal?: AbortSignal;
  }> = {}): Promise<unknown> {
    const token = this.tokenProvider();
    if (!token) throw new EvaluatorApiError(401, "EVALUATOR_AUTH_REQUIRED");

    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${token}` });
      if (options.body !== undefined) headers.set("Content-Type", "application/json");
      if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
      const response = await this.fetchImpl(`${API_PREFIX}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get("content-type") ?? "")) {
        throw new EvaluatorApiError(502, "EVALUATOR_RESPONSE_CONTENT_TYPE_INVALID");
      }
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new EvaluatorApiError(502, "EVALUATOR_RESPONSE_INVALID"); }
      if (!response.ok) throw parseError(response.status, payload);
      return payload;
    } finally {
      globalThis.clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  async listVisits(query: EvaluatorListQuery, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
    if (query.status) params.set("status", query.status);
    const row = object(await this.request(`/visits?${params}`, { signal }));
    if (typeof row.total !== "number" || !Array.isArray(row.data)) throw new EvaluatorApiError(502, "EVALUATOR_RESPONSE_INVALID");
    return Object.freeze({ total: row.total, data: Object.freeze(row.data as EvaluatorVisitSummary[]) });
  }

  async getVisit(visitId: string, signal?: AbortSignal) {
    const row = object(await this.request(`/visits/${encodeURIComponent(visitId)}`, { signal }));
    return Object.freeze(row as EvaluatorVisitDetail);
  }

  async listCatalog(signal?: AbortSignal) {
    const row = object(await this.request("/catalog", { signal }));
    if (!Array.isArray(row.data)) throw new EvaluatorApiError(502, "EVALUATOR_RESPONSE_INVALID");
    return Object.freeze(row.data as EvaluatorCatalogItem[]);
  }

  async saveDraft(input: Readonly<{ visitId: string; expectedVersion: number; draft: Readonly<Record<string, unknown>> }>, signal?: AbortSignal) {
    const row = object(await this.request(`/visits/${encodeURIComponent(input.visitId)}/draft`, {
      method: "PUT", body: { expectedVersion: input.expectedVersion, draft: input.draft }, signal,
    }));
    return Object.freeze(row as EvaluatorDraftEnvelope);
  }

  async submit(input: Readonly<{ visitId: string; expectedVersion: number; idempotencyKey: string }>, signal?: AbortSignal) {
    const row = object(await this.request(`/visits/${encodeURIComponent(input.visitId)}/submissions`, {
      method: "POST", body: { expectedVersion: input.expectedVersion }, idempotencyKey: input.idempotencyKey, signal,
    }));
    return Object.freeze(row as EvaluatorSubmissionReceipt);
  }
}
