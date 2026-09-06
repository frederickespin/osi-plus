import { expect, test, type Page } from "@playwright/test";

const CASE_REF = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP_REF = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const logisticsPermissions = ["logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "logistics:plan:tenant", "logistics:plan:override", "logistics:plan:resolve", "logistics:rules:view", "logistics:rules:manage"];
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };

async function session(page: Page, options: { deny?: boolean; admin?: boolean; withoutRules?: boolean } = {}) {
  const permissions = options.deny ? ["pipeline:view"] : ["pipeline:view", ...(options.withoutRules ? [] : logisticsPermissions), ...(options.admin ? ["membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status"] : [])];
  const deniedPermissions = options.deny ? ["logistics:plan:view"] : [];
  await page.addInitScript(({ membershipRef }) => { localStorage.setItem("osi-plus.token", "synthetic.logistics.token"); localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Logística sintética", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] })); }, { membershipRef: MEMBERSHIP_REF });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { name: "Logística sintética", role: "A", status: "ACTIVE", permissions, deniedPermissions, membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A", preferred: true }] } }) }));
}

async function crm(page: Page) {
  const byStatus = Object.fromEntries(["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"].map((status) => [status, 0]));
  await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: [], total: 0, page: 1, pageSize: 25 }) }));
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { total: 0, assigned: 0, unassigned: 0, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  const detail = { caseRef: CASE_REF, caseCode: "CS-2026-0701", version: 1, status: "SURVEY_COMPLETED", mode: "LOCAL", serviceType: "MOVING_LOCAL", customerType: "L4_PERSONAL", estimatedCbm: 20, requiresSurvey: true, surveyMethod: "PRESENCIAL", originLocation: "Origen estructurado", destinationLocation: "Destino estructurado", destinationContracted: true, assetsCount: 0, quoteCount: 0, eventCount: 2, client: { clientRef: "528f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", displayName: "Cliente relacional", type: "INDIVIDUAL", status: "ACTIVE" }, owner: { displayName: "Logística sintética", isCurrentActor: true }, createdAt: "2026-09-08T12:00:00.000Z", updatedAt: "2026-09-08T12:00:00.000Z" };
  await page.route(`**/api/crm/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: detail }) }));
  await page.route(`**/api/crm/icp-v2/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { ...detail, volume: { status: "ESTIMATED", estimatedCbm: 20, source: "ICP" }, intakeChannel: "WEB", clientProfileType: "PERSONAL", requirementNotes: null, serviceDefinitionStatus: "DEFINED", surveyDecisionStatus: "DEFINED", ownerName: "Logística sintética", caseContact: { displayName: "Contacto sintético", phone: null, email: null }, route: { contractVersion: 2, revision: 1, destinationStatus: "CONFIRMED", origin: null, destination: null, additionalStops: [] } } }) }));
}

test("Comercial sólo consulta el resultado publicado y no monta un Motor operativo", async ({ page }) => {
  await session(page); await crm(page); let writes = 0;
  page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/logistics/") && request.method() !== "GET") writes += 1; });
  await page.route(`**/api/logistics/plans/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ ok: true, data: { planRef: "318f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", revisionRef: "328f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", revision: 1, status: "PUBLISHED", logicalSha256: "a".repeat(64), publishedAt: "2026-09-08T12:00:00.000Z", items: [], issues: [], overrides: [] } }) }));
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await expect(page.getByRole("tab", { name: "Motor Logístico" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Calcular|Publicar revisión|Ajustar sugerencia/ })).toHaveCount(0);
  expect(writes).toBe(0); const chunks = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("LogisticsPlanPanel"))); expect(chunks).toHaveLength(0);
});

test("Administración presenta y versiona reglas compactas por familia", async ({ page }) => {
  await session(page, { admin: true });
  await page.route("**/api/admin/memberships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [], total: 0, page: 1, pageSize: 20 }) }));
  let versioned = false;
  await page.route("**/api/logistics/rules", async (route) => { if (route.request().method() === "POST") { versioned = true; return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, data: { ruleRef: "938f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", version: 3 } }) }); } return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [{ ruleRef: "738f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", seriesRef: "838f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", family: "TRANSPORT", code: "TRUCK_BY_VOLUME", name: "Camión por volumen", priority: 100, specificity: 20, conditions: { modes: ["LOCAL"] }, result: { kind: "TRUCK", label: "Camión", quantity: 1 }, state: "ACTIVE", version: 2 }] }) }); });
  await page.goto("/administration"); await expect(page.getByRole("link", { name: "Motor Logístico" })).toBeVisible(); await expect(page.getByTestId("logistics-rules-admin")).toBeVisible(); await page.getByLabel("Familia logística").selectOption("TRANSPORT"); await expect(page.getByText("TRUCK_BY_VOLUME")).toBeVisible(); await page.getByRole("button", { name: "Nueva versión" }).click(); await page.getByRole("button", { name: "Crear nueva versión" }).click(); await expect.poll(() => versioned).toBe(true);
});

test("deny no monta el Motor ni solicita APIs logísticas", async ({ page }) => {
  await session(page, { deny: true }); await crm(page); let requests = 0; page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/logistics/")) requests += 1; });
  await page.goto(`/commercial/cases/${CASE_REF}`); await expect(page.getByRole("tab", { name: "Motor Logístico" })).toHaveCount(0); expect(requests).toBe(0); const chunks = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("LogisticsPlanPanel") || name.includes("LogisticsRulesAdmin"))); expect(chunks).toHaveLength(0);
});

test("administrador sin logistics rules no descarga ni consulta el workspace", async ({ page }) => {
  await session(page, { admin: true, withoutRules: true }); await page.route("**/api/admin/memberships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [], total: 0, page: 1, pageSize: 20 }) })); let requests = 0; page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/logistics/")) requests += 1; });
  await page.goto("/administration"); await expect(page.getByRole("link", { name: "Motor Logístico" })).toHaveCount(0); expect(requests).toBe(0); const chunks = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("LogisticsRulesAdmin"))); expect(chunks).toHaveLength(0);
});
