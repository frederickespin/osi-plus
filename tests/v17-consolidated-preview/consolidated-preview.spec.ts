import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const CASE_REF = "038f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP_REF = "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CLIENT_REF = "058f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PRIMARY_REF = "068f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const COSTING_REF = "078f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const permissions = [
  "pipeline:view", "pipeline:create", "pipeline:update:any", "pipeline:destination-pending:create",
  "services:case:view", "services:case:update", "survey:assignment:view", "survey:perform", "survey:publish", "survey:read",
  "inventory:catalog:view", "inventory:stock:view", "assets:instance:view",
  "logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "costing:view", "costing:calculate", "costing:publish",
  "quote:view", "quote:create", "quote:update", "quote:publish", "quote:send", "quote:record-client-decision", "quote:internal-cost:view",
];

const crmDetail = { caseRef: CASE_REF, caseCode: "CS-2026-1004", version: 4, status: "QUOTE_SENT", mode: "EXPORT", serviceType: "INTERNATIONAL_MOVE", customerType: "CORPORATE", estimatedCbm: 18.4, requiresSurvey: true, surveyMethod: "PRESENCIAL", originLocation: "Santo Domingo", destinationLocation: "Madrid", destinationContracted: true, assetsCount: 0, quoteCount: 3, eventCount: 8, client: { clientRef: CLIENT_REF, displayName: "Cliente Preview Exportación", type: "ORGANIZATION", status: "ACTIVE" }, owner: { displayName: "Ventas Preview", isCurrentActor: true }, createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T13:00:00.000Z" };
const syntheticCases = [
  { ...crmDetail, caseRef: "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", caseCode: "CS-2026-1001", mode: "LOCAL", serviceType: "LOCAL_MOVE", requiresSurvey: false, quoteCount: 0, client: { ...crmDetail.client, displayName: "Cliente Preview Local" } },
  { ...crmDetail, caseRef: "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", caseCode: "CS-2026-1002", status: "SURVEY_COMPLETED", quoteCount: 0, client: { ...crmDetail.client, displayName: "Cliente Preview Survey y Crating" } },
  { ...crmDetail, caseRef: "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", caseCode: "CS-2026-1003", status: "PRICING_IN_PROGRESS", mode: "IMPORT", quoteCount: 0, client: { ...crmDetail.client, displayName: "Cliente Preview Proveedor pendiente" } },
  crmDetail,
];
const icpDetail = { caseRef: CASE_REF, caseCode: "CS-2026-1004", status: "QUOTE_SENT", version: 4, mode: "EXPORT", serviceType: "INTERNATIONAL_MOVE", volume: { status: "PUBLISHED_SURVEY", estimatedCbm: 18.4, source: "SURVEY" }, requiresSurvey: true, surveyMethod: "PRESENCIAL", intakeChannel: "REFERRED", clientProfileType: "CORPORATE", requirementNotes: "Exportación sintética con Crating", serviceDefinitionStatus: "DEFINED", surveyDecisionStatus: "DEFINED", ownerName: "Ventas Preview", caseContact: { displayName: "Contacto Preview", phone: "+18095550100", email: "contacto@example.invalid" }, client: { clientRef: CLIENT_REF, displayName: "Cliente Preview Exportación", type: "ORGANIZATION", status: "ACTIVE" }, route: { contractVersion: 2, revision: 1, destinationStatus: "CONFIRMED", origin: { countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", sector: "Piantini", streetAndNumber: "Origen sintético", buildingResidential: null, floorUnit: null, arrivalReference: null, locationContactName: null, locationContactPhone: null }, destination: { countryCode: "ES", provinceState: "Madrid", cityMunicipality: "Madrid", sector: null, streetAndNumber: "Destino sintético", buildingResidential: null, floorUnit: null, arrivalReference: null, locationContactName: null, locationContactPhone: null }, additionalStops: [] }, createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T13:00:00.000Z" };
const serviceWorkspace = { caseRef: CASE_REF, mode: "EXPORT", selection: { selectionRef: "138f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", revision: 2, mode: "EXPORT", source: "MANUAL", defaultCombinationRef: null, primary: { serviceRef: PRIMARY_REF, code: "EXPORT_MOVE", name: "Mudanza internacional", category: "Mudanzas", catalogVersion: 1, source: "CATALOG" }, complementaries: [{ serviceRef: "168f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", code: "CRATING", name: "Crating", category: "Empaque", catalogVersion: 1, source: "CATALOG" }], otherServices: [], historyCount: 2 }, primaries: [], allowedComplementaries: [], defaults: [] };
const surveyAssignment = { assignmentRef: "238f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", caseRef: CASE_REF, caseCode: "CS-2026-1004", clientDisplayName: "Cliente Preview Exportación", evaluator: { displayName: "Evaluador Preview" }, scheduledStart: "2026-09-05T12:00:00.000Z", scheduledEnd: null, status: "COMPLETED", arrivalAt: "2026-09-05T12:00:00.000Z", punctualityConfirmedAt: "2026-09-05T12:01:00.000Z", context: { origin: "Santo Domingo", destination: "Madrid", services: [{ name: "Mudanza internacional" }] }, instruction: null, version: 5, surveyRef: "248f6d8f-8d11-4f39-8a2d-1b6c7e8f9012" };
const logistics = { planRef: "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", revisionRef: "348f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", revision: 2, status: "PUBLISHED", logicalSha256: "a".repeat(64), publishedAt: "2026-09-05T14:00:00.000Z", items: [{ itemRef: "358f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", family: "MATERIAL", kind: "PACKING", label: "Material de empaque derivado", quantity: 12, unit: "unidad", estimatedHours: null, trips: null, requiredQuantity: 12, availableQuantity: 8, reservedQuantity: 0, shortageQuantity: 4, availability: "PARTIAL", priceStatus: "CONFIRMED", source: "RECIPE", sourceVersion: 1 }], issues: [], overrides: [] };
const costing = { revisionRef: COSTING_REF, revision: 1, status: "PUBLISHED", baseCurrency: "USD", logicalSha256: "b".repeat(64), publishedAt: "2026-09-05T15:00:00.000Z", totals: { ownCosts: "300", externalCosts: "200", disbursements: "50", risks: "0", currencyCompensation: "0", totalCost: "550", suggestedPrice: "750", expectedMarginBps: 2667 }, lines: [], issues: [], overrides: [] };
const proposals = [1, 2, 3].map((position) => ({ proposalRef: `${position}58f6d8f-8d11-4f39-8a2d-1b6c7e8f9012`, reference: `Q-2026-00000${position}`, position, state: position === 2 ? "ACCEPTED" : "SENT", revisionRef: `${position}68f6d8f-8d11-4f39-8a2d-1b6c7e8f9012`, revision: 2, proposalName: `Propuesta ${position}`, costingRevisionRef: COSTING_REF, currency: "USD", issueDate: "2026-09-05", validUntil: "2026-10-05", totals: { totalQuotedPrice: 800 + position * 50 }, lines: [], issues: [], logicalSha256: "c".repeat(64) }));

async function authorize(page: Page, deny = false) {
  await page.addInitScript(({ ref }) => { localStorage.setItem("osi-plus.token", "synthetic.consolidated.token"); localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Administrador Preview", role: "A", membershipRef: ref, memberships: [{ membershipRef: ref, tenantName: "Tenant Preview aislado", role: "A", preferred: true }] })); }, { ref: MEMBERSHIP_REF });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { name: "Administrador Preview", role: "A", status: "ACTIVE", permissions, deniedPermissions: deny ? ["pipeline:view"] : [], commercialCrmPreviewAuthorized: true, membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant Preview aislado", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant Preview aislado", role: "A", preferred: true }] } }) }));
}

async function mockDomains(page: Page) {
  const byStatus = Object.fromEntries(["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"].map((status) => [status, status === "QUOTE_SENT" ? 4 : 0]));
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 4, assigned: 4, unassigned: 0, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: syntheticCases, total: 4, page: 1, pageSize: 25 }) }));
  await page.route(`**/api/crm/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: crmDetail }) }));
  await page.route(`**/api/crm/icp-v2/pipeline-cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: icpDetail }) }));
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: serviceWorkspace }) }));
  await page.route("**/api/crm/survey/assignments", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: [surveyAssignment] }) }));
  await page.route(`**/api/logistics/plans/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: logistics }) }));
  await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: costing }) }));
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-1004", destinationStatus: "CONFIRMED", proposals } }) }));
}

test("recorre el caso desde ICP hasta Cotización en una sola Ficha", async ({ page }, testInfo) => {
  await authorize(page); await mockDomains(page); await page.goto(`/commercial/cases/${CASE_REF}`);
  const tabs = page.getByRole("tab"); await expect(tabs).toHaveCount(6); expect(await tabs.allTextContents()).toEqual(["Resumen", "Servicios", "Survey", "Motor Logístico", "Costing", "Cotización"]);
  await expect(page.getByTestId("case-workflow-progress")).toContainText("ICP"); await expect(page.getByTestId("ready-for-operations")).toBeVisible();
  const evidence = resolve(process.cwd(), ".artifacts", "v17-consolidated-preview-10a");
  if (testInfo.project.name === "chromium-desktop" || testInfo.project.name === "chromium-mobile") { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: resolve(evidence, `summary-${testInfo.project.name}.png`), fullPage: true }); }
  await page.getByRole("tab", { name: "Servicios" }).click(); await expect(page.getByTestId("case-services-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Survey" }).click(); await expect(page.getByTestId("survey-case-panel")).toContainText("Publicado");
  await page.getByRole("tab", { name: "Motor Logístico" }).click(); await expect(page.getByTestId("logistics-plan-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Costing" }).click(); await expect(page.getByTestId("costing-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Cotización" }).click(); await expect(page.getByTestId("quote-ready-for-operations")).toBeVisible(); await expect(page.getByRole("button", { name: "Registrar aceptación" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "chromium-desktop" || testInfo.project.name === "chromium-mobile") await page.screenshot({ path: resolve(evidence, `quote-${testInfo.project.name}.png`), fullPage: true });
});

test("deny detiene el flujo antes de chunks y APIs protegidas", async ({ page }) => {
  await authorize(page, true); let domainRequests = 0; page.on("request", (request) => { if (/^\/api\/(crm|logistics|costing|quote)/.test(new URL(request.url()).pathname) && !new URL(request.url()).pathname.endsWith("/auth/me")) domainRequests += 1; });
  await page.goto(`/commercial/cases/${CASE_REF}`); await expect(page.getByTestId("hub-forbidden")).toContainText("403"); expect(domainRequests).toBe(0);
  const chunks = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => /AdvancedErpShell|CommercialCaseDetail|SurveyCasePanel|QuotePanel/.test(name)));
  expect(chunks).toHaveLength(0);
});
