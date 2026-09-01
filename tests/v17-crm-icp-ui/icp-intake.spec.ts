import { expect, test, type Page, type Route } from "@playwright/test";
import { normalizeCrmIcpV2CreateInput } from "../../api/_lib/crmIcpV2Domain.js";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const CLIENT_REF = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CASE_REF = "038f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.icp.ui.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-user", name: "Actor sintético", role: "A" }));
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "synthetic-user", code: "SYNTHETIC", name: "Actor sintético", email: "actor@example.invalid", phone: "", role: "A", status: "active", joinDate: "2026-01-01", points: 0, rating: 0, permissions: ["pipeline:view", "pipeline:create", "pipeline:create:pending-destination"], deniedPermissions: [] } }),
  }));
}

async function mockEmptyInbox(page: Page) {
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 0, assigned: 0, unassigned: 0, byStatus: { NEW_INBOX: 0, AWAITING_ICP: 0, GOVERNANCE_CONFIRMED: 0, REQUIREMENTS_CONFIRMED: 0, SURVEY_PLANNING: 0, SURVEY_SCHEDULED: 0, SURVEY_COMPLETED: 0, CRATING_ESTIMATE_PENDING: 0, PRICING_IN_PROGRESS: 0, QUOTE_DRAFT: 0, INTERNAL_REVIEW: 0, QUOTE_SENT: 0, NEGOTIATION: 0, WON: 0, LOST: 0, CHANGE_CONTROL: 0, APPROVED: 0, OPS_HANDOFF: 0 }, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  await page.route("**/api/crm/pipeline-cases?**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 0, page: 1, pageSize: 25, data: [] }) }));
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockEmptyInbox(page);
});

test("el ICP crea cliente y ruta sin solicitar ni transmitir volumen", async ({ page }) => {
  let createBody: Record<string, unknown> | null = null;
  await page.route("**/api/crm/icp-v2/pipeline-cases", async (route: Route) => {
    createBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, version: 1, routeRevision: 1, clientRef: CLIENT_REF }, replayed: false }) });
  });
  await page.goto("/commercial");
  await page.getByRole("button", { name: "Nuevo ICP" }).click();
  const dialog = page.getByTestId("crm-icp-v2-intake-form");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Volumen pendiente", { exact: true })).toBeVisible();
  await expect(dialog.locator("input").filter({ has: page.locator('[name*="volume" i], [name*="cbm" i]') })).toHaveCount(0);
  await expect(dialog.getByLabel(/volumen|cbm/i)).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cliente nuevo" }).click();
  const inputs = dialog.locator("input");
  await inputs.nth(0).fill("Cliente Visual ICP");
  await inputs.nth(1).fill("131-00000-1");
  await inputs.nth(2).fill("+1 809 555 0101");
  await inputs.nth(3).fill("cliente@example.invalid");
  await inputs.nth(4).fill("Ana Cliente");
  await inputs.nth(5).fill("+1 809 555 0101");
  await inputs.nth(6).fill("ana@example.invalid");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("El ICP no calcula volumen")).toBeVisible();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Origen provincia").fill("Santo Domingo");
  await dialog.getByLabel("Origen ciudad").fill("Distrito Nacional");
  await dialog.getByLabel("Origen calle").fill("Av. Principal 10");
  await dialog.getByLabel("Destino provincia").fill("Santiago");
  await dialog.getByLabel("Destino ciudad").fill("Santiago de los Caballeros");
  await dialog.getByLabel("Destino calle").fill("Calle Destino 20");
  await dialog.getByRole("button", { name: "Crear ICP" }).click();
  await expect(page.getByTestId("crm-icp-v2-success")).toContainText("El volumen continúa pendiente");
  expect(createBody).not.toBeNull();
  expect(JSON.stringify(createBody)).not.toMatch(/estimatedCbm|volume|cbm/i);
  expect(createBody?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  expect(createBody?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(normalizeCrmIcpV2CreateInput(createBody).estimatedCbm).toBeNull();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /icp|case|route/i.test(key)))).toEqual([]);
});

test("busca Client por POST enmascarado y permite destino pendiente sólo con permiso", async ({ page }) => {
  let method = "";
  await page.route("**/api/crm/icp-v2/clients/search", async (route) => {
    method = route.request().method();
    await route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 10, data: [{ clientRef: CLIENT_REF, displayName: "Cliente Existente", type: "INDIVIDUAL", status: "ACTIVE", matchHints: { taxId: "••••0001", phone: "••••0101", email: "c•••@example.invalid" } }] }) });
  });
  await page.goto("/commercial");
  await page.getByRole("button", { name: "Nuevo ICP" }).click();
  const dialog = page.getByTestId("crm-icp-v2-intake-form");
  await dialog.getByPlaceholder("Escribe al menos 2 caracteres").fill("Cliente");
  await expect(dialog.getByText("••••0001")).toBeVisible();
  expect(method).toBe("POST");
  await dialog.getByText("Cliente Existente", { exact: true }).click();
  const contactInputs = dialog.locator("fieldset").filter({ hasText: "Contacto principal" }).locator("input");
  await contactInputs.nth(0).fill("Ana Cliente");
  await contactInputs.nth(1).fill("+1 809 555 0101");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByRole("option", { name: "Pendiente" })).toHaveCount(1);
});
