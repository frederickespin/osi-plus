import { expect, test, type Browser, type Page, type Route } from "@playwright/test";

type Actor = { role: string; permissions?: string[]; deniedPermissions?: string[]; confirmed?: boolean };
type Audit = { method: string; pathname: string; search: string };

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const statuses = [
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING",
  "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT",
  "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF",
];

async function authenticate(page: Page, actor: Actor) {
  await page.addInitScript(({ role }) => {
    localStorage.setItem("osi-plus.token", "synthetic.preview.legacy.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-user", name: "Actor sintético", role }));
  }, { role: actor.role });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: privateHeaders,
    body: JSON.stringify({
      ok: true,
      user: {
        id: "synthetic-user", code: "SYNTHETIC", name: "Actor sintético", email: "actor@example.invalid",
        phone: "", role: actor.role, status: "active", joinDate: "2026-01-01", points: 0, rating: 0,
        permissions: actor.permissions, deniedPermissions: actor.deniedPermissions,
        commercialCrmPreviewAuthorized: actor.confirmed !== false,
      },
    }),
  }));
}

async function mockReadApi(page: Page, total = 0) {
  const audit: Audit[] = [];
  await page.route("**/api/crm/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    audit.push({ method: request.method(), pathname: url.pathname, search: url.search });
    if (request.method() !== "GET") return route.fulfill({ status: 409, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "CRM_PIPELINE_MUTATIONS_DISABLED" }) });
    if (url.pathname === "/api/crm/pipeline-summary") {
      const byStatus = Object.fromEntries(statuses.map((status) => [status, status === "NEW_INBOX" ? total : 0]));
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total, assigned: 0, unassigned: total, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) });
    }
    if (url.pathname === "/api/crm/pipeline-cases") {
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 25);
      const count = Math.min(pageSize, Math.max(0, total - ((page - 1) * pageSize)));
      const data = Array.from({ length: count }, (_, index) => ({
        id: `internal-${page}-${index}`, caseCode: `PREVIEW-${page}-${index}`, clientName: "Receptor sintético",
        mode: "EXPORT", serviceType: "Servicio sintético", customerType: "PERSON", status: "NEW_INBOX",
        estimatedCbm: 12.5, requiresSurvey: false, surveyMethod: "REMOTE", originLocation: "Origen sintético",
        destinationLocation: "Destino sintético", destinationContracted: false, assetsCount: 0, owner: null,
        quoteCount: 0, eventCount: 0, createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z",
      }));
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total, page, pageSize, data }) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }) });
  });
  return audit;
}

async function openActor(browser: Browser, actor: Actor, route = "/commercial") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await authenticate(page, actor);
  const audit = await mockReadApi(page);
  await page.goto(route);
  return { context, page, resources, audit };
}

test("A y V autorizados ven Hub e Inbox en las tres rutas con datos vacíos", async ({ browser }) => {
  for (const role of ["A", "V"]) {
    const { context, page, audit } = await openActor(browser, { role, permissions: ["pipeline:view"] }, "/hub");
    await expect(page.getByText("PREVIEW_REHEARSAL", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toBeVisible();
    for (const route of ["/commercial", "/crm", "/sales/pipeline"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: "Inbox Comercial", exact: true })).toBeVisible();
      await expect(page.getByTestId("commercial-crm-empty")).toContainText("Aún no hay oportunidades reales");
    }
    expect(audit.every(({ method }) => method === "GET")).toBe(true);
    await context.close();
  }
});

test("sin permiso, deny, rol no elegible o confirmación ausente bloquean chunk y requests", async ({ browser }) => {
  const actors: Actor[] = [
    { role: "A" },
    { role: "A", permissions: ["pipeline:view"], deniedPermissions: ["pipeline:view"] },
    { role: "K", permissions: ["pipeline:view"] },
    { role: "V", permissions: ["pipeline:view"], confirmed: false },
  ];
  for (const actor of actors) {
    const { context, page, resources } = await openActor(browser, actor);
    if (actor.confirmed === false) await expect(page.getByText("Configuración Hub rechazada")).toBeVisible();
    else await expect(page.getByTestId("hub-forbidden")).toBeVisible();
    expect(resources.some((path) => /CommercialInboxModule/i.test(path))).toBe(false);
    expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
    await context.close();
  }
});

test("paginación conserva una sola lista GET por página y cero mutaciones", async ({ page }) => {
  await authenticate(page, { role: "V", permissions: ["pipeline:view"] });
  const audit = await mockReadApi(page, 60);
  await page.goto("/commercial");
  await expect(page.getByText("60 resultados")).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("Página 2 de 3")).toBeVisible();
  expect(audit.filter(({ pathname }) => pathname === "/api/crm/pipeline-cases")).toHaveLength(2);
  expect(audit.every(({ method }) => method === "GET")).toBe(true);
});

test("query, hash, storage y x-osi no alteran la autoridad del servidor", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-osi-role": "A", "x-osi-userid": "forged" });
  await authenticate(page, { role: "G", permissions: [] });
  await page.addInitScript(() => {
    localStorage.setItem("pipeline:view", "true");
    sessionStorage.setItem("role", "A");
  });
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await page.goto("/commercial?role=A&permission=pipeline:view#pipeline:view");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(resources.some((path) => /CommercialInboxModule/i.test(path))).toBe(false);
  expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
});
