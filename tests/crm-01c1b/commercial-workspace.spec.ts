import { expect, test, type Page, type Route } from "@playwright/test";

const statuses = ["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"];

function pipelineCase(index: number) {
  return {
    id: `case-${String(index).padStart(3, "0")}`,
    caseCode: `CRM-${String(index).padStart(3, "0")}`,
    clientName: `Cliente sintético ${index}`,
    mode: index % 3 === 0 ? "EXPORT" : index % 3 === 1 ? "LOCAL" : "IMPORT",
    serviceType: "MUDANZA",
    customerType: "L3_CORPORATE",
    status: index === 4 ? "APPROVED" : "NEW_INBOX",
    estimatedCbm: 12.5,
    requiresSurvey: false,
    surveyMethod: "NO_APLICA",
    originLocation: "Origen local",
    destinationLocation: "Destino local",
    destinationContracted: true,
    assetsCount: 3,
    owner: index <= 19 ? { displayName: `Vendedor ${index % 2 ? "A" : "B"}`, role: "V", membershipStatus: "ACTIVE" } : null,
    quoteCount: 1,
    eventCount: 2,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:10:00.000Z",
  };
}

const cases = Array.from({ length: 25 }, (_, index) => pipelineCase(index + 1));
const summary = { total: 51, assigned: 39, unassigned: 12, byStatus: Object.fromEntries(statuses.map((status) => [status, status === "NEW_INBOX" ? 51 : 0])), sla: { overdue: null, basis: "UNAVAILABLE" } };

async function installSyntheticSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.visual.jwt");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "visual-user", name: "Actor visual", role: "A", token: "synthetic.visual.jwt" }));
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { id: "visual-user", name: "Actor visual", email: "visual@example.invalid", role: "A", status: "active" } }) }));
}

async function installCrmApi(page: Page) {
  const requests: string[] = [];
  await page.route("**/api/crm/**", async (route: Route) => {
    const url = new URL(route.request().url());
    requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/crm/pipeline-summary") return fulfill({ ok: true, data: summary });
    if (url.pathname === "/api/crm/pipeline-cases") return fulfill({ ok: true, total: 51, page: Number(url.searchParams.get("page") || 1), pageSize: 25, data: cases });
    if (url.pathname === "/api/crm/pipeline-cases/case-001") return fulfill({ ok: true, data: cases[0] });
    if (url.pathname === "/api/crm/pipeline-cases/case-001/allowed-transitions") return fulfill({ ok: true, case: { caseId: "case-001", version: 4, status: "NEW_INBOX", transitions: [{ toStatus: "AWAITING_ICP", evidenceType: null }] } });
    if (url.pathname === "/api/crm/pipeline-owner-options") return fulfill({ ok: true, total: 2, page: 1, pageSize: 100, data: [
      { ownerRef: "owner-ref-one", displayName: "Vendedor A", role: "V" },
      { ownerRef: "owner-ref-two", displayName: "Vendedor B", role: "V" },
    ] });
    return fulfill({ ok: false, code: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }, 404);
  });
  return requests;
}

async function openMobileMenuIfNeeded(page: Page, projectName: string) {
  if (!projectName.endsWith("-mobile")) return;
  await page.locator("button.fixed.top-4.left-4").click();
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw error; });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") throw new Error(`CRM01C1B_EXTERNAL_REQUEST:${url.hostname}`);
  });
});

test("etiqueta ambiental distingue Local, Preview, Producción y desconocido", async ({ page }) => {
  await page.goto("/tests/crm-01c1b/environment.html");
  await expect(page.locator("#result")).toHaveText(JSON.stringify({
    local: "development",
    preview: "preview",
    production: "production",
    wrongProductionRef: "unknown",
    appEnvOnly: "unknown",
    absent: "unknown",
  }));
});

test("deep link, refresh y menú resuelven el mismo Inbox canónico", async ({ page }, testInfo) => {
  await installSyntheticSession(page);
  await installCrmApi(page);
  const assetTypes: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") assetTypes.push(response.headers()["content-type"] || "");
  });

  const startedAt = performance.now();
  const response = await page.goto("/sales/pipeline");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", { name: "Inbox Comercial" })).toBeVisible();
  const visualReadyMs = Math.round(performance.now() - startedAt);
  console.log(`[crm-01c1b-visual-ready] ${JSON.stringify({ project: testInfo.project.name, visualReadyMs })}`);
  expect(visualReadyMs).toBeLessThan(2_000);
  await expect(page.getByText("Local", { exact: true }).first()).toBeVisible();
  expect(assetTypes.length).toBeGreaterThan(0);
  expect(assetTypes.every((value) => /javascript|ecmascript/.test(value))).toBe(true);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Inbox Comercial" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Actor visual")).toBeVisible();
  await openMobileMenuIfNeeded(page, testInfo.project.name);
  await page.getByText("Comercial", { exact: true }).hover();
  await page.getByRole("button", { name: "Pipeline CRM" }).click();
  await expect(page).toHaveURL(/\/sales\/pipeline$/);
  await expect(page.getByRole("heading", { name: "Inbox Comercial" })).toBeVisible();
});

test("workspace responsive limita 25 filas y mantiene drawer accesible", async ({ page }, testInfo) => {
  await installSyntheticSession(page);
  const requests = await installCrmApi(page);
  await page.goto("/sales/pipeline");
  await expect(page.getByRole("listitem")).toHaveCount(25);
  await expect(page.getByText("Página 1 de 3 · 51 resultados")).toBeVisible();

  const search = page.getByPlaceholder("Código, cliente o ubicación");
  await search.fill("CRM");
  await search.fill("CRM-00");
  await search.fill("");
  await page.getByText("CRM-001", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Transiciones autorizadas por el servidor")).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (testInfo.project.name.endsWith("-mobile")) expect(box!.width / viewport!.width).toBeGreaterThan(0.9);
  else expect(box!.width / viewport!.width).toBeGreaterThan(0.55);

  if (["chromium-desktop", "chromium-mobile", "firefox-desktop", "webkit-mobile"].includes(testInfo.project.name)) {
    await page.screenshot({ path: testInfo.outputPath(`inbox-${testInfo.project.name}.png`), fullPage: true });
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const listRequests = requests.filter((value) => value.includes("/pipeline-cases?"));
  expect(listRequests.length).toBeLessThanOrEqual(5);
  expect(listRequests.every((value) => value.includes("pageSize=25"))).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /pipeline|crm/i.test(key)))).toEqual([]);
});
