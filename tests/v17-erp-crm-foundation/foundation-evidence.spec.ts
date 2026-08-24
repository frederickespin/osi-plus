import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const CASE_REF = "018f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const EVIDENCE = resolve("docs/evidence/V17-ERP-CRM-FOUNDATION-02A");
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const statuses = [
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING",
  "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT",
  "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF",
] as const;

const item = Object.freeze({
  caseRef: CASE_REF,
  caseCode: "DEMO-CANONICAL-001",
  client: { displayName: "Cliente Receptor Sintético", type: "PERSON", status: "active" },
  mode: "EXPORT",
  serviceType: "Mudanza internacional",
  customerType: "PERSON",
  status: "SURVEY_PLANNING",
  estimatedCbm: 24.5,
  requiresSurvey: true,
  surveyMethod: "PRESENCIAL",
  originLocation: "Origen sintético · Santo Domingo",
  destinationLocation: "Destino sintético · Madrid",
  destinationContracted: true,
  assetsCount: 12,
  owner: { displayName: "Ventas Sintético", role: "V", membershipStatus: "ACTIVE" },
  quoteCount: 2,
  eventCount: 3,
  createdAt: "2026-08-20T10:00:00.000Z",
  updatedAt: "2026-08-24T14:00:00.000Z",
});

const detail = Object.freeze({
  caseRef: item.caseRef,
  caseCode: item.caseCode,
  status: item.status,
  mode: item.mode,
  serviceType: item.serviceType,
  customerType: item.customerType,
  estimatedCbm: item.estimatedCbm,
  requiresSurvey: item.requiresSurvey,
  surveyMethod: item.surveyMethod,
  originLocation: item.originLocation,
  destinationLocation: item.destinationLocation,
  destinationContracted: item.destinationContracted,
  assetsCount: item.assetsCount,
  quoteCount: item.quoteCount,
  eventCount: item.eventCount,
  client: item.client,
  owner: { displayName: item.owner.displayName },
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

test("capturas sanitizadas del núcleo ERP avanzado", async ({ page }, testInfo) => {
  mkdirSync(EVIDENCE, { recursive: true });
  const external: string[] = [];
  const writes: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") external.push(url.origin);
    if (url.pathname.startsWith("/api/crm/") && request.method() !== "GET") writes.push(`${request.method()} ${url.pathname}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.foundation.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-user", name: "Frederick Demo", role: "A" }));
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "synthetic-user", code: "SYNTHETIC", name: "Frederick Demo", email: "demo@example.invalid", phone: "", role: "A", status: "active", joinDate: "2026-01-01", points: 0, rating: 0, permissions: ["pipeline:view"], deniedPermissions: [] } }),
  }));
  await page.route("**/api/crm/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/crm/pipeline-summary") {
      const byStatus = Object.fromEntries(statuses.map((status) => [status, status === item.status ? 1 : 0]));
      return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 1, assigned: 1, unassigned: 0, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) });
    }
    if (pathname === "/api/crm/pipeline-cases") return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 1, page: 1, pageSize: 25, data: [item] }) });
    if (pathname === `/api/crm/pipeline-cases/${CASE_REF}`) return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: detail }) });
    return route.fulfill({ status: 404, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }) });
  });

  await page.goto("/hub");
  await expect(page.getByText("Hola, Frederick Demo")).toBeVisible();
  if (testInfo.project.name === "chromium-desktop") await page.screenshot({ path: resolve(EVIDENCE, "01-hub.png"), fullPage: true });
  await page.getByRole("button", { name: /Abrir ERP/ }).click();
  await expect(page.getByRole("heading", { name: "Inbox Comercial", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(EVIDENCE, testInfo.project.name === "chromium-mobile" ? "03-inbox-mobile.png" : "02-inbox-desktop.png"), fullPage: true });
  await page.locator("button:visible", { hasText: "Abrir ficha" }).first().click();
  await expect(page.getByRole("heading", { name: "Ficha del Caso" })).toBeVisible();
  await page.screenshot({ path: resolve(EVIDENCE, testInfo.project.name === "chromium-mobile" ? "05-ficha-mobile.png" : "04-ficha-desktop.png"), fullPage: true });
  if (testInfo.project.name === "chromium-desktop") {
    await page.getByRole("tab", { name: /Survey/ }).click();
    await expect(page.getByRole("heading", { name: "Survey en integración" })).toBeVisible();
    await page.screenshot({ path: resolve(EVIDENCE, "06-survey-en-integracion.png"), fullPage: true });
    await page.getByRole("tab", { name: /Cotización/ }).click();
    await expect(page.getByRole("heading", { name: "Cotización en integración" })).toBeVisible();
    await page.screenshot({ path: resolve(EVIDENCE, "07-cotizacion-en-integracion.png"), fullPage: true });
  }
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
  expect(await page.getByText(CASE_REF).count()).toBe(0);
});
