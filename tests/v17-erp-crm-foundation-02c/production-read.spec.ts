import { expect, test, type Browser, type Page, type Route } from "@playwright/test";

const CASE_REF = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CLIENT_REF = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP_REF = "11111111-1111-4111-8111-111111111111";
const protectedChunk = /HubWorkspace|AdvancedErpShell|CommercialCaseDetail/u;

type Actor = Readonly<{ role: "A" | "V"; denied?: boolean; confirmed?: boolean }>;

function authBody(actor: Actor) {
  return JSON.stringify({
    ok: true,
    user: {
      name: `Actor ${actor.role}`,
      role: actor.role,
      status: "active",
      permissions: ["pipeline:view"],
      deniedPermissions: actor.denied ? ["pipeline:view"] : [],
      membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant Production Pilot", role: actor.role },
      memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant Production Pilot", role: actor.role, preferred: true }],
      ...(actor.confirmed === false ? {} : { commercialCrmProductionAuthorized: true }),
    },
  });
}

async function authenticate(page: Page, actor: Actor) {
  await page.addInitScript(({ role }) => {
    localStorage.setItem("osi-plus.token", "synthetic.production.read.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-production-pilot-user", name: "Storage no autoritativo", role }));
    localStorage.setItem("pipeline:view", "forged");
  }, { role: actor.role });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: authBody(actor) }));
}

async function mockCrm(page: Page) {
  const audit: Array<{ method: string; pathname: string }> = [];
  const privateHeaders = {
    "Cache-Control": "private, no-store",
    Vary: "Authorization, Origin",
  };
  await page.route("**/api/crm/**", async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    audit.push({ method: request.method(), pathname });
    if (request.method() !== "GET" || pathname.includes("pipeline-owner-options")) {
      return route.fulfill({ status: 409, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "CRM_PIPELINE_MUTATIONS_DISABLED" }) });
    }
    if (pathname === "/api/crm/pipeline-summary") {
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 1, assigned: 0, unassigned: 1, byStatus: { NEW_INBOX: 1, AWAITING_ICP: 0, GOVERNANCE_CONFIRMED: 0, REQUIREMENTS_CONFIRMED: 0, SURVEY_PLANNING: 0, SURVEY_SCHEDULED: 0, SURVEY_COMPLETED: 0, CRATING_ESTIMATE_PENDING: 0, PRICING_IN_PROGRESS: 0, QUOTE_DRAFT: 0, INTERNAL_REVIEW: 0, QUOTE_SENT: 0, NEGOTIATION: 0, WON: 0, LOST: 0, CHANGE_CONTROL: 0, APPROVED: 0, OPS_HANDOFF: 0 }, sla: { overdue: null, basis: "UNAVAILABLE" } } }) });
    }
    const item = { caseRef: CASE_REF, caseCode: "PILOT-READ-001", client: { clientRef: CLIENT_REF, displayName: "Receptor sintético", type: "PERSON", status: "active" }, mode: "EXPORT", serviceType: "Servicio sintético", customerType: "PERSON", status: "NEW_INBOX", estimatedCbm: 1, requiresSurvey: true, surveyMethod: "ONSITE", originLocation: "Origen sintético", destinationLocation: "Destino sintético", destinationContracted: true, assetsCount: 1, owner: null, quoteCount: 0, eventCount: 0, createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" };
    if (pathname === "/api/crm/pipeline-cases") {
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 25, data: [item] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { ...item, version: 1, owner: null } }) });
  });
  return audit;
}

test("A y V acceden al ERP avanzado sólo después de confirmación productiva", async ({ browser }) => {
  for (const role of ["A", "V"] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await authenticate(page, { role });
    const audit = await mockCrm(page);
    await page.goto("/hub");
    await expect(page.getByRole("heading", { name: new RegExp(`Hola, Actor ${role}`) })).toBeVisible();
    await expect(page.getByText("CRM · sólo lectura", { exact: true })).toBeVisible();
    await expect(page.getByText("Comercial abre el ERP sólo cuando la sesión y el entorno están autorizados.")).toBeVisible();
    await page.locator("main").getByRole("button").filter({ hasText: "Comercial y CRM" }).click();
    await expect(page.getByTestId("advanced-erp-shell")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inbox Comercial", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Ficha del caso/ }).click();
    await expect(page).toHaveURL(new RegExp(`/commercial/cases/${CASE_REF}$`));
    await expect(page.getByRole("heading", { name: "Ficha del Caso", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /Survey/u }).click();
    await expect(page.getByRole("heading", { name: "Survey en integración" })).toBeVisible();
    await page.getByRole("tab", { name: /Cotización/u }).click();
    await expect(page.getByRole("heading", { name: "Cotización en integración" })).toBeVisible();
    expect(audit.every(({ method }) => method === "GET")).toBe(true);
    expect(requests.some((pathname) => protectedChunk.test(pathname))).toBe(true);
    await context.close();
  }
});

test("deny prevalece antes de Hub, Inbox o Ficha y no admite elevación", async ({ browser }) => {
  for (const route of ["/commercial", "/crm", "/sales/pipeline", `/commercial/cases/${CASE_REF}`]) {
    const context = await browser.newContext({ extraHTTPHeaders: { "x-osi-role": "A", "x-osi-permissions": "pipeline:view" } });
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await authenticate(page, { role: "V", denied: true });
    await page.goto(`${route}?permission=pipeline:view#commercial`);
    await expect(page.getByTestId("hub-forbidden")).toContainText("403");
    expect(requests.some((pathname) => protectedChunk.test(pathname))).toBe(false);
    expect(requests.some((pathname) => pathname.startsWith("/api/crm/"))).toBe(false);
    await context.close();
  }
});

test("sin variables o sin confirmación servidor Production permanece inactivo", async ({ page }) => {
  const disabledRequests: string[] = [];
  page.on("request", (request) => disabledRequests.push(new URL(request.url()).pathname));
  await authenticate(page, { role: "A" });
  await page.goto("http://127.0.0.1:4197/commercial");
  await expect(page.getByText("OSi Plus Hub", { exact: true })).toHaveCount(0);
  expect(disabledRequests.some((pathname) => protectedChunk.test(pathname))).toBe(false);
  expect(disabledRequests.some((pathname) => pathname.startsWith("/api/crm/"))).toBe(false);

  const context = await (page.context().browser() as Browser).newContext();
  const unconfirmed = await context.newPage();
  const unconfirmedRequests: string[] = [];
  unconfirmed.on("request", (request) => unconfirmedRequests.push(new URL(request.url()).pathname));
  await authenticate(unconfirmed, { role: "A", confirmed: false });
  await unconfirmed.goto("/commercial");
  await expect(unconfirmed.getByRole("heading", { name: "Configuración Hub rechazada" })).toBeVisible();
  expect(unconfirmedRequests.some((pathname) => protectedChunk.test(pathname))).toBe(false);
  expect(unconfirmedRequests.some((pathname) => pathname.startsWith("/api/crm/"))).toBe(false);
  await context.close();
});
