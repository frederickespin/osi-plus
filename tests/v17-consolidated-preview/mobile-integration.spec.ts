import { expect, test, type Page } from "@playwright/test";
import { PIPELINE_CASE_STATUSES } from "../../src/crm-relational/types";

const MEMBERSHIP_REF = "118f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PACKING_URL = "https://ip-suite-inventario-empaquee.vercel.app/empaque/index.html";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const mobilePermissions = ["pipeline:view", "survey:assignment:view"];
type Actor = { permissions: string[]; deniedPermissions?: string[] };

async function installSession(page: Page, initialActor: Actor) {
  const state = { actor: initialActor, reads: 0, requests: [] as string[], unexpectedApi: [] as string[] };
  page.on("request", (request) => state.requests.push(new URL(request.url()).pathname));
  await page.addInitScript(({ ref }) => {
    localStorage.setItem("osi-plus.token", "synthetic.mobile.integration.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({
      name: "Storage no autoritativo", role: "A", membershipRef: ref,
      memberships: [{ membershipRef: ref, tenantName: "Tenant de prueba", role: "A", preferred: true }],
    }));
  }, { ref: MEMBERSHIP_REF });
  // An unregistered API call fails locally; these tests never reach a real backend.
  await page.route("**/api/**", (route) => {
    state.unexpectedApi.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 503, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "UNEXPECTED_TEST_API" }) });
  });
  await page.route("**/api/auth/me", (route) => {
    state.reads += 1;
    return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({
      ok: true,
      user: {
        name: "Administrador de integración", role: "A", status: "ACTIVE",
        permissions: state.actor.permissions, deniedPermissions: state.actor.deniedPermissions ?? [],
        commercialCrmPreviewAuthorized: true,
        membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant de prueba", role: "A" },
        memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant de prueba", role: "A", preferred: true }],
      },
    }) });
  });
  return state;
}

async function mockAgenda(page: Page) {
  const requests: { method: string; authorization: string | undefined }[] = [];
  await page.route("**/api/crm/survey/assignments", (route) => {
    requests.push({ method: route.request().method(), authorization: route.request().headers().authorization });
    return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: [{
      assignmentRef: "218f6d8f-8d11-4f39-8a2d-1b6c7e8f9012",
      caseRef: "318f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", caseCode: "CS-INTEGRACION-001",
      clientDisplayName: "Visita integrada de prueba", evaluator: { displayName: "Evaluador de prueba" },
      scheduledStart: "2026-10-28T15:00:00.000Z", scheduledEnd: null, status: "ASSIGNED",
      arrivalAt: null, punctualityConfirmedAt: null,
      context: { origin: "Origen de prueba", destination: "Destino de prueba", services: [] },
      instruction: null, version: 1, surveyRef: null,
    }] }) });
  });
  return requests;
}

async function mockEmptyInbox(page: Page) {
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({
    status: 200, contentType: "application/json", headers: privateHeaders,
    body: JSON.stringify({ ok: true, data: { total: 0, assigned: 0, unassigned: 0,
      byStatus: Object.fromEntries(PIPELINE_CASE_STATUSES.map((status) => [status, 0])),
      sla: { overdue: null, basis: "UNAVAILABLE" },
    } }),
  }));
  await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders,
      body: JSON.stringify({ ok: true, data: [], total: 0, page: Number(params.get("page") || 1), pageSize: Number(params.get("pageSize") || 25) }),
    });
  });
}

test("el Hub ofrece módulos disponibles y conserva los pendientes sin accesos vacíos", async ({ page }) => {
  const state = await installSession(page, { permissions: [
    ...mobilePermissions, "inventory:catalog:view", "inventory:stock:view", "assets:instance:view",
    "projects:view", "ops:view", "wms:view", "fleet:view", "hr:view",
  ] });
  await page.goto("/hub");
  for (const name of ["Comercial y CRM", "Materiales e Inventario", "Herramientas y Equipos", "OSi Plus Mobile"]) {
    await expect(page.locator("main").getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.locator("main").getByRole("heading", { name: "OSi Survey", exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("heading", { name: "Calculadora de Empaque", exact: true })).toHaveCount(0);
  const pending = page.getByTestId("hub-pending-applications");
  await pending.locator("summary").click();
  for (const name of ["Coordinación", "Operaciones", "Taller y Carpintería", "Recursos Humanos"]) {
    await expect(pending.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  expect(state.unexpectedApi).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("Hub y Mobile abren Survey funcional con retorno y conservan el alias survey", async ({ page }) => {
  const state = await installSession(page, { permissions: mobilePermissions });
  const agendaRequests = await mockAgenda(page);
  await page.goto("/hub");
  await page.locator("main").getByRole("button", { name: /OSi Plus Mobile/ }).click();
  await expect(page).toHaveURL(/\/mobile$/);
  await page.getByTestId("osi-plus-mobile-hub").getByRole("button", { name: /OSi Survey/ }).click();
  await expect(page).toHaveURL(/\/mobile\/survey$/);
  await expect(page.getByRole("heading", { name: "Agenda de visitas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visita integrada de prueba" })).toBeVisible();
  await expect(page.getByTestId("crm-survey-visual-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Volver a OSi Plus Mobile", exact: true }).click();
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();
  await page.getByRole("button", { name: "Volver al Hub", exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await page.goto("/survey");
  await expect(page.getByRole("heading", { name: "Visita integrada de prueba" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a OSi Plus Mobile", exact: true }).click();
  await expect(page).toHaveURL(/\/mobile$/);
  expect(agendaRequests.length).toBeGreaterThanOrEqual(2);
  expect(agendaRequests.every((request) => request.method === "GET" && request.authorization === "Bearer synthetic.mobile.integration.token")).toBe(true);
  expect(state.unexpectedApi).toEqual([]);
});

test("la calculadora conserva Mobile y sólo abre el destino externo al pulsar el enlace", async ({ page, context }) => {
  const state = await installSession(page, { permissions: ["pipeline:view"] });
  const externalRequests: { url: string; headers: Record<string, string> }[] = [];
  await context.route(PACKING_URL, (route) => {
    externalRequests.push({ url: route.request().url(), headers: route.request().headers() });
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Calculadora interceptada</title><h1>Calculadora interceptada</h1>" });
  });
  await page.goto("/mobile");
  await page.getByTestId("osi-plus-mobile-hub").getByRole("button", { name: /Calculadora de Empaque/ }).click();
  await expect(page).toHaveURL(/\/mobile\/packing$/);
  const open = page.getByRole("link", { name: "Abrir Calculadora de Empaque" });
  await expect(open).toHaveAttribute("href", PACKING_URL);
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  await expect(open).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(externalRequests).toHaveLength(0);
  const opened = context.waitForEvent("page");
  await open.click();
  const destination = await opened;
  await expect(destination.getByRole("heading", { name: "Calculadora interceptada" })).toBeVisible();
  await expect(page).toHaveURL(/\/mobile\/packing$/);
  expect(await destination.evaluate(() => window.opener === null)).toBe(true);
  expect(externalRequests).toHaveLength(1);
  expect(externalRequests[0].url).toBe(PACKING_URL);
  expect(externalRequests[0].headers.authorization).toBeUndefined();
  expect(externalRequests[0].headers.referer).toBeUndefined();
  await destination.close();
  await page.getByRole("button", { name: "Volver a OSi Plus Mobile", exact: true }).click();
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();
  expect(state.unexpectedApi).toEqual([]);
});

test("Survey y Empaque conservan permisos independientes dentro de la suite", async ({ page }) => {
  const state = await installSession(page, { permissions: ["survey:assignment:view"] });
  await page.goto("/mobile");
  await expect(page.getByTestId("osi-plus-mobile-hub").getByRole("button", { name: /OSi Survey/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Calculadora de Empaque/ })).toHaveCount(0);
  await page.goto("/mobile/packing");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  state.actor = { permissions: ["pipeline:view"] };
  await page.goto("/mobile");
  await expect(page.getByTestId("osi-plus-mobile-hub").getByRole("button", { name: /Calculadora de Empaque/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /OSi Survey/ })).toHaveCount(0);
  await page.goto("/mobile/survey");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  // The old visual-MVP permission cannot grant access to the functional Survey.
  state.actor = { permissions: ["survey:assigned:view"] };
  await page.goto("/mobile");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(state.unexpectedApi).toEqual([]);
});

test("las denegaciones bloquean suite, alias y aplicaciones antes del lazy y de sus APIs", async ({ page }) => {
  const state = await installSession(page, { permissions: mobilePermissions, deniedPermissions: mobilePermissions });
  for (const path of ["/mobile/survey", "/survey", "/mobile/packing", "/mobile"]) {
    state.requests.length = 0;
    await page.goto(path);
    await expect(page.getByTestId("hub-forbidden")).toContainText("403");
    expect(state.requests.filter((request) => request.startsWith("/api/") && request !== "/api/auth/me")).toEqual([]);
    expect(state.requests.some((request) => /HubWorkspace|SurveyApp|ExternalApplication|AdvancedErpShell/.test(request))).toBe(false);
  }
  expect(state.unexpectedApi).toEqual([]);
});

test("una revocación al abrir Survey se revalida y conserva el acceso autorizado a Empaque", async ({ page }) => {
  const state = await installSession(page, { permissions: mobilePermissions });
  await page.goto("/mobile");
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();
  const before = state.reads;
  state.actor = { permissions: mobilePermissions, deniedPermissions: ["survey:assignment:view"] };
  await page.getByTestId("osi-plus-mobile-hub").getByRole("button", { name: /OSi Survey/ }).click();
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  await expect(page).toHaveURL(/\/mobile$/);
  expect(state.requests.some((request) => /SurveyApp|\/api\/crm\/survey\//.test(request))).toBe(false);
  await page.getByRole("button", { name: "Volver a una ruta segura" }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await page.locator("main").getByRole("button", { name: /OSi Plus Mobile/ }).click();
  await expect(page.getByTestId("osi-plus-mobile-hub").getByRole("button", { name: /Calculadora de Empaque/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /OSi Survey/ })).toHaveCount(0);
  expect(state.unexpectedApi).toEqual([]);
});

test("back y forward mantienen la ruta de Mobile y revalidan la sesión", async ({ page }) => {
  const state = await installSession(page, { permissions: ["pipeline:view"] });
  await page.goto("/hub");
  await page.locator("main").getByRole("button", { name: /OSi Plus Mobile/ }).click();
  await expect(page).toHaveURL(/\/mobile$/);
  await page.getByTestId("osi-plus-mobile-hub").getByRole("button", { name: /Calculadora de Empaque/ }).click();
  await expect(page.getByTestId("hub-external-application")).toBeVisible();
  let before = state.reads;
  await page.goBack();
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  before = state.reads;
  await page.goBack();
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.locator("main").getByRole("heading", { name: "OSi Plus Mobile", exact: true })).toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  before = state.reads;
  await page.goForward();
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  before = state.reads;
  await page.goForward();
  await expect(page.getByTestId("hub-external-application")).toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  expect(state.unexpectedApi).toEqual([]);
});

test("el ERP Comercial conecta con Mobile y permite regresar al mismo Hub", async ({ page }) => {
  const state = await installSession(page, { permissions: mobilePermissions });
  await mockEmptyInbox(page);
  await page.goto("/commercial");
  await expect(page.getByRole("heading", { name: "Inbox Comercial", exact: true })).toBeVisible();
  await expect(page.getByTestId("commercial-crm-empty")).toBeVisible();
  const openNavigation = page.getByRole("button", { name: "Abrir navegación ERP", exact: true });
  if (await openNavigation.isVisible()) await openNavigation.click();
  const navigation = page.getByRole("navigation", { name: "Módulos del ERP" });
  for (const name of ["Coordinación", "Operaciones", "Campo y Taller", "Recursos Humanos"]) {
    await expect(navigation.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await navigation.getByRole("button", { name: "OSi Plus Mobile", exact: true }).click();
  await expect(page).toHaveURL(/\/mobile$/);
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();
  await page.getByRole("button", { name: "Volver al Hub", exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.locator("main").getByRole("heading", { name: "Comercial y CRM", exact: true })).toBeVisible();
  expect(state.unexpectedApi).toEqual([]);
});
