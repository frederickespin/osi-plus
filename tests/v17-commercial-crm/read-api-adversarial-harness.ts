import { CrmPipelineReadApi } from "/src/crm-relational/readApi";

const headers = { "Content-Type": "application/json", "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const caseRef = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const clientRef = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const statuses = ["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"];
const row = { caseRef, caseCode: "CASE-1", client: null, mode: "LOCAL", serviceType: "Servicio", customerType: "PERSON", status: "NEW_INBOX", estimatedCbm: 1, requiresSurvey: false, surveyMethod: "NONE", originLocation: "Origen", destinationLocation: "Destino", destinationContracted: false, assetsCount: 0, owner: null, quoteCount: 0, eventCount: 0, createdAt: "2026-08-18T10:00:00.000Z", updatedAt: "2026-08-18T10:00:00.000Z" };
const detail = { caseRef, version: 1, caseCode: "CASE-1", status: "NEW_INBOX", mode: "LOCAL", serviceType: "Servicio", customerType: "PERSON", estimatedCbm: 1, requiresSurvey: false, surveyMethod: "NONE", originLocation: "Origen", destinationLocation: "Destino", destinationContracted: true, assetsCount: 0, quoteCount: 0, eventCount: 0, client: null, owner: null, createdAt: "2026-08-18T10:00:00.000Z", updatedAt: "2026-08-18T10:00:00.000Z" };
const validList = { ok: true, total: 1, page: 1, pageSize: 25, data: [row] };
const validSummary = { ok: true, data: { total: 1, assigned: 0, unassigned: 1, byStatus: Object.fromEntries(statuses.map((status) => [status, status === "NEW_INBOX" ? 1 : 0])), sla: { overdue: null, basis: "UNAVAILABLE" } } };
type Scenario = { name: string; response: () => Response; operation?: "list" | "detail" | "summary"; expectedStatus?: number };
const json = (body: unknown, status = 200, customHeaders = headers) => new Response(JSON.stringify(body), { status, headers: customHeaders });
const scenarios: Scenario[] = [
  { name: "status-201", response: () => json(validList, 201) },
  { name: "status-204", response: () => new Response(null, { status: 204, headers }) },
  { name: "content-type", response: () => json(validList, 200, { ...headers, "Content-Type": "text/plain" }) },
  { name: "vary-origin-missing", response: () => json(validList, 200, { ...headers, Vary: "Authorization" }) },
  { name: "vary-authorization-missing", response: () => json(validList, 200, { ...headers, Vary: "Origin" }) },
  { name: "vary-wildcard", response: () => json(validList, 200, { ...headers, Vary: "Authorization, Origin, *" }) },
  { name: "empty", response: () => new Response("", { status: 200, headers }) },
  { name: "truncated", response: () => new Response("{", { status: 200, headers }) },
  { name: "array", response: () => json([]) },
  { name: "missing-field", response: () => json({ ...validList, total: undefined }) },
  { name: "additional-field", response: () => json({ ...validList, nextCursor: "forbidden" }) },
  { name: "list-internal-id", response: () => json({ ...validList, data: [{ ...row, id: "forbidden" }] }) },
  { name: "list-public-ref-name", response: () => json({ ...validList, data: [{ ...row, publicRef: caseRef }] }) },
  { name: "list-legacy-client-name", response: () => json({ ...validList, data: [{ ...row, clientName: "forbidden" }] }) },
  { name: "unknown-status", response: () => json({ ...validList, data: [{ ...row, status: "UNKNOWN" }] }) },
  { name: "non-finite", response: () => new Response(JSON.stringify(validList).replace('"estimatedCbm":1', '"estimatedCbm":1e400'), { status: 200, headers }) },
  { name: "page-mismatch", response: () => json({ ...validList, page: 2 }) },
  { name: "page-size-mismatch", response: () => json({ ...validList, pageSize: 100 }) },
  { name: "count-mismatch", response: () => json({ ...validList, total: 2 }) },
  { name: "duplicate-case-ref", response: () => json({ ...validList, total: 2, data: [row, row] }) },
  { name: "summary-ok-false", operation: "summary", response: () => json({ ...validSummary, ok: false }) },
  { name: "summary-counts", operation: "summary", response: () => json({ ...validSummary, data: { ...validSummary.data, assigned: 1 } }) },
  { name: "detail-id", operation: "detail", response: () => json({ ok: true, data: { ...detail, caseRef: "wrong" } }) },
  { name: "detail-internal-id", operation: "detail", response: () => json({ ok: true, data: { ...detail, id: "forbidden" } }) },
  { name: "detail-public-ref-name", operation: "detail", response: () => json({ ok: true, data: { ...detail, publicRef: caseRef } }) },
  { name: "detail-tenant-id", operation: "detail", response: () => json({ ok: true, data: { ...detail, tenantId: "forbidden" } }) },
  { name: "detail-legacy-client-name", operation: "detail", response: () => json({ ok: true, data: { ...detail, clientName: "forbidden" } }) },
  { name: "detail-case-number-alias", operation: "detail", response: () => json({ ok: true, data: { ...detail, caseNumber: "forbidden" } }) },
  { name: "detail-client-id", operation: "detail", response: () => json({ ok: true, data: { ...detail, client: { clientRef, displayName: "Client", type: "PERSON", status: "active", clientId: "forbidden" } } }) },
  { name: "list-client-field", response: () => json({ ...validList, data: [{ ...row, client: { clientRef, displayName: "Client", type: "PERSON", status: "active", email: "forbidden@example.invalid" } }] }) },
  { name: "list-excessive-string", response: () => json({ ...validList, data: [{ ...row, caseCode: "x".repeat(2_001) }] }) },
  { name: "detail-invalid-date", operation: "detail", response: () => json({ ok: true, data: { ...detail, updatedAt: "not-a-date" } }) },
  { name: "detail-owner-membership", operation: "detail", response: () => json({ ok: true, data: { ...detail, owner: { displayName: "Owner", isCurrentActor: true, membershipId: "forbidden" } } }) },
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
    membershipRefProvider: () => "11111111-1111-4111-8111-111111111111",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => { requested = String(input); observed = init; return scenario.response(); }) as typeof fetch,
  });
  try {
    if (scenario.operation === "summary") await api.summary();
    else if (scenario.operation === "detail") await api.detail(caseRef);
    else await api.list({ page: 1, pageSize: 25 });
    failed.push(`${scenario.name}:accepted`);
  } catch (error) {
    const status = Number((error as { status?: unknown }).status);
    if (scenario.expectedStatus !== undefined && status !== scenario.expectedStatus) failed.push(`${scenario.name}:status`);
    else if (requested.includes("secret-token") || observed?.method !== "GET" || observed?.credentials !== "omit" || new Headers(observed?.headers).get("Authorization") !== "Bearer secret-token-never-in-url" || new Headers(observed?.headers).has("Idempotency-Key")) failed.push(`${scenario.name}:request`);
    else passed += 1;
  }
}

for (const invalidCaseRef of [
  "",
  "cmf0historicalcuid123456789",
  caseRef.toUpperCase(),
  ` ${caseRef}`,
  `${caseRef} `,
  `\ufeff${caseRef}`,
  `${caseRef}\r`,
  `${caseRef}\n`,
  "../case",
  "%2F%2Fevil.invalid",
  "%252F%252Fevil.invalid",
  "x".repeat(10_000),
]) {
  let requested = false;
  const api = new CrmPipelineReadApi({
    tokenProvider: () => "secret-token-never-in-url",
    membershipRefProvider: () => "11111111-1111-4111-8111-111111111111",
    fetchImpl: (async () => { requested = true; return json({ ok: true, data: detail }); }) as typeof fetch,
  });
  try {
    await api.detail(invalidCaseRef);
    failed.push("invalid-case-ref:accepted");
  } catch (error) {
    if (requested || Number((error as { status?: unknown }).status) !== 404) failed.push("invalid-case-ref:not-404-before-fetch");
    else passed += 1;
  }
}
document.body.dataset.result = failed.length === 0 ? "passed" : "failed";
document.body.dataset.details = JSON.stringify({ passed, failed });
