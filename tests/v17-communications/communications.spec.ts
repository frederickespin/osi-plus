import { expect, test, type Page } from "@playwright/test";

const MEMBERSHIP_REF = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_REF = "22222222-2222-4222-8222-222222222222";
const VERSION_REF = "33333333-3333-4333-8333-333333333333";
const CASE_REF = "44444444-4444-4444-8444-444444444444";
const ASSIGNMENT_REF = "55555555-5555-4555-8555-555555555555";
const QUOTE_REF = "66666666-6666-4666-8666-666666666666";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const variables = [{ name: "client.name", source: "PipelineCase.client", type: "TEXT", pii: false, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Cliente" }, { name: "case.reference", source: "PipelineCase.caseCode", type: "TEXT", pii: false, contexts: ["CASE", "SCHEDULING", "QUOTE"], fallback: "Caso" }];
const template = { templateRef: TEMPLATE_REF, code: "SURVEY.PIC", name: "PIC de Survey", category: "SURVEY_PIC", state: "DRAFT", currentVersion: 1, current: { versionRef: VERSION_REF, version: 1, state: "DRAFT", audiences: ["CLIENT", "EVALUATOR"], channels: ["EMAIL", "WHATSAPP"], subject: "Caso {{case.reference}}", bodyText: "Hola {{client.name}}", bodyHtml: null, variables: { catalogVersion: 1, names: ["case.reference", "client.name"] }, contentSha256: "a".repeat(64), validFrom: null, validTo: null, createdAt: "2026-09-13T00:00:00.000Z", publishedAt: null }, versions: [], updatedAt: "2026-09-13T00:00:00.000Z" };

async function authorize(page: Page, deny = false) {
  const permissions = ["pipeline:view", "survey:schedule:view", "survey:assignment:view", "survey:read", "quote:view", "costing:view", "communications:templates:view", "communications:templates:manage", "communications:view", "communications:prepare", "communications:send", "communications:tenant"];
  await page.addInitScript(({ ref }) => { localStorage.setItem("osi-plus.token", "synthetic.communications.token"); localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Administrador sintético", role: "A", membershipRef: ref, memberships: [{ membershipRef: ref, tenantName: "Tenant sintético", role: "A", preferred: true }] })); }, { ref: MEMBERSHIP_REF });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, user: { name: "Administrador sintético", role: "A", status: "ACTIVE", permissions, deniedPermissions: deny ? permissions : [], membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A", preferred: true }] } }) }));
}

test("catálogo compacto edita draft y genera preview sintético", async ({ page }) => {
  await authorize(page); let previewCalls = 0;
  await page.route("**/api/communications/templates", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: [template] }) }));
  await page.route("**/api/communications/variables", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { catalogVersion: 1, variables } }) }));
  await page.route("**/api/communications/preview", async (route) => { previewCalls += 1; const body = await route.request().postDataJSON(); expect(body).not.toHaveProperty("tenantId"); return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { context: "SYNTHETIC", rendered: { subject: "Caso DEMO-001", bodyText: "Hola Cliente de demostración", bodyHtml: null } } }) }); });
  await page.goto("/administration");
  await expect(page.getByRole("heading", { name: "Plantillas y Comunicaciones" })).toBeVisible();
  await expect(page.getByText("SURVEY.PIC")).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).click();
  const variablesCatalog = page.getByRole("group", { name: "Variables disponibles · catálogo v1" });
  await expect(variablesCatalog).toContainText("Cliente");
  await expect(variablesCatalog).toContainText("Referencia del caso");
  await expect(variablesCatalog).not.toContainText("client.name");
  await page.getByRole("button", { name: "Generar preview" }).click();
  await expect(page.getByText("Mensaje renderizado · datos sintéticos")).toBeVisible();
  await expect(page.getByText("Hola Cliente de demostración")).toBeVisible();
  expect(previewCalls).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("deny ocurre en shell antes del lazy y de cualquier API de comunicaciones", async ({ page }) => {
  await authorize(page, true); let requests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/communications")) requests += 1; });
  await page.goto("/administration");
  await expect(page.getByRole("heading", { name: "No puedes abrir esta aplicación" })).toBeVisible();
  expect(requests).toBe(0);
  const chunks = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => /CommunicationTemplatesAdmin|CommunicationPanel/.test(name)));
  expect(chunks).toHaveLength(0);
});

test("Scheduling y Quote montan comunicación ligada a assignment y revisión exactos", async ({ page }) => {
  await authorize(page); const detail = { caseRef: CASE_REF, caseCode: "CS-2026-1301", version: 1, status: "SURVEY_SCHEDULED", mode: "LOCAL", serviceType: "MOVING_LOCAL", customerType: "L4_PERSONAL", estimatedCbm: 12, requiresSurvey: true, surveyMethod: "PRESENCIAL", originLocation: "Origen estructurado", destinationLocation: "Destino estructurado", destinationContracted: true, assetsCount: 0, quoteCount: 1, eventCount: 0, client: { clientRef: "77777777-7777-4777-8777-777777777777", displayName: "Cliente relacional", type: "INDIVIDUAL", status: "ACTIVE" }, owner: { displayName: "Ventas", isCurrentActor: true }, createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z" };
  const byStatus = Object.fromEntries(["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"].map((status) => [status, status === "SURVEY_SCHEDULED" ? 1 : 0]));
  await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: [detail], total: 1, page: 1, pageSize: 25 }) }));
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { total: 1, assigned: 1, unassigned: 0, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  await page.route(`**/api/crm/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: detail }) }));
  await page.route(`**/api/crm/icp-v2/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: null }) }));
  await page.route("**/api/crm/survey/assignments", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: [] }) }));
  await page.route("**/api/crm/survey/scheduling**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: detail.caseCode, routeVersion: 1, decision: { decisionRef: "88888888-8888-4888-8888-888888888888", method: "IN_PERSON", state: "SCHEDULED", informationSource: "COMMERCIAL", rationaleCode: null, routeVersion: 1, version: 1, createdAt: detail.createdAt }, assignment: { assignmentRef: ASSIGNMENT_REF, scheduledStart: "2026-09-14T13:00:00.000Z", scheduledEnd: "2026-09-14T15:00:00.000Z", evaluator: { displayName: "Evaluadora sintética" }, slotKey: "MORNING", profile: "METRO", zoneCode: "METRO", status: "ASSIGNED", version: 1, instruction: "Confirmar acceso", routeStale: false, surveyRef: null }, policy: null, schedulingContext: null, availability: null, evaluatorCandidates: [], visitFee: null, communications: [], history: [], publication: null } }) }));
  const proposal = { proposalRef: "99999999-9999-4999-8999-999999999999", reference: "Q-2026-000001-A", position: 1, state: "DRAFT", revisionRef: QUOTE_REF, revision: 1, proposalName: "Propuesta principal", costingRevisionRef: null, costingLogicalSha256: "a".repeat(64), currency: "USD", issueDate: "2026-09-13", validUntil: "2026-10-13", commercialContext: { company: null, leadAccount: null, booker: null, tariff: null, associations: [], referral: null, commissionContext: null }, payer: { kind: "CLIENT", reference: "CLIENT", displayName: "Cliente relacional", sourceVersion: 1, validFrom: null, validUntil: null, conditions: null }, terms: { paymentTerms: "Contado", scope: "Mudanza", exclusions: [], clientNotes: null, specialConditions: [], templateRef: null, templateVersion: null }, exchange: null, discount: null, totals: { capturedCost: 100, suggestedPrice: 125, grossQuotedPrice: 150, discountAmount: 0, totalQuotedPrice: 150 }, lines: [], issues: [], logicalSha256: "b".repeat(64) };
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: detail.caseCode, destinationStatus: "CONFIRMED", proposals: [proposal] } }) }));
  await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: null }) }));
  const record = { communicationRef: "12121212-1212-4212-8212-121212121212", templateRef: TEMPLATE_REF, templateCode: "SURVEY.PIC", templateVersion: 1, milestone: "VISIT_CONFIRMATION", channel: "EMAIL", recipientType: "CLIENT", recipient: { displayName: "Contacto sintético", destination: "c***@example.invalid" }, subject: "Visita confirmada", bodyText: "Mensaje renderizado sin transporte externo.", bodyHtml: null, status: "PREPARED", preparedAt: "2026-09-13T12:00:00.000Z", sentAt: null, deliveredAt: null, failedAt: null };
  await page.route("**/api/communications/records?*", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: [record] }) }));
  await page.route("**/api/communications/templates", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: [{ ...template, state: "PUBLISHED", current: { ...template.current, state: "PUBLISHED" } }] }) }));
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Evaluación" }).click();
  await expect(page.getByTestId("communications-scheduling")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Destinatario" })).toBeVisible();
  const detailButton = page.getByRole("button", { name: "Ver detalle de SURVEY.PIC para Contacto sintético" });
  await detailButton.focus();
  await detailButton.press("Enter");
  await expect(page.getByTestId("communication-record-detail")).toContainText("Mensaje renderizado sin transporte externo.");
  await page.getByRole("tab", { name: "Cotización" }).click();
  await expect(page.getByTestId("communications-quote")).toBeVisible();
  await expect(page.getByRole("button", { name: "Propuesta 1 Q-2026-000001-A" })).toBeVisible();
});
