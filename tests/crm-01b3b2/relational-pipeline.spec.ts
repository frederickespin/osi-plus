import { expect, test, type Page, type Route } from "@playwright/test";

const statuses = ["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"];

function pipelineCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-001", caseCode: "CRM-001", clientName: "Cliente sintético", mode: "LOCAL", serviceType: "MUDANZA",
    customerType: "L3_CORPORATE", status: "NEW_INBOX", estimatedCbm: 12.5, requiresSurvey: false, surveyMethod: "NO_APLICA",
    originLocation: "Origen local", destinationLocation: "Destino local", destinationContracted: true, assetsCount: 3,
    owner: { displayName: "Vendedor sintético", role: "V", membershipStatus: "ACTIVE" }, quoteCount: 1, eventCount: 2,
    createdAt: "2026-08-12T12:00:00.000Z", updatedAt: "2026-08-12T12:10:00.000Z", ...overrides,
  };
}

function summary() {
  return { total: 51, assigned: 39, unassigned: 12, byStatus: Object.fromEntries(statuses.map((status) => [status, status === "NEW_INBOX" ? 51 : 0])), sla: { overdue: null, basis: "UNAVAILABLE" } };
}

type MockOptions = {
  caseData?: ReturnType<typeof pipelineCase>;
  allowed?: Array<{ toStatus: string; evidenceType: string | null }>;
  mutation?: (route: Route, attempt: number) => Promise<void>;
  list?: (route: Route, url: URL) => Promise<void>;
  detail?: (route: Route) => Promise<void>;
};

async function mockApi(page: Page, options: MockOptions = {}) {
  let mutationAttempt = 0;
  const requestLog: Array<{ url: string; method: string; idempotency?: string; body?: string | null }> = [];
  await page.route("**/api/crm/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requestLog.push({ url: url.pathname + url.search, method: request.method(), idempotency: request.headers()["idempotency-key"], body: request.postData() });
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/api/crm/pipeline-summary") return json({ ok: true, data: summary() });
    if (url.pathname.endsWith("/allowed-transitions")) return json({ ok: true, case: { caseId: "case-001", version: 4, status: options.caseData?.status ?? "NEW_INBOX", transitions: options.allowed ?? [{ toStatus: "AWAITING_ICP", evidenceType: null }] } });
    if (["transition", "assign-owner", "unassign-owner"].some((action) => url.pathname.endsWith(`/${action}`))) {
      mutationAttempt += 1;
      if (options.mutation) return options.mutation(route, mutationAttempt);
      return json({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } });
    }
    if (url.pathname === "/api/crm/pipeline-cases/case-001") {
      if (options.detail) return options.detail(route);
      return json({ ok: true, data: options.caseData ?? pipelineCase() });
    }
    if (url.pathname === "/api/crm/pipeline-cases") {
      if (options.list) return options.list(route, url);
      const ownerFilter = url.searchParams.get("unassigned");
      const data = ownerFilter === "true" ? [pipelineCase({ owner: null, caseCode: "CRM-UNASSIGNED" })] : [options.caseData ?? pipelineCase()];
      return json({ ok: true, total: ownerFilter === "true" ? 12 : 51, page: Number(url.searchParams.get("page")), pageSize: Number(url.searchParams.get("pageSize")), data });
    }
    return json({ ok: false, code: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }, 404);
  });
  return requestLog;
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error(`browser-error:${error.name}:${error.message}`));
});

test("DISABLED no monta cliente ni genera requests CRM", async ({ page }) => {
  let crmRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/crm/")) crmRequests += 1; });
  await page.goto("/tests/crm-01b3b2/harness.html?disabled=1");
  await expect(page.getByTestId("crm-disabled")).toBeVisible();
  expect(crmRequests).toBe(0);
});

test("compuerta acepta sólo valores exactos y rechaza LOCAL_ONLY en Vercel", async ({ page }) => {
  const cases = [
    { query: "gate=__ABSENT__", mode: "DISABLED", valid: "true" },
    { query: "gate=DISABLED", mode: "DISABLED", valid: "true" },
    { query: "gate=LOCAL_ONLY", mode: "LOCAL_ONLY", valid: "true" },
    { query: "gate=local_only", mode: "DISABLED", valid: "false" },
    { query: `gate=${encodeURIComponent(" LOCAL_ONLY")}`, mode: "DISABLED", valid: "false" },
    { query: `gate=${encodeURIComponent("\uFEFFLOCAL_ONLY")}`, mode: "DISABLED", valid: "false" },
    { query: `gate=${encodeURIComponent("LOCAL_ONLY\n")}`, mode: "DISABLED", valid: "false" },
    { query: `gate=${encodeURIComponent('"LOCAL_ONLY"')}`, mode: "DISABLED", valid: "false" },
    { query: "gate=LOCAL_ONLY&vercel=1", mode: "DISABLED", valid: "false" },
    { query: "gate=LOCAL_ONLY&host=preview.example.test", mode: "DISABLED", valid: "false" },
  ];
  for (const item of cases) {
    await page.goto(`/tests/crm-01b3b2/harness.html?${item.query}`);
    await expect(page.locator("body")).toHaveAttribute("data-crm-mode", item.mode);
    await expect(page.locator("body")).toHaveAttribute("data-crm-mode-valid", item.valid);
  }
});

test("lista paginada muestra 39 asignados y 12 sin owner", async ({ page }) => {
  const requests = await mockApi(page);
  await page.goto("/tests/crm-01b3b2/harness.html");
  await expect(page.getByText("39", { exact: true })).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await page.getByLabel("Owner").selectOption("unassigned");
  await expect(page.getByText("CRM-UNASSIGNED")).toBeVisible();
  expect(requests.some((entry) => entry.url.includes("unassigned=true"))).toBe(true);
  expect(requests.some((entry) => entry.url.includes("pageSize=25"))).toBe(true);
});

test("drawer congela APPROVED y no inventa historial", async ({ page }) => {
  await mockApi(page, { caseData: pipelineCase({ status: "APPROVED" }), allowed: [] });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await expect(page.getByText("Oportunidad congelada")).toBeVisible();
  await expect(page.getByText("No hay transiciones disponibles.")).toBeVisible();
  await expect(page.getByText(/historial/i)).toHaveCount(0);
});

test("OPS_HANDOFF se presenta como terminal", async ({ page }) => {
  await mockApi(page, { caseData: pipelineCase({ status: "OPS_HANDOFF" }), allowed: [] });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await expect(page.getByText("Estado terminal")).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirmar cambio/ })).toHaveCount(0);
});

test("COMMAND_IN_PROGRESS reintenta una vez con la misma Idempotency-Key", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route, attempt) => {
    if (attempt === 1) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, code: "CRM_PIPELINE_COMMAND_IN_PROGRESS", recoverable: true, retryAfterMs: 1 }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(2);
  const writes = requests.filter((entry) => entry.method === "POST");
  expect(writes[0].idempotency).toBeTruthy();
  expect(writes[1].idempotency).toBe(writes[0].idempotency);
  expect(writes[1].body).toBe(writes[0].body);
});

test("VERSION_CONFLICT no reintenta y vuelve a leer el caso", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, code: "CRM_PIPELINE_VERSION_CONFLICT", recoverable: true }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  const readsBefore = requests.filter((entry) => entry.url === "/api/crm/pipeline-cases/case-001").length;
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect(page.getByText(/La oportunidad cambió/)).toBeVisible();
  expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(1);
  await expect.poll(() => requests.filter((entry) => entry.url === "/api/crm/pipeline-cases/case-001").length).toBeGreaterThan(readsBefore);
});

test("V no recibe acciones de owner y A puede desasignar", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests/crm-01b3b2/harness.html?role=V");
  await page.getByText("CRM-001").click();
  await expect(page.getByRole("button", { name: /Desasignar owner/ })).toHaveCount(0);
  await page.goto("/tests/crm-01b3b2/harness.html?role=A");
  await page.getByText("CRM-001").click();
  await expect(page.getByRole("button", { name: /Desasignar owner/ })).toBeVisible();
});

test("cliente relacional no escribe storage ni filtra credenciales a URL", async ({ page }) => {
  const requests = await mockApi(page);
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(["osi-plus.session", "osi-plus.token"]);
  expect(requests.every((entry) => !entry.url.includes("synthetic.browser.jwt"))).toBe(true);
  expect(requests.every((entry) => !entry.url.includes("tenantId") && !entry.url.includes("ownerId"))).toBe(true);
});

test("401 delega al flujo de sesión y no degrada a datos vacíos", async ({ page }) => {
  await mockApi(page, { list: async (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, code: "COMMERCIAL_AUTH_REQUIRED" }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await expect.poll(() => page.locator("body").getAttribute("data-unauthorized")).toBe("true");
  await expect(page.getByText("COMMERCIAL_AUTH_REQUIRED")).toBeVisible();
  await expect(page.getByText("No hay oportunidades para estos filtros.")).toHaveCount(0);
});

test("403 retira acciones después del rechazo del servidor", async ({ page }) => {
  await mockApi(page, { mutation: async (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, code: "COMMERCIAL_PERMISSION_DENIED" }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect(page.getByText("No tienes permiso para esta operación.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar cambio" })).toHaveCount(0);
});

test("404 cierra el detalle sin confirmar existencia", async ({ page }) => {
  await mockApi(page, { detail: async (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, code: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("CRM-001")).toBeVisible();
});

test("503 de mutación requiere retry manual con la misma intención", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route, attempt) => route.fulfill({
    status: attempt === 1 ? 503 : 200,
    contentType: "application/json",
    body: JSON.stringify(attempt === 1
      ? { ok: false, code: "CRM_PIPELINE_DATABASE_UNAVAILABLE", recoverable: true }
      : { ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }),
  }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect(page.getByRole("button", { name: "Reintentar misma intención" })).toBeVisible();
  expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar misma intención" }).click();
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(2);
  const writes = requests.filter((entry) => entry.method === "POST");
  expect(writes[1].idempotency).toBe(writes[0].idempotency);
});

test("respuesta tardía de filtro anterior no reemplaza la más reciente", async ({ page }) => {
  await mockApi(page, { list: async (route, url) => {
    const q = url.searchParams.get("q") || "";
    if (q === "anterior") await new Promise((resolve) => setTimeout(resolve, 250));
    if (q === "reciente") await new Promise((resolve) => setTimeout(resolve, 10));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, total: 1, page: 1, pageSize: 25,
      data: [pipelineCase({ caseCode: q === "anterior" ? "CRM-ANTERIOR" : q === "reciente" ? "CRM-RECIENTE" : "CRM-001" })],
    }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  const search = page.getByPlaceholder("Código, cliente o ubicación");
  await search.fill("anterior");
  await search.fill("reciente");
  await expect(page.getByText("CRM-RECIENTE")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByText("CRM-ANTERIOR")).toHaveCount(0);
});

test("doble clic no duplica un comando en curso", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  const action = page.getByRole("button", { name: "Confirmar cambio" });
  await action.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(1);
});

test("dos pestañas crean intenciones distintas y no persisten sus keys", async ({ context, page }) => {
  const first = await mockApi(page);
  const secondPage = await context.newPage();
  const second = await mockApi(secondPage);
  for (const target of [page, secondPage]) {
    await target.goto("/tests/crm-01b3b2/harness.html");
    await target.getByText("CRM-001").click();
    await target.getByRole("button", { name: "Confirmar cambio" }).click();
  }
  await expect.poll(() => first.filter((entry) => entry.method === "POST").length).toBe(1);
  await expect.poll(() => second.filter((entry) => entry.method === "POST").length).toBe(1);
  expect(first.find((entry) => entry.method === "POST")?.idempotency).not.toBe(second.find((entry) => entry.method === "POST")?.idempotency);
  for (const target of [page, secondPage]) {
    const storage = await target.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
    expect(storage.local).not.toContain("Idempotency");
    expect(storage.session).not.toContain("Idempotency");
  }
});

test("página de 25 sobre 2,000 mantiene una sola lectura por acción", async ({ page }, testInfo) => {
  const durations: number[] = [];
  let listRequests = 0;
  await mockApi(page, { list: async (route, url) => {
    listRequests += 1;
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const q = url.searchParams.get("q") || "";
    const data = Array.from({ length: 25 }, (_, index) => pipelineCase({ id: `case-${pageNumber}-${index}`, caseCode: `${q ? "FILTER" : "CRM"}-${String((pageNumber - 1) * 25 + index + 1).padStart(4, "0")}` }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, total: 2_000, page: pageNumber, pageSize: 25, data }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await expect(page.getByText("2000 resultados")).toBeVisible();
  for (let index = 0; index < 10; index += 1) {
    const started = Date.now();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByText(`Página ${index + 2} de 80`)).toBeVisible();
    durations.push(Date.now() - started);
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  const metrics = { project: testInfo.project.name, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.at(-1), listRequests };
  testInfo.annotations.push({ type: "performance", description: JSON.stringify(metrics) });
  console.log(`[crm01b3b2-performance] ${JSON.stringify(metrics)}`);
  expect(listRequests).toBe(11);
  expect(await page.getByRole("listitem").count()).toBe(25);
});
