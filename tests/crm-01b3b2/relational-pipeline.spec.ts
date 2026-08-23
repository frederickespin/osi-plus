import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const statuses = ["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"];
const CASE_REF = "11111111-1111-4111-8111-111111111111";
const caseRefFor = (index: number) => `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`;

function pipelineCase(overrides: Record<string, unknown> = {}) {
  return {
    caseRef: CASE_REF, caseCode: "CRM-001", client: { displayName: "Cliente sintético", type: "PERSON", status: "active" }, mode: "LOCAL", serviceType: "MUDANZA",
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
  summaryOverride?: (route: Route) => Promise<void>;
  ownerOptions?: (route: Route, attempt: number) => Promise<void>;
};

async function mockApi(page: Page, options: MockOptions = {}) {
  let mutationAttempt = 0;
  let ownerOptionsAttempt = 0;
  const requestLog: Array<{ url: string; method: string; idempotency?: string; body?: string | null }> = [];
  await page.route("**/api/crm/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requestLog.push({ url: url.pathname + url.search, method: request.method(), idempotency: request.headers()["idempotency-key"], body: request.postData() });
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/api/crm/pipeline-summary") {
      if (options.summaryOverride) return options.summaryOverride(route);
      return json({ ok: true, data: summary() });
    }
    if (url.pathname === "/api/crm/pipeline-owner-options") {
      ownerOptionsAttempt += 1;
      if (options.ownerOptions) return options.ownerOptions(route, ownerOptionsAttempt);
      return json({ ok: true, total: 2, page: 1, pageSize: 100, data: [
        { ownerRef: "owner-ref-secret-one", displayName: "Ana Vendedora", role: "V" },
        { ownerRef: "owner-ref-secret-two", displayName: "Zoë Vendedora", role: "V" },
      ] });
    }
    if (url.pathname.endsWith("/allowed-transitions")) return json({ ok: true, case: { caseId: "case-001", version: 4, status: options.caseData?.status ?? "NEW_INBOX", transitions: options.allowed ?? [{ toStatus: "AWAITING_ICP", evidenceType: null }] } });
    if (["transition", "assign-owner", "unassign-owner"].some((action) => url.pathname.endsWith(`/${action}`))) {
      mutationAttempt += 1;
      if (options.mutation) return options.mutation(route, mutationAttempt);
      return json({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } });
    }
    if (url.pathname === `/api/crm/pipeline-cases/${CASE_REF}`) {
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

async function confirmTransition(page: Page) {
  await page.getByRole("button", { name: "Revisar cambio" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
}

async function expectInvalidListResponse(context: BrowserContext, payload: unknown) {
  const page = await context.newPage();
  try {
    await mockApi(page, { list: async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }) });
    await page.goto("/tests/crm-01b3b2/harness.html");
    await expect(page.getByText("CRM_PIPELINE_RESPONSE_INVALID")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar lectura" })).toBeVisible();
    await expect(page.getByText("CRM-001", { exact: true })).toHaveCount(0);
  } finally {
    await page.close();
  }
}

async function expectInvalidSummaryResponse(context: BrowserContext, payload: unknown) {
  const page = await context.newPage();
  try {
    await mockApi(page, { summaryOverride: async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }) });
    await page.goto("/tests/crm-01b3b2/harness.html");
    await expect(page.getByText("CRM_PIPELINE_RESPONSE_INVALID")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar resumen" })).toBeVisible();
    await expect(page.getByLabel("Resumen del Pipeline").getByText("—")).toHaveCount(3);
  } finally {
    await page.close();
  }
}

async function expectInvalidDetailResponse(context: BrowserContext, payload: unknown) {
  const page = await context.newPage();
  try {
    await mockApi(page, { detail: async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }) });
    await page.goto("/tests/crm-01b3b2/harness.html");
    await page.getByText("CRM-001", { exact: true }).click();
    await expect(page.getByText("CRM_PIPELINE_RESPONSE_INVALID")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar detalle" })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Cliente sintético", { exact: true })).toHaveCount(0);
  } finally {
    await page.close();
  }
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

test("App real DISABLED no muestra menú ni descarga el chunk relacional", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(new URL(request.url()).pathname));
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.disabled.jwt");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "disabled-user", name: "Actor disabled", role: "A", token: "synthetic.disabled.jwt" }));
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { id: "disabled-user", name: "Actor disabled", email: "disabled@example.invalid", role: "A", status: "active" } }) }));
  await page.goto("/");
  await expect(page.getByText("Actor disabled")).toBeVisible();
  await expect(page.getByText("Pipeline relacional")).toHaveCount(0);
  expect(requested.some((path) => /RelationalPipelineModule/i.test(path))).toBe(false);
  expect(requested.some((path) => path.startsWith("/api/crm/"))).toBe(false);
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

test("rechaza Content-Type no JSON", async ({ page }) => {
  await mockApi(page, { summaryOverride: async (route) => route.fulfill({ status: 200, contentType: "text/plain", body: JSON.stringify({ ok: true, data: summary() }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await expect(page.getByText("CRM_PIPELINE_RESPONSE_CONTENT_TYPE_INVALID")).toBeVisible();
});

test("rechaza esquemas con campos internos sin reutilizar interceptores", async ({ page }) => {
  await mockApi(page, { list: async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 25, internalTenantId: "forbidden", data: [pipelineCase()] }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await expect(page.getByText("CRM_PIPELINE_RESPONSE_INVALID")).toBeVisible();
  await expect(page.getByText("CRM-001", { exact: true })).toHaveCount(0);
});

test("lista rechaza autoridad interna, parciales, tipos y arrays excesivos", async ({ context }) => {
  const missingCaseCode = pipelineCase();
  delete missingCaseCode.caseCode;
  const ownerWithInternalId = { ...pipelineCase(), owner: { ...pipelineCase().owner as Record<string, unknown>, ownerMembershipId: "internal-membership" } };
  const excessive = Array.from({ length: 26 }, (_, index) => pipelineCase({ caseRef: caseRefFor(index), caseCode: `CRM-${index}` }));
  const variants = [
    { ok: true, total: 1, page: 1, pageSize: 25, tenantId: "internal-tenant", data: [pipelineCase()] },
    { ok: true, total: 1, page: 1, pageSize: 25, permissions: ["pipeline:view"], data: [pipelineCase()] },
    { ok: true, total: 1, page: 1, pageSize: 25, deniedPermissions: [], data: [pipelineCase()] },
    { ok: true, total: 1, page: 1, pageSize: 25, data: [{ ...pipelineCase(), clientId: "internal-client" }] },
    { ok: true, total: 1, page: 1, pageSize: 25, data: [ownerWithInternalId] },
    { ok: true, total: 1, page: 1, pageSize: 25, data: [missingCaseCode] },
    { ok: true, total: "1", page: 1, pageSize: 25, data: [pipelineCase()] },
    { ok: true, total: 26, page: 1, pageSize: 25, data: excessive },
  ];
  for (const payload of variants) await expectInvalidListResponse(context, payload);
});

test("detalle rechaza IDs internos, parciales y tipos incorrectos", async ({ context }) => {
  const missingStatus = pipelineCase();
  delete missingStatus.status;
  const variants = [
    { ok: true, data: { ...pipelineCase(), tenantId: "internal-tenant" } },
    { ok: true, data: { ...pipelineCase(), ownerMembershipId: "internal-membership" } },
    { ok: true, data: { ...pipelineCase(), clientId: "internal-client" } },
    { ok: true, data: missingStatus },
    { ok: true, data: { ...pipelineCase(), estimatedCbm: "12.5" } },
  ];
  for (const payload of variants) await expectInvalidDetailResponse(context, payload);
});

test("resumen rechaza autoridad, parciales, tipos y conteos incompatibles", async ({ context }) => {
  const value = summary();
  const variants = [
    { ok: true, tenantId: "internal-tenant", data: value },
    { data: value },
    { ok: false, data: value },
    { ok: true, data: { ...value, permissions: ["pipeline:view"] } },
    { ok: true, data: { ...value, total: "51" } },
    { ok: true, data: { ...value, assigned: 40 } },
    { ok: true, data: { ...value, byStatus: { ...value.byStatus, INTERNAL: 1 } } },
  ];
  for (const payload of variants) await expectInvalidSummaryResponse(context, payload);
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
  await expect(page.getByRole("button", { name: /Revisar cambio/ })).toHaveCount(0);
});

test("COMMAND_IN_PROGRESS reintenta una vez con la misma Idempotency-Key", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route, attempt) => {
    if (attempt === 1) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, code: "CRM_PIPELINE_COMMAND_IN_PROGRESS", recoverable: true, retryAfterMs: 1 }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await confirmTransition(page);
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(2);
  const writes = requests.filter((entry) => entry.method === "POST");
  expect(writes[0].idempotency).toBeTruthy();
  expect(writes[1].idempotency).toBe(writes[0].idempotency);
  expect(writes[1].body).toBe(writes[0].body);
});

test("retryAfterMs ausente, negativo, enorme, string o no finito usa fallback seguro una sola vez", async ({ page }) => {
  const invalidRetryValues: unknown[] = [undefined, -1, 5_001, "10", Number.NaN];
  const requests = await mockApi(page, { mutation: async (route, attempt) => {
    const isFirstAttempt = attempt % 2 === 1;
    const invalidValue = invalidRetryValues[Math.floor((attempt - 1) / 2)];
    const inProgress: Record<string, unknown> = { ok: false, code: "CRM_PIPELINE_COMMAND_IN_PROGRESS", recoverable: true };
    if (invalidValue !== undefined) inProgress.retryAfterMs = invalidValue;
    return route.fulfill({
      status: isFirstAttempt ? 409 : 200,
      contentType: "application/json",
      body: JSON.stringify(isFirstAttempt
        ? inProgress
        : { ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }),
    });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  for (let index = 0; index < invalidRetryValues.length; index += 1) {
    await confirmTransition(page);
    await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe((index + 1) * 2);
    const pair = requests.filter((entry) => entry.method === "POST").slice(index * 2, index * 2 + 2);
    expect(pair[0].idempotency).toBeTruthy();
    expect(pair[1].idempotency).toBe(pair[0].idempotency);
    expect(pair[1].body).toBe(pair[0].body);
  }
  await page.waitForTimeout(250);
  expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(invalidRetryValues.length * 2);
});

test("VERSION_CONFLICT no reintenta y vuelve a leer el caso", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, code: "CRM_PIPELINE_VERSION_CONFLICT", recoverable: true }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  const readsBefore = requests.filter((entry) => entry.url === `/api/crm/pipeline-cases/${CASE_REF}`).length;
  await confirmTransition(page);
  await expect(page.getByText(/La oportunidad cambió/)).toBeVisible();
  expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(1);
  await expect.poll(() => requests.filter((entry) => entry.url === `/api/crm/pipeline-cases/${CASE_REF}`).length).toBeGreaterThan(readsBefore);
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

test("catálogo usa clave efímera y una referencia expirada exige selección explícita nueva", async ({ page }) => {
  const secretRefs = ["owner-ref-secret-initial", "owner-ref-secret-renewed"];
  const requests = await mockApi(page, {
    caseData: pipelineCase({ owner: null }),
    ownerOptions: async (route, attempt) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, total: 1, page: 1, pageSize: 100,
      data: [{ ownerRef: secretRefs[Math.min(attempt - 1, 1)], displayName: "<b>Ana & Vendedora</b>", role: "V" }],
    }) }),
    mutation: async (route, attempt) => route.fulfill({
      status: attempt === 1 ? 409 : 200,
      contentType: "application/json",
      body: JSON.stringify(attempt === 1
        ? { ok: false, code: "CRM_PIPELINE_OWNER_REF_EXPIRED" }
        : { ok: true, command: { caseId: "case-001", commandType: "ASSIGN_OWNER", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "NEW_INBOX", owner: { assigned: true }, replayed: false } }),
    }),
  });
  await page.goto("/tests/crm-01b3b2/harness.html?role=A");
  await page.getByText("CRM-001").click();
  await expect(page.getByRole("button", { name: "Asignar owner" })).toBeVisible();
  await page.getByRole("button", { name: "Asignar owner" }).click();
  const option = page.getByRole("option", { name: "<b>Ana & Vendedora</b> · V" });
  await expect(option).toHaveCount(1);
  const optionValue = await option.getAttribute("value");
  expect(optionValue).toBeTruthy();
  expect(secretRefs).not.toContain(optionValue);
  expect(await page.locator("body").innerHTML()).not.toContain(secretRefs[0]);
  expect(await page.locator("body").innerHTML()).not.toContain("<b>Ana & Vendedora</b></b>");
  await page.getByLabel("Vendedor elegible").selectOption(optionValue!);
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(1);
  await expect(page.getByText("La selección expiró. Abre de nuevo el catálogo y confirma el vendedor otra vez.")).toBeVisible();
  expect(requests.filter((entry) => entry.url.includes("pipeline-owner-options")).length).toBe(1);
  await page.getByRole("button", { name: "Asignar owner" }).click();
  const renewedOption = page.getByRole("option", { name: "<b>Ana & Vendedora</b> · V" });
  const renewedValue = await renewedOption.getAttribute("value");
  expect(renewedValue).toBeTruthy();
  await page.getByLabel("Vendedor elegible").selectOption(renewedValue!);
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(2);
  const writes = requests.filter((entry) => entry.method === "POST");
  expect(writes[0].idempotency).not.toBe(writes[1].idempotency);
  expect(writes[0].body).toContain(secretRefs[0]);
  expect(writes[1].body).toContain(secretRefs[1]);
  expect(page.url()).not.toContain("owner-ref");
  const storage = await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`);
  expect(storage).not.toContain("owner-ref");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await page.locator("body").innerHTML()).not.toContain("owner-ref");
});

test("sólo A puede reabrir LOST cuando el servidor lo autoriza", async ({ page }) => {
  await mockApi(page, { caseData: pipelineCase({ status: "LOST" }), allowed: [{ toStatus: "NEW_INBOX", evidenceType: null }] });
  await page.goto("/tests/crm-01b3b2/harness.html?role=V");
  await page.getByText("CRM-001").click();
  await expect(page.getByRole("button", { name: "Revisar cambio" })).toHaveCount(0);
  await page.goto("/tests/crm-01b3b2/harness.html?role=A");
  await page.getByText("CRM-001").click();
  await page.getByLabel("Motivo").selectOption("MANUAL_REVIEW");
  await expect(page.getByRole("button", { name: "Revisar cambio" })).toBeVisible();
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

test("403 no muta permisos locales y revalida acciones con el servidor", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, code: "COMMERCIAL_PERMISSION_DENIED" }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  const readsBefore = requests.filter((entry) => entry.url === `/api/crm/pipeline-cases/${CASE_REF}`).length;
  await confirmTransition(page);
  await expect(page.getByText("No tienes permiso para esta operación.")).toBeVisible();
  await expect.poll(() => requests.filter((entry) => entry.url === `/api/crm/pipeline-cases/${CASE_REF}`).length).toBeGreaterThan(readsBefore);
  await expect(page.getByRole("button", { name: "Revisar cambio" })).toBeVisible();
});

test("IDEMPOTENCY_CONFLICT no reintenta ni conserva acción de retry", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, code: "CRM_PIPELINE_IDEMPOTENCY_CONFLICT", recoverable: false }) }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await confirmTransition(page);
  await expect(page.getByText(/La intención ya fue usada/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar misma intención" })).toHaveCount(0);
  expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(1);
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
  await confirmTransition(page);
  await expect(page.getByRole("button", { name: "Reintentar misma intención" })).toBeVisible();
  expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar misma intención" }).click();
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(2);
  const writes = requests.filter((entry) => entry.method === "POST");
  expect(writes[1].idempotency).toBe(writes[0].idempotency);
});

test("respuesta perdida conserva la intención y la key para retry manual", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route, attempt) => {
    if (attempt === 1) return route.abort("connectionreset");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: true } }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await confirmTransition(page);
  await expect(page.getByRole("button", { name: "Reintentar misma intención" })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar misma intención" }).click();
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(2);
  const writes = requests.filter((entry) => entry.method === "POST");
  expect(writes[1].idempotency).toBe(writes[0].idempotency);
});

test("cerrar durante mutación cancela el request sin crear otra intención", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }) }).catch(() => undefined);
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await page.getByRole("button", { name: "Revisar cambio" }).click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect.poll(() => requests.filter((entry) => entry.method === "POST").length).toBe(1);
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(750);
  expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Reintentar misma intención" })).toHaveCount(0);
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

test("error tardío de una lectura abortada no reemplaza una respuesta válida", async ({ page }) => {
  let signalOldStarted!: () => void;
  let releaseOld!: () => void;
  let signalOldFinished!: () => void;
  const oldStarted = new Promise<void>((resolve) => { signalOldStarted = resolve; });
  const oldRelease = new Promise<void>((resolve) => { releaseOld = resolve; });
  const oldFinished = new Promise<void>((resolve) => { signalOldFinished = resolve; });
  await mockApi(page, { list: async (route, url) => {
    const q = url.searchParams.get("q") || "";
    if (q === "anterior") {
      signalOldStarted();
      await oldRelease;
      try {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 25, tenantId: "forbidden", data: [pipelineCase()] }) });
      } finally {
        signalOldFinished();
      }
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, total: 1, page: 1, pageSize: 25,
      data: [pipelineCase({ caseCode: q === "reciente" ? "CRM-RECIENTE" : "CRM-001" })],
    }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  const search = page.getByPlaceholder("Código, cliente o ubicación");
  await search.fill("anterior");
  await oldStarted;
  await search.fill("reciente");
  await expect(page.getByText("CRM-RECIENTE")).toBeVisible();
  releaseOld();
  await oldFinished;
  await expect(page.getByText("CRM_PIPELINE_RESPONSE_INVALID")).toHaveCount(0);
  await expect(page.getByText("CRM-RECIENTE")).toBeVisible();
});

test("respuesta válida tardía no reemplaza el error contractual vigente", async ({ page }) => {
  let signalOldStarted!: () => void;
  let releaseOld!: () => void;
  let signalOldFinished!: () => void;
  const oldStarted = new Promise<void>((resolve) => { signalOldStarted = resolve; });
  const oldRelease = new Promise<void>((resolve) => { releaseOld = resolve; });
  const oldFinished = new Promise<void>((resolve) => { signalOldFinished = resolve; });
  await mockApi(page, { list: async (route, url) => {
    const q = url.searchParams.get("q") || "";
    if (q === "anterior") {
      signalOldStarted();
      await oldRelease;
      try {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          ok: true, total: 1, page: 1, pageSize: 25, data: [pipelineCase({ caseCode: "CRM-ANTERIOR" })],
        }) });
      } finally {
        signalOldFinished();
      }
      return;
    }
    if (q === "reciente") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true, total: 1, page: 1, pageSize: 25, clientId: "forbidden", data: [pipelineCase()],
      }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 25, data: [pipelineCase()] }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  const search = page.getByPlaceholder("Código, cliente o ubicación");
  await search.fill("anterior");
  await oldStarted;
  await search.fill("reciente");
  await expect(page.getByText("CRM_PIPELINE_RESPONSE_INVALID")).toBeVisible();
  releaseOld();
  await oldFinished;
  await expect(page.getByText("CRM_PIPELINE_RESPONSE_INVALID")).toBeVisible();
  await expect(page.getByText("CRM-ANTERIOR")).toHaveCount(0);
  await expect(page.getByText("CRM-001", { exact: true })).toHaveCount(0);
});

test("texto hostil se acota y se renderiza como texto sin ejecutar ni navegar", async ({ page }) => {
  const hostile = `<img src=x onerror=window.__crmPwned=1><svg onload=window.__crmPwned=2></svg>javascript:alert(1)\u202E${"X".repeat(1200)}`;
  const external: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:4182")) external.push(request.url()); });
  await mockApi(page, { caseData: pipelineCase({ caseCode: hostile, client: { displayName: hostile, type: "PERSON", status: "active" }, owner: { displayName: hostile, role: "V", membershipStatus: "ACTIVE" }, serviceType: hostile, originLocation: hostile, destinationLocation: hostile }) });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await expect(page.getByText(hostile, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __crmPwned?: number }).__crmPwned ?? 0)).toBe(0);
  expect(await page.locator("img[src='x'], [onerror], [onload]").count()).toBe(0);
  expect(external).toEqual([]);
  expect(page.url()).toContain("/tests/crm-01b3b2/harness.html");
});

test("drawer atrapa foco, Escape cierra y restaura el disparador", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[role="listitem"]').filter({ hasText: "CRM-001" })).toBeFocused();
});

test("doble clic no duplica un comando en curso", async ({ page }) => {
  const requests = await mockApi(page, { mutation: async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, command: { caseId: "case-001", commandType: "TRANSITION", previousVersion: 4, resultingVersion: 5, previousStatus: "NEW_INBOX", resultingStatus: "AWAITING_ICP", owner: null, replayed: false } }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await page.getByText("CRM-001").click();
  await page.getByRole("button", { name: "Revisar cambio" }).click();
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
    await confirmTransition(target);
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
    const data = Array.from({ length: 25 }, (_, index) => pipelineCase({ caseRef: caseRefFor((pageNumber - 1) * 25 + index), caseCode: `${q ? "FILTER" : "CRM"}-${String((pageNumber - 1) * 25 + index + 1).padStart(4, "0")}` }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, total: 2_000, page: pageNumber, pageSize: 25, data }) });
  } });
  await page.goto("/tests/crm-01b3b2/harness.html");
  await expect(page.getByText("2000 resultados")).toBeVisible();
  for (let index = 0; index < 30; index += 1) {
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
  expect(listRequests).toBe(31);
  expect(await page.getByRole("listitem").count()).toBe(25);
});
