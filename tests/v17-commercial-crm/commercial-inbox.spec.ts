import { expect, test, type Page, type Route } from "@playwright/test";

const STATUSES = [
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING",
  "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT",
  "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF",
] as const;

type Actor = { role: string; permissions?: string[]; deniedPermissions?: string[]; token?: string };
type RequestAudit = { method: string; pathname: string; search: string; authorization: string | null };

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const DEFAULT_CASE_REF = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";

function syntheticCaseRef(sequence: number) {
  return `018f6d8f-8d11-4f39-8a2d-${sequence.toString(16).padStart(12, "0")}`;
}

function pipelineCase(overrides: Record<string, unknown> = {}) {
  return {
    caseRef: DEFAULT_CASE_REF,
    caseCode: "CRM-DEMO-001",
    client: { displayName: "Receptor Sintético", type: "PERSON", status: "active" },
    mode: "EXPORT",
    serviceType: "Mudanza internacional",
    customerType: "PERSON",
    status: "NEW_INBOX",
    estimatedCbm: 24.5,
    requiresSurvey: true,
    surveyMethod: "ONSITE",
    originLocation: "Origen sintético",
    destinationLocation: "Destino sintético",
    destinationContracted: true,
    assetsCount: 12,
    owner: null,
    quoteCount: 0,
    eventCount: 0,
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T11:00:00.000Z",
    ...overrides,
  };
}

function pipelineCaseDetail(item = pipelineCase(), overrides: Record<string, unknown> = {}) {
  return {
    caseRef: item.caseRef,
    caseCode: item.caseCode,
    status: item.status,
    mode: item.mode,
    serviceType: item.serviceType,
    client: item.client,
    owner: item.owner ? { displayName: item.owner.displayName } : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...overrides,
  };
}

function summary(total: number, assigned = 0) {
  return {
    ok: true,
    data: {
      total,
      assigned,
      unassigned: total - assigned,
      byStatus: Object.fromEntries(STATUSES.map((status) => [status, status === "NEW_INBOX" ? total : 0])),
      sla: { overdue: null, basis: "UNAVAILABLE" },
    },
  };
}

async function authenticate(page: Page, actor: Actor = { role: "A", permissions: ["pipeline:view"] }) {
  await page.addInitScript(({ role, token }) => {
    localStorage.setItem("osi-plus.token", token);
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-user", name: "Actor sintético", role }));
  }, { role: actor.role, token: actor.token ?? "synthetic.crm.read.token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "synthetic-user", code: "SYNTHETIC", name: "Actor sintético", email: "synthetic@example.invalid", phone: "", role: actor.role, status: "active", joinDate: "2026-01-01", points: 0, rating: 0, permissions: actor.permissions, deniedPermissions: actor.deniedPermissions } }),
  }));
}

async function mockCrm(page: Page, options: { total?: number; cases?: ReturnType<typeof pipelineCase>[]; status?: number; error?: string; delayMs?: number } = {}) {
  const audit: RequestAudit[] = [];
  const total = options.total ?? options.cases?.length ?? 0;
  const rows = options.cases ?? [];
  await page.route("**/api/crm/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    audit.push({ method: request.method(), pathname: url.pathname, search: url.search, authorization: request.headers().authorization ?? null });
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.status) return route.fulfill({ status: options.status, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: options.error }) });
    if (url.pathname === "/api/crm/pipeline-summary") return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify(summary(total, Math.min(total, rows.filter((item) => item.owner).length))) });
    if (url.pathname === "/api/crm/pipeline-cases") {
      const pageNumber = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 25);
      const expectedRows = Math.min(pageSize, Math.max(0, total - ((pageNumber - 1) * pageSize)));
      const generated = Array.from({ length: expectedRows }, (_, index) => rows[index] ?? pipelineCase({ caseRef: syntheticCaseRef((pageNumber - 1) * pageSize + index + 1), caseCode: `CRM-${String((pageNumber - 1) * pageSize + index + 1).padStart(5, "0")}` }));
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total, page: pageNumber, pageSize, data: generated }) });
    }
    const caseRef = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    const item = rows.find((candidate) => candidate.caseRef === caseRef);
    return route.fulfill({ status: item ? 200 : 404, contentType: "application/json", headers: privateHeaders, body: JSON.stringify(item ? { ok: true, data: pipelineCaseDetail(item) } : { ok: false, error: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }) });
  });
  return audit;
}

test("cero casos presenta estado empresarial vacío y sólo ejecuta GET canónicos", async ({ page }) => {
  await authenticate(page);
  const audit = await mockCrm(page);
  await page.goto("/commercial");
  await expect(page.getByTestId("commercial-crm-empty")).toContainText("Aún no hay oportunidades reales");
  expect(audit.map(({ pathname }) => pathname).sort()).toEqual(["/api/crm/pipeline-cases", "/api/crm/pipeline-summary"]);
  expect(audit.every(({ method, authorization }) => method === "GET" && authorization === "Bearer synthetic.crm.read.token")).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /crm|pipeline|case/i.test(key) && !key.startsWith("osi-plus.")))).toEqual([]);
});

test("filtros, paginación y Ficha usan Client relacional y renderizan texto hostil sin ejecutarlo", async ({ page }) => {
  const hostileName = "<img src=x onerror=globalThis.__hostile=1>";
  const hostile = pipelineCase({ client: { displayName: hostileName, type: "PERSON", status: "active" }, owner: { displayName: "Vendedor sintético", role: "V", membershipStatus: "ACTIVE" } });
  await authenticate(page, { role: "V", permissions: ["pipeline:view"] });
  const audit = await mockCrm(page, { total: 2_000, cases: [hostile] });
  await page.goto("/crm");
  await expect(page.getByText("2000 resultados")).toBeVisible();
  await page.getByPlaceholder("Caso o ruta").fill("CRM-DEMO");
  await expect.poll(() => audit.some(({ search }) => search.includes("q=CRM-DEMO"))).toBe(true);
  await page.getByRole("button", { name: "IMPORT" }).click();
  await expect.poll(() => audit.some(({ search }) => search.includes("mode=IMPORT"))).toBe(true);
  await page.getByLabel("Asignación").selectOption("assigned");
  await expect.poll(() => audit.some(({ search }) => search.includes("unassigned=false"))).toBe(true);
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await expect(page.getByRole("heading", { name: "Ficha del Caso" })).toBeVisible();
  await expect(page.getByText(hostileName, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __hostile?: number }).__hostile)).toBeUndefined();
  await expect(page.getByText(DEFAULT_CASE_REF)).toHaveCount(0);
  expect(audit.every(({ method }) => method === "GET")).toBe(true);
});

test("Ficha soporta deep link, reload, error accesible y regreso preservando filtros", async ({ page }) => {
  const item = pipelineCase();
  const consoleIssues: string[] = [];
  const pageErrors: string[] = [];
  let detailFails = false;
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleIssues.push(`${message.type()}:${message.text()}`);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await authenticate(page);
  await page.route("**/api/crm/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/crm/pipeline-summary") {
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify(summary(1)) });
    }
    if (url.pathname === "/api/crm/pipeline-cases") {
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 25, data: [item] }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: privateHeaders,
      body: JSON.stringify(detailFails ? { ok: true, data: { ...pipelineCaseDetail(item), tenantId: "internal-authority" } } : { ok: true, data: pipelineCaseDetail(item) }),
    });
  });

  await page.goto("/commercial");
  await page.getByPlaceholder("Caso o ruta").fill("CRM-DEMO");
  await expect(page.getByRole("button", { name: "Abrir ficha" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/commercial/cases/${DEFAULT_CASE_REF}$`));
  await expect(page.getByTestId("commercial-case-detail")).toBeVisible();
  await page.getByRole("button", { name: "Volver al Pipeline" }).click();
  await expect(page.getByPlaceholder("Caso o ruta")).toHaveValue("CRM-DEMO");
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ficha del Caso" })).toBeVisible();

  detailFails = true;
  await page.goto(`/commercial/cases/${DEFAULT_CASE_REF}`);
  await expect(page.getByRole("alert")).toContainText("CRM_PIPELINE_RESPONSE_INVALID");
  await expect(page.getByRole("button", { name: "Reintentar lectura" })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(consoleIssues).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("APPROVED permanece legacy congelado y OPS_HANDOFF terminal sin controles de mutación", async ({ page }) => {
  const rows = [pipelineCase({ caseRef: syntheticCaseRef(1), caseCode: "CRM-APPROVED", status: "APPROVED" }), pipelineCase({ caseRef: syntheticCaseRef(2), caseCode: "CRM-HANDOFF", status: "OPS_HANDOFF" })];
  await authenticate(page);
  const audit = await mockCrm(page, { cases: rows });
  await page.goto("/sales/pipeline");
  await expect(page.locator('[data-status="APPROVED"]:visible').first()).toContainText("Aprobado · legacy congelado");
  await expect(page.locator('[data-status="OPS_HANDOFF"]:visible').first()).toContainText(
    "Handoff a Operaciones · terminal",
  );
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await expect(page.getByText("Legacy congelado", { exact: true })).toBeVisible();
  await expect(page.getByText("Disponible en una fase posterior.")).toBeVisible();
  for (const label of ["Asignar", "Desasignar", "Transicionar", "Editar", "Crear caso"]) await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  expect(audit.some(({ method }) => method !== "GET")).toBe(false);
});

test("aliases, deep links, reload y regreso al Hub conservan la misma guardia", async ({ page }) => {
  await authenticate(page);
  await mockCrm(page, { cases: [pipelineCase()] });
  for (const route of ["/commercial", "/crm", "/sales/pipeline"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Inbox Comercial", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inbox Comercial", exact: true })).toBeVisible();
  }
  await page.goto(`/commercial/cases/${DEFAULT_CASE_REF}`);
  await expect(page.getByRole("heading", { name: "Ficha del Caso" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ficha del Caso" })).toBeVisible();
  await page.getByRole("button", { name: "Volver al Pipeline" }).click();
  await page.getByRole("button", { name: "Regresar al Hub" }).click();
  await expect(page.getByText("Hola, Actor sintético")).toBeVisible();
});

test("rol no elegible y deniedPermissions bloquean antes de descargar el módulo o consultar CRM", async ({ browser }) => {
  for (const actor of [
    { role: "K", permissions: ["pipeline:view"] },
    { role: "A" },
    { role: "V" },
    { role: "A", permissions: ["pipeline:view"], deniedPermissions: ["pipeline:view"] },
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const resources: string[] = [];
    page.on("request", (request) => resources.push(new URL(request.url()).pathname));
    await authenticate(page, actor);
    await page.goto(`/commercial/cases/${DEFAULT_CASE_REF}?role=A#permission=pipeline:view`);
    await expect(page.getByTestId("hub-forbidden")).toBeVisible();
    expect(resources.some((path) => /CommercialInboxModule/i.test(path))).toBe(false);
    expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
    await context.close();
  }
});

test("rutas de Ficha ambiguas o manipuladas quedan fuera del descriptor sin descargar chunks", async ({ page }) => {
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await authenticate(page, { role: "A", permissions: ["pipeline:view"] });
  for (const route of [
    "/commercial/cases",
    "/commercial/cases/a/b",
    "/commercial/cases/cmf0historicalcuid123456789",
    `/commercial/cases/${DEFAULT_CASE_REF.toUpperCase()}`,
    "/commercial/cases/%2F%2Fevil.invalid",
    "/commercial/cases/%252F%252Fevil.invalid",
    "/commercial/cases/%2e%2e",
    `/commercial/cases/%EF%BB%BF${DEFAULT_CASE_REF}`,
  ]) {
    await page.goto(route);
    await expect(page.getByText("404 · Ruta del Hub no registrada")).toBeVisible();
  }
  expect(resources.some((path) => /CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
  expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
});

test("toda combinación parcial de compuertas evita chunk y requests del Inbox", async ({ browser }) => {
  const configurations = [
    { port: 4186, label: "todo desactivado" },
    { port: 4187, label: "cliente desactivado" },
    { port: 4188, label: "lectura desactivada" },
    { port: 4189, label: "Hub desactivado" },
  ];
  for (const configuration of configurations) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const resources: string[] = [];
    page.on("request", (request) => resources.push(new URL(request.url()).pathname));
    await authenticate(page, { role: "A", permissions: ["pipeline:view"] });
    await page.goto(`http://127.0.0.1:${configuration.port}/commercial`);
    await expect(page.getByTestId("commercial-crm-inbox"), configuration.label).toHaveCount(0);
    expect(resources.some((path) => /CommercialInboxModule/i.test(path)), configuration.label).toBe(false);
    expect(resources.some((path) => path.startsWith("/api/crm/")), configuration.label).toBe(false);
    await context.close();
  }
});

test("resolvers fallan cerrado ante valores y entornos ambiguos", async ({ page }) => {
  await page.goto("/tests/v17-commercial-crm/read-api-harness.html");
  const result = await page.evaluate(async () => {
    const crm = await import("/src/crm-relational/clientMode.ts");
    const hub = await import("/src/hub/hubMode.ts");
    const loopbacks = ["localhost", "127.0.0.1", "[::1]"];
    const invalidValues = ["local_only", " LOCAL_ONLY", "LOCAL_ONLY ", "\"LOCAL_ONLY\"", "\ufeffLOCAL_ONLY", "LOCAL_ONLY\r", "LOCAL_ONLY\n", "UNKNOWN"];
    const remoteHosts = ["127.0.0.1.evil.test", "127.0.0.10", "localhost.example", "::1", "example.test"];
    return {
      loopbacks: loopbacks.every((hostname) => crm.isRelationalCrmReadEnabled({ VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY", VITE_CRM_PIPELINE_READ_MODE: "READ_ONLY" }, { hostname })),
      invalid: invalidValues.every((value) => !crm.isRelationalCrmReadEnabled({ VITE_CRM_PIPELINE_CLIENT_MODE: value, VITE_CRM_PIPELINE_READ_MODE: "READ_ONLY" }, { hostname: "127.0.0.1" })
        && !crm.isRelationalCrmReadEnabled({ VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY", VITE_CRM_PIPELINE_READ_MODE: value }, { hostname: "127.0.0.1" })
        && !hub.resolveOsiHubMode({ VITE_OSI_HUB_MODE: value }, { hostname: "127.0.0.1" }).enabled),
      remote: remoteHosts.every((hostname) => !crm.isRelationalCrmReadEnabled({ VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY", VITE_CRM_PIPELINE_READ_MODE: "READ_ONLY" }, { hostname })),
      vercel: ["VERCEL", "VERCEL_ENV", "VERCELX"].every((key) => !crm.isRelationalCrmReadEnabled({ VITE_CRM_PIPELINE_CLIENT_MODE: "LOCAL_ONLY", VITE_CRM_PIPELINE_READ_MODE: "READ_ONLY", [key]: "1" }, { hostname: "127.0.0.1" })
        && !hub.resolveOsiHubMode({ VITE_OSI_HUB_MODE: "LOCAL_ONLY", [key]: "1" }, { hostname: "127.0.0.1" }).enabled),
    };
  });
  expect(result).toEqual({ loopbacks: true, invalid: true, remote: true, vercel: true });
});

test("adaptador HTTP rechaza contratos adversariales y conserva Bearer sólo en header", async ({ page }) => {
  await page.goto("/tests/v17-commercial-crm/read-api-adversarial-harness.html");
  await expect(page.locator("body")).toHaveAttribute("data-result", "passed");
  const result = await page.evaluate(() => JSON.parse(document.body.dataset.details || "{}"));
  expect(result.failed).toEqual([]);
  expect(result.passed).toBe(51);
});

test("compuerta CRM desactivada mantiene descriptor inactivo sin chunk ni requests", async ({ page }) => {
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await authenticate(page);
  await page.goto("http://127.0.0.1:4186/commercial");
  await expect(page.getByText("Fundación inactiva.")).toBeVisible();
  expect(resources.some((path) => /CommercialInboxModule/i.test(path))).toBe(false);
  expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
});

test("errores controlados se diferencian y desmontar impide actualizaciones tardías", async ({ page }) => {
  await authenticate(page);
  await mockCrm(page, { status: 409, error: "CRM_PIPELINE_DISABLED" });
  await page.goto("/commercial");
  await expect(page.getByText("La lectura CRM continúa desactivada en este entorno.").first()).toBeVisible();
  await page.unroute("**/api/crm/**");
  await page.route("**/api/crm/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { await route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify(summary(0)) }); } catch { /* request aborted by unmount */ }
  });
  await page.reload();
  await page.waitForTimeout(100);
  await page.goto("/hub");
  await expect(page.getByText("Hola, Actor sintético")).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText("La respuesta del servicio no pudo validarse")).toHaveCount(0);
});

test("AbortController cancela una lectura activa sin completar respuesta", async ({ page }) => {
  await page.goto("/tests/v17-commercial-crm/read-api-harness.html");
  await expect(page.locator("body")).toHaveAttribute("data-result", "aborted");
});

test("10,000 casos conservan paginación server-side y una lectura por página", async ({ page }, testInfo) => {
  await authenticate(page);
  const audit = await mockCrm(page, { total: 10_000 });
  await page.goto("/commercial");
  await expect(page.getByText("10000 resultados")).toBeVisible();
  const samples: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    const start = performance.now();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByText(`Página ${index + 2} de 400`)).toBeVisible();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  testInfo.annotations.push({ type: "performance", description: JSON.stringify({ records: 10_000, p50Ms: sorted[Math.floor(sorted.length / 2)], p95Ms: p95, maxMs: sorted.at(-1) }) });
  expect(audit.filter(({ pathname }) => pathname === "/api/crm/pipeline-cases")).toHaveLength(9);
  expect(await page.getByRole("button", { name: "Abrir ficha" }).count()).toBe(25);
});
