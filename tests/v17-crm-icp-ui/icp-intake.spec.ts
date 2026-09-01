import { expect, test, type Page, type Route } from "@playwright/test";
import { normalizeCrmIcpV2CreateInput } from "../../api/_lib/crmIcpV2Domain.js";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const CLIENT_REF = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CASE_REF = "038f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";

async function authenticate(page: Page, options: { role?: string; permissions?: string[]; deniedPermissions?: string[] } = {}) {
  const role = options.role || "A";
  const permissions = options.permissions || ["pipeline:view", "pipeline:create", "pipeline:create:pending-destination"];
  const deniedPermissions = options.deniedPermissions || [];
  await page.addInitScript(({ roleValue }) => {
    localStorage.setItem("osi-plus.token", "synthetic.icp.ui.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-user", name: "Actor sintético", role: roleValue }));
  }, { roleValue: role });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "synthetic-user", code: "SYNTHETIC", name: "Actor sintético", email: "actor@example.invalid", phone: "", role, status: "active", joinDate: "2026-01-01", points: 0, rating: 0, permissions, deniedPermissions } }),
  }));
}

async function mockEmptyInbox(page: Page) {
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 0, assigned: 0, unassigned: 0, byStatus: { NEW_INBOX: 0, AWAITING_ICP: 0, GOVERNANCE_CONFIRMED: 0, REQUIREMENTS_CONFIRMED: 0, SURVEY_PLANNING: 0, SURVEY_SCHEDULED: 0, SURVEY_COMPLETED: 0, CRATING_ESTIMATE_PENDING: 0, PRICING_IN_PROGRESS: 0, QUOTE_DRAFT: 0, INTERNAL_REVIEW: 0, QUOTE_SENT: 0, NEGOTIATION: 0, WON: 0, LOST: 0, CHANGE_CONTROL: 0, APPROVED: 0, OPS_HANDOFF: 0 }, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  await page.route("**/api/crm/pipeline-cases?**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 0, page: 1, pageSize: 25, data: [] }) }));
}

async function fillInlineClient(page: Page) {
  const dialog = page.getByTestId("crm-icp-v2-intake-form");
  await dialog.getByRole("button", { name: "Nuevo" }).click();
  const overlay = page.getByRole("dialog", { name: "Crear cliente inline" });
  await overlay.getByLabel("Nombre / razón social *").fill("Cliente Visual ICP");
  await overlay.getByLabel("Teléfono *").fill("+1 809 555 0101");
  await overlay.getByRole("textbox", { name: "Correo", exact: true }).fill("cliente@example.invalid");
  await overlay.getByRole("button", { name: "Guardar cliente" }).click();
  await dialog.getByLabel("Contacto del caso *").fill("Ana Cliente");
  await dialog.getByLabel("Teléfono / WhatsApp *").fill("+1 809 555 0101");
  await dialog.getByRole("textbox", { name: "Correo", exact: true }).fill("ana@example.invalid");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  return dialog;
}

test.beforeEach(async ({ page }) => { await mockEmptyInbox(page); });

test("el ICP aprobado crea cliente, ruta y notas con sesión real sin RNC, volumen, servicios, Survey ni paradas", async ({ page }) => {
  await authenticate(page);
  let createBody: Record<string, unknown> | null = null;
  await page.route("**/api/crm/icp-v2/pipeline-cases", async (route: Route) => {
    createBody = route.request().postDataJSON() as Record<string, unknown>;
    expect(route.request().headers().authorization).toBe("Bearer synthetic.icp.ui.token");
    await route.fulfill({ status: 201, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, version: 1, routeRevision: 1, clientRef: CLIENT_REF }, replayed: false }) });
  });
  await page.goto("/commercial");
  await page.getByRole("button", { name: "Nuevo ICP" }).click();
  const dialog = page.getByTestId("crm-icp-v2-intake-form");
  await expect(dialog.getByText(/volumen|cbm|rnc|cédula|servicio principal|survey|paradas/i)).toHaveCount(0);
  await fillInlineClient(page);
  const origin = dialog.locator("fieldset").filter({ hasText: "Origen" });
  const destination = dialog.locator("fieldset").filter({ hasText: "Destino" });
  await origin.getByLabel("Provincia / estado *").fill("Distrito Nacional");
  await origin.getByLabel("Ciudad / municipio *").fill("Santo Domingo");
  await origin.getByLabel("Dirección *").fill("Av. Principal 10");
  await destination.getByLabel("Provincia / estado *").fill("Santiago");
  await destination.getByLabel("Ciudad / municipio *").fill("Santiago de los Caballeros");
  await destination.getByLabel("Dirección *").fill("Calle Destino 20");
  await dialog.getByLabel("Notas del requerimiento").fill("Acceso limitado para camión y fecha deseada en septiembre.");
  await dialog.getByRole("button", { name: "Crear caso" }).click();
  await expect(page.getByTestId("crm-icp-v2-success")).toContainText("listo para continuar en su Ficha");
  expect(createBody).not.toBeNull();
  expect(createBody).toMatchObject({ mode: "LOCAL", serviceType: "PENDING_DEFINITION", requiresSurvey: false, surveyMethod: "NO_APLICA", requirementNotes: "Acceso limitado para camión y fecha deseada en septiembre." });
  expect((createBody?.client as Record<string, unknown>).taxId).toBeNull();
  expect((createBody?.route as Record<string, unknown>).additionalStops).toEqual([]);
  expect(JSON.stringify(createBody)).not.toMatch(/estimatedCbm|volume|cbm/i);
  expect(normalizeCrmIcpV2CreateInput(createBody).estimatedCbm).toBeNull();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /icp|case|route/i.test(key)))).toEqual([]);
});

test("busca Client por POST y permite destino pendiente sólo con permiso explícito", async ({ page }) => {
  await authenticate(page);
  let method = "";
  await page.route("**/api/crm/icp-v2/clients/search", async (route) => {
    method = route.request().method();
    expect(route.request().headers().authorization).toBe("Bearer synthetic.icp.ui.token");
    await route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 10, data: [{ clientRef: CLIENT_REF, displayName: "Cliente Existente", type: "INDIVIDUAL", status: "ACTIVE", matchHints: { taxId: "••••0001", phone: "••••0101", email: "c•••@example.invalid" } }] }) });
  });
  await page.goto("/commercial");
  await page.getByRole("button", { name: "Nuevo ICP" }).click();
  const dialog = page.getByTestId("crm-icp-v2-intake-form");
  await dialog.getByRole("button", { name: "Buscar" }).click();
  await page.getByLabel("Buscar cliente").fill("Cliente");
  await page.getByText("Cliente Existente", { exact: true }).click();
  expect(method).toBe("POST");
  await dialog.getByLabel("Contacto del caso *").fill("Ana Cliente");
  await dialog.getByLabel("Teléfono / WhatsApp *").fill("+1 809 555 0101");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByRole("option", { name: "Pendiente" })).toHaveCount(1);
});

test("Administrador y Ventas requieren grant explícito; un deny prevalece y otros roles no acceden", async ({ browser }) => {
  for (const scenario of [
    { role: "A", permissions: ["pipeline:view", "pipeline:create"], deniedPermissions: [], expected: true },
    { role: "V", permissions: ["pipeline:view", "pipeline:create"], deniedPermissions: [], expected: true },
    { role: "A", permissions: ["pipeline:view", "pipeline:create"], deniedPermissions: ["pipeline:create"], expected: false },
    { role: "K", permissions: ["pipeline:view", "pipeline:create"], deniedPermissions: [], expected: false },
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await authenticate(page, scenario);
    await mockEmptyInbox(page);
    await page.goto("/commercial");
    await expect(page.getByRole("button", { name: "Nuevo ICP" })).toHaveCount(scenario.expected ? 1 : 0);
    await context.close();
  }
});

test("una sesión rechazada durante la búsqueda cierra el acceso sin enviar datos de creación", async ({ page }) => {
  await authenticate(page);
  let createCalls = 0;
  await page.route("**/api/crm/icp-v2/clients/search", (route) => route.fulfill({ status: 401, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "COMMERCIAL_AUTH_INVALID" }) }));
  await page.route("**/api/crm/icp-v2/pipeline-cases", (route) => { createCalls += 1; return route.abort(); });
  await page.goto("/commercial");
  await page.getByRole("button", { name: "Nuevo ICP" }).click();
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByLabel("Buscar cliente").fill("Cliente");
  await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  expect(createCalls).toBe(0);
  expect(await page.evaluate(() => [localStorage.getItem("osi-plus.token"), localStorage.getItem("osi-plus.session")])).toEqual([null, null]);
});
