import { expect, test, type Page } from "@playwright/test";

const CASE_REF = "038f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CLIENT_REF = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP_REF = "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PRIMARY_LOCAL = "138f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PRIMARY_EXPORT = "238f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PACKING = "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const UNPACKING = "438f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const DEFAULT_REF = "538f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const catalog = (serviceRef: string, code: string, name: string, usage: string, modes: string[] = []) => ({ serviceRef, code, name, category: "Mudanzas", usage, compatibleModes: modes, status: "ACTIVE", sortOrder: 1, version: 1, usageCount: 0, allowedComplementaryRefs: [] });

async function session(page: Page, denied = false) {
  const permissions = denied ? ["pipeline:view"] : ["pipeline:view", "services:case:view", "services:case:update"];
  const deniedPermissions = denied ? ["pipeline:view", "services:case:view"] : [];
  await page.addInitScript(({ membershipRef }) => { localStorage.setItem("osi-plus.token", "synthetic.services.token"); localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Actor sintético", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] })); }, { membershipRef: MEMBERSHIP_REF });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { name: "Actor sintético", role: "A", status: "ACTIVE", permissions, deniedPermissions, membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A", preferred: true }] } }) }));
}
async function crm(page: Page) {
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 1, assigned: 1, unassigned: 0, byStatus: { NEW_INBOX: 1, AWAITING_ICP: 0, GOVERNANCE_CONFIRMED: 0, REQUIREMENTS_CONFIRMED: 0, SURVEY_PLANNING: 0, SURVEY_SCHEDULED: 0, SURVEY_COMPLETED: 0, CRATING_ESTIMATE_PENDING: 0, PRICING_IN_PROGRESS: 0, QUOTE_DRAFT: 0, INTERNAL_REVIEW: 0, QUOTE_SENT: 0, NEGOTIATION: 0, WON: 0, LOST: 0, CHANGE_CONTROL: 0, APPROVED: 0, OPS_HANDOFF: 0 }, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  await page.route("**/api/crm/pipeline-cases?**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 0, page: 1, pageSize: 25, data: [] }) }));
  await page.route("**/api/crm/pipeline-cases/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0001", version: 1, status: "NEW_INBOX", mode: "LOCAL", serviceType: "PENDING_DEFINITION", customerType: "L4_PERSONAL", estimatedCbm: null, requiresSurvey: false, surveyMethod: "NO_APLICA", originLocation: "Santo Domingo", destinationLocation: "Santiago", destinationContracted: true, assetsCount: 0, quoteCount: 0, eventCount: 0, client: { clientRef: CLIENT_REF, displayName: "Cliente relacional", type: "INDIVIDUAL", status: "ACTIVE" }, owner: { displayName: "Actor sintético", isCurrentActor: true }, createdAt: "2026-09-04T12:00:00.000Z", updatedAt: "2026-09-04T12:00:00.000Z" } }) }));
}
function workspace() { return { caseRef: CASE_REF, mode: "LOCAL", selection: { selectionRef: null, revision: 0, mode: null, source: null, defaultCombinationRef: null, primary: null, complementaries: [], otherServices: [], historyCount: 0 }, primaries: [catalog(PRIMARY_LOCAL, "MOV_LOCAL", "Mudanza local", "PRIMARY", ["LOCAL"]), catalog(PRIMARY_EXPORT, "MOV_EXPORT", "Mudanza exportación", "PRIMARY", ["EXPORT"])], allowedComplementaries: [{ primaryServiceRef: PRIMARY_LOCAL, service: catalog(PACKING, "PACKING", "Empaque", "COMPLEMENTARY") }, { primaryServiceRef: PRIMARY_LOCAL, service: catalog(UNPACKING, "UNPACKING", "Desempaque", "COMPLEMENTARY") }], defaults: [{ combinationRef: DEFAULT_REF, primaryServiceRef: PRIMARY_LOCAL, name: "Mudanza estándar", isDefault: true, version: 1, complementaryRefs: [PACKING] }] }; }

test("Servicios consume modo ICP, precarga defaults y guarda un snapshot sin IDs internos", async ({ page }) => {
  await session(page); await crm(page); let writes = 0; let body: Record<string, unknown> | null = null;
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, async (route) => {
    expect(route.request().headers()["x-osi-membership-ref"]).toBe(MEMBERSHIP_REF);
    if (route.request().method() === "PATCH") { writes += 1; body = route.request().postDataJSON() as Record<string, unknown>; await route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { selection: workspace().selection, replayed: false } }) }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: workspace() }) });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Servicios" }).click();
  const panel = page.getByTestId("case-services-panel"); await expect(panel).toBeVisible();
  const mode = panel.getByLabel("Modo / Alcance"); await expect(mode).toHaveValue("LOCAL / NACIONAL"); await expect(mode).toHaveAttribute("readonly", "");
  await panel.getByLabel("Servicio principal").selectOption(PRIMARY_LOCAL);
  await expect(panel.getByRole("checkbox", { name: "Empaque", exact: true })).toBeChecked(); await expect(panel.getByRole("checkbox", { name: "Desempaque", exact: true })).not.toBeChecked();
  await panel.getByRole("checkbox", { name: "Desempaque", exact: true }).check(); await panel.getByLabel("Otro servicio").fill("Permiso especializado"); await panel.getByRole("button", { name: "Agregar" }).click();
  await panel.getByRole("button", { name: "Guardar selección" }).click(); await expect.poll(() => writes).toBe(1);
  expect(body).toMatchObject({ expectedRevision: 0, primaryServiceRef: PRIMARY_LOCAL, complementaryRefs: [PACKING, UNPACKING], defaultCombinationRef: DEFAULT_REF, otherServices: [{ description: "Permiso especializado" }] });
  expect(JSON.stringify(body)).not.toMatch(/tenantId|userId|membershipId|estimatedCbm|survey|quote|cost/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("deny bloquea antes del lazy de Servicios y no inicia requests", async ({ page }) => {
  await session(page, true); let serviceRequests = 0; page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/crm/services")) serviceRequests += 1; });
  await page.goto(`/commercial/cases/${CASE_REF}`); await expect(page.getByTestId("hub-forbidden")).toContainText("403 · Acceso no autorizado"); await expect(page.getByTestId("case-services-panel")).toHaveCount(0); expect(serviceRequests).toBe(0);
});
