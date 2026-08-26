import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const EVIDENCE = resolve("docs/evidence/V17-CRM-COMPACT-CONTROL-CENTER-04C");
const CASE_REF = "118f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CLIENT_REF = "128f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const statuses = ["NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED", "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING", "PRICING_IN_PROGRESS", "QUOTE_DRAFT", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST", "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF"] as const;
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };

function row(index: number) {
  const assigned = index % 3 !== 0;
  return {
    caseRef: index === 0 ? CASE_REF : `118f6d8f-8d11-4f39-8a2d-${String(index + 1).padStart(12, "0")}`,
    caseCode: `CTRL-${String(index + 1).padStart(3, "0")}`,
    client: index === 2 ? null : { clientRef: CLIENT_REF, displayName: `Cliente Sintético ${index + 1}`, type: "PERSON", status: "active" },
    mode: (["LOCAL", "EXPORT", "IMPORT"] as const)[index % 3], serviceType: index % 2 ? "MOVING" : "TECHNOLOGY",
    customerType: "L4_PERSONAL", status: statuses[index % 8], estimatedCbm: index === 4 ? 0 : 8 + index,
    requiresSurvey: index % 2 === 0, surveyMethod: "PRESENCIAL", originLocation: `Origen sintético ${index + 1}`,
    destinationLocation: index === 5 ? "" : `Destino sintético ${index + 1}`, destinationContracted: true, assetsCount: index,
    owner: assigned ? { displayName: index % 2 ? "Ventas Norte" : "Ventas Centro", role: "V", membershipStatus: "ACTIVE" } : null,
    quoteCount: index % 3, eventCount: index + 1, createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-24T14:00:00.000Z",
  };
}
const rows = Array.from({ length: 12 }, (_, index) => row(index));

test("evidencia sanitizada del control comercial compacto", async ({ page }, testInfo) => {
  mkdirSync(EVIDENCE, { recursive: true });
  if (testInfo.project.name === "chromium-desktop") await page.setViewportSize({ width: 1920, height: 1080 });
  let actorRole: "A" | "V" = "A";
  await page.addInitScript(() => { localStorage.setItem("osi-plus.token", "synthetic.control.token"); localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-user", name: "Frederick Demo", role: "A" })); });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { id: "synthetic-user", code: "SYNTHETIC", name: actorRole === "A" ? "Administrador Demo" : "Ventas Demo", email: "demo@example.invalid", phone: "", role: actorRole, status: "active", joinDate: "2026-01-01", points: 0, rating: 0, permissions: ["pipeline:view"], deniedPermissions: [] } }) }));
  await page.route("**/api/crm/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const visible = actorRole === "A" ? rows : rows.filter((item) => item.owner?.displayName === "Ventas Centro");
    if (pathname === "/api/crm/pipeline-summary") { const byStatus = Object.fromEntries(statuses.map((status) => [status, visible.filter((item) => item.status === status).length])); return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: visible.length, assigned: visible.filter((item) => item.owner).length, unassigned: visible.filter((item) => !item.owner).length, byStatus, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }); }
    if (pathname === "/api/crm/pipeline-cases") return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: visible.length, page: 1, pageSize: 25, data: visible }) });
    const selected = visible.find((item) => pathname.endsWith(item.caseRef));
    return route.fulfill({ status: selected ? 200 : 404, contentType: "application/json", headers: privateHeaders, body: JSON.stringify(selected ? { ok: true, data: { ...selected, version: 1, owner: selected.owner ? { displayName: selected.owner.displayName, isCurrentActor: actorRole === "V" } : null } } : { ok: false, error: "CRM_PIPELINE_RESOURCE_NOT_FOUND" }) });
  });

  await page.goto("/commercial");
  await expect(page.getByRole("heading", { name: "Inbox Comercial", exact: true })).toBeVisible();
  const mobile = testInfo.project.name === "chromium-mobile";
  const summaryStrip = page.getByTestId("commercial-summary-strip");
  await expect(summaryStrip).toContainText("12 casos");
  await expect(summaryStrip).toContainText("8 asignados");
  await expect(summaryStrip).toContainText("4 sin asignar");
  await expect(summaryStrip).toContainText("SLA sin configurar");
  const layout = page.getByTestId("commercial-master-detail-layout");
  const queue = page.getByRole("region", { name: "Cola comercial" });
  if (!mobile) {
    const visibleRows = await page.getByRole("button", { name: "Abrir ficha" }).evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().bottom <= window.innerHeight).length);
    expect(visibleRows).toBeGreaterThanOrEqual(10);
    const queueBox = await queue.boundingBox();
    expect(queueBox?.width).toBeGreaterThanOrEqual(559);
    expect(queueBox?.width).toBeLessThanOrEqual(721);
    expect(await layout.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
    expect(await page.getByTestId("commercial-queue-item").first().locator("p").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
  } else {
    expect(await layout.evaluate((element) => getComputedStyle(element).display)).not.toBe("grid");
    expect((await summaryStrip.boundingBox())?.height).toBeLessThanOrEqual(50);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: resolve(EVIDENCE, mobile ? "05-mobile-list.png" : "01-admin-global.png"), fullPage: true });
  if (!mobile) await page.screenshot({ path: resolve(EVIDENCE, "03-alert-list-gray-sla.png"), fullPage: true });
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await expect(page.getByRole("heading", { name: "Ficha del Caso" })).toBeVisible();
  await page.screenshot({ path: resolve(EVIDENCE, mobile ? "06-mobile-detail.png" : "02-admin-selected.png"), fullPage: true });
  if (!mobile) {
    await page.screenshot({ path: resolve(EVIDENCE, "07-gray-sla.png"), fullPage: true });
    actorRole = "V";
    await page.evaluate(() => { localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "synthetic-user", name: "Ventas Demo", role: "V" })); });
    await page.goto("/commercial");
    await expect(page.getByText("Cola personal revalidada por servidor")).toBeVisible();
    await page.screenshot({ path: resolve(EVIDENCE, "04-sales-scope.png"), fullPage: true });
  }
  await expect(page.getByText(CASE_REF)).toHaveCount(0);
});
