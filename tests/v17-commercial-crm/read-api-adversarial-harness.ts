import { CrmPipelineReadApi } from "/src/crm-relational/readApi";

const headers = { "Content-Type": "application/json", "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const statuses = ["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"];
const row = { id: "case-1", caseCode: "CASE-1", clientName: null, mode: "LOCAL", serviceType: "Servicio", customerType: "PERSON", status: "NEW_INBOX", estimatedCbm: 1, requiresSurvey: false, surveyMethod: "NONE", originLocation: "Origen", destinationLocation: "Destino", destinationContracted: false, assetsCount: 0, owner: null, quoteCount: 0, eventCount: 0, createdAt: "2026-08-18T10:00:00.000Z", updatedAt: "2026-08-18T10:00:00.000Z" };
const validList = { ok: true, total: 1, page: 1, pageSize: 25, data: [row] };
const validSummary = { ok: true, data: { total: 1, assigned: 0, unassigned: 1, byStatus: Object.fromEntries(statuses.map((status) => [status, status === "NEW_INBOX" ? 1 : 0])), sla: { overdue: null, basis: "UNAVAILABLE" } } };
type Scenario = { name: string; response: () => Response; operation?: "list" | "detail" | "summary"; expectedStatus?: number };
const json = (body: unknown, status = 200, customHeaders = headers) => new Response(JSON.stringify(body), { status, headers: customHeaders });
const scenarios: Scenario[] = [
  { name: "status-201", response: () => json(validList, 201) },
  { name: "status-204", response: () => new Response(null, { status: 204, headers }) },
  { name: "content-type", response: () => json(validList, 200, { ...headers, "Content-Type": "text/plain" }) },
  { name: "empty", response: () => new Response("", { status: 200, headers }) },
  { name: "truncated", response: () => new Response("{", { status: 200, headers }) },
  { name: "array", response: () => json([]) },
  { name: "missing-field", response: () => json({ ...validList, total: undefined }) },
  { name: "additional-field", response: () => json({ ...validList, nextCursor: "forbidden" }) },
  { name: "unknown-status", response: () => json({ ...validList, data: [{ ...row, status: "UNKNOWN" }] }) },
  { name: "non-finite", response: () => new Response(JSON.stringify(validList).replace('"estimatedCbm":1', '"estimatedCbm":1e400'), { status: 200, headers }) },
  { name: "page-mismatch", response: () => json({ ...validList, page: 2 }) },
  { name: "page-size-mismatch", response: () => json({ ...validList, pageSize: 100 }) },
  { name: "count-mismatch", response: () => json({ ...validList, total: 2 }) },
  { name: "duplicate-id", response: () => json({ ...validList, total: 2, data: [row, row] }) },
  { name: "summary-ok-false", operation: "summary", response: () => json({ ...validSummary, ok: false }) },
  { name: "summary-counts", operation: "summary", response: () => json({ ...validSummary, data: { ...validSummary.data, assigned: 1 } }) },
  { name: "detail-id", operation: "detail", response: () => json({ ok: true, data: { ...row, id: "wrong" } }) },
  { name: "oversized", response: () => new Response(JSON.stringify({ ...validList, padding: "x".repeat(1_000_001) }), { status: 200, headers }) },
  ...([401, 403, 404, 409, 503] as const).map((status) => ({ name: `error-${status}`, expectedStatus: status, response: () => json({ ok: false, error: "INTERNAL_DETAIL_MUST_NOT_ESCAPE" }, status) })),
];

const failed: string[] = [];
let passed = 0;
for (const scenario of scenarios) {
  let observed: RequestInit | undefined;
  let requested = "";
  const api = new CrmPipelineReadApi({
    tokenProvider: () => "secret-token-never-in-url",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => { requested = String(input); observed = init; return scenario.response(); }) as typeof fetch,
  });
  try {
    if (scenario.operation === "summary") await api.summary();
    else if (scenario.operation === "detail") await api.detail("case-1");
    else await api.list({ page: 1, pageSize: 25 });
    failed.push(`${scenario.name}:accepted`);
  } catch (error) {
    const status = Number((error as { status?: unknown }).status);
    if (scenario.expectedStatus !== undefined && status !== scenario.expectedStatus) failed.push(`${scenario.name}:status`);
    else if (requested.includes("secret-token") || observed?.method !== "GET" || observed?.credentials !== "omit" || new Headers(observed?.headers).get("Authorization") !== "Bearer secret-token-never-in-url" || new Headers(observed?.headers).has("Idempotency-Key")) failed.push(`${scenario.name}:request`);
    else passed += 1;
  }
}
document.body.dataset.result = failed.length === 0 ? "passed" : "failed";
document.body.dataset.details = JSON.stringify({ passed, failed });
