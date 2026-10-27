import { expect, test, type Page } from "@playwright/test";

const MEMBERSHIP = "11111111-1111-4111-8111-111111111111";
const PACKING = "https://ip-suite-inventario-empaquee.vercel.app/empaque/index.html";
const INVENTORY = "https://ip-suite-inventario-empaquee.vercel.app/inventario/index.html";
const REVIEW = "http://127.0.0.1:4198";
type Actor = { role?: string; permissions?: string[]; deniedPermissions?: string[] };

async function authenticate(page: Page, actor: Actor) {
  await page.addInitScript((membershipRef) => {
    localStorage.setItem("osi-plus.token", "synthetic.tool-access.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Persona de prueba", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Pruebas", role: "A", preferred: true }] }));
  }, MEMBERSHIP);
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Cache-Control": "private, no-store" },
    body: JSON.stringify({ ok: true, user: {
      name: "Persona de prueba", role: actor.role ?? "A", status: "active",
      permissions: actor.permissions, deniedPermissions: actor.deniedPermissions ?? [],
      membership: { membershipRef: MEMBERSHIP, tenantName: "Pruebas", role: actor.role ?? "A" },
      memberships: [{ membershipRef: MEMBERSHIP, tenantName: "Pruebas", role: actor.role ?? "A", preferred: true }],
    } }),
  }));
}

test("el permiso comercial explícito abre la calculadora sin transmitir contexto", async ({ page }) => {
  const api: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) api.push(new URL(request.url()).pathname); });
  await authenticate(page, { permissions: ["pipeline:view"] });
  await page.goto("/quotation-tools?client=ajeno&tenant=falso&next=https://example.test/#token=falso");
  await expect(page.getByRole("heading", { name: "Calculadora de empaque" })).toBeVisible();
  const link = page.getByRole("link", { name: /Abrir calculadora/ });
  await expect(link).toHaveAttribute("href", PACKING);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.getByText("La vinculación automática con el expediente de OSI está pendiente.")).toBeVisible();
  expect(api.length).toBeGreaterThan(0);
  expect(api.every((path) => path === "/api/auth/me")).toBe(true);
  expect(await page.locator("iframe").count()).toBe(0);
});

test("roles y datos locales no conceden el permiso que falta", async ({ browser }) => {
  for (const actor of [{ role: "A" }, { role: "V", permissions: [] }, { role: "A", permissions: ["pipeline:view"], deniedPermissions: ["pipeline:view"] }]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const resources: string[] = [];
    page.on("request", (request) => resources.push(request.url()));
    await authenticate(page, actor);
    await page.goto("/quotation-tools?role=A&permission=pipeline:view");
    await expect(page.getByTestId("hub-forbidden")).toBeVisible();
    await expect(page.getByRole("link", { name: /Abrir calculadora/ })).toHaveCount(0);
    expect(resources.some((url) => /ExternalToolLauncher|ip-suite-inventario/.test(url))).toBe(false);
    await context.close();
  }
});

test("un permiso delegado autoriza sólo el lanzador, sin exigir un rol comercial", async ({ page }) => {
  await authenticate(page, { role: "G", permissions: ["pipeline:view"] });
  await page.goto("/quotation-tools");
  await expect(page.getByRole("link", { name: /Abrir calculadora/ })).toHaveAttribute("href", PACKING);
  await page.goto("/commercial");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
});

test("Procesos móviles no monta Survey; la agenda conserva su ruta y su autorización", async ({ page }) => {
  const resources: string[] = [];
  page.on("request", (request) => resources.push(request.url()));
  await authenticate(page, { role: "E", permissions: ["survey:assignment:view"] });
  await page.route("**/api/crm/survey/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) }));
  await page.goto("/mobile-processes");
  await expect(page.getByRole("heading", { name: "Inventario Visual" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Abrir inventario/ })).toHaveAttribute("href", INVENTORY);
  await expect(page.getByRole("button", { name: "Agenda de OSI" })).toBeVisible();
  expect(resources.some((url) => /\/survey\/SurveyApp|\/api\/crm\/survey\//.test(url))).toBe(false);
  const [agendaResponse] = await Promise.all([
    page.waitForResponse("**/api/crm/survey/assignments"),
    page.getByRole("button", { name: "Agenda de OSI" }).click(),
  ]);
  expect(agendaResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/survey$/);
  await expect.poll(() => resources.some((url) => /\/survey\/SurveyApp/.test(url))).toBe(true);
  await expect(page.getByRole("heading", { name: "Agenda de visitas" })).toBeVisible();
  await expect(page.getByText("No hay visitas asignadas para esta membresía.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Abrir inventario/ })).toHaveCount(0);
});

test("la denegación móvil protege ambas rutas", async ({ browser }) => {
  for (const path of ["/mobile-processes", "/survey"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await authenticate(page, { permissions: ["survey:assignment:view"], deniedPermissions: ["survey:assignment:view"] });
    await page.goto(path);
    await expect(page.getByTestId("hub-forbidden")).toBeVisible();
    await expect(page.getByRole("link", { name: /Abrir inventario/ })).toHaveCount(0);
    await context.close();
  }
});

test("la navegación revalida permisos revocados antes de abrir el módulo", async ({ page }) => {
  const actor: Actor = { permissions: ["pipeline:view", "survey:assignment:view"] };
  await authenticate(page, actor);
  await page.goto("/hub");
  await expect(page.getByRole("heading", { name: "Herramientas de cotización" })).toBeVisible();
  actor.deniedPermissions = ["pipeline:view"];
  await page.getByRole("heading", { name: "Herramientas de cotización" }).click();
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  await expect(page.getByRole("link", { name: /Abrir calculadora/ })).toHaveCount(0);
});

test("la revisión publicada es estática, no escribe datos y navega con teclado", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${REVIEW}/hub`);
  await expect(page.getByRole("heading", { name: "Tus herramientas, en su lugar" })).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  const tools = page.getByRole("navigation").getByRole("button", { name: "Herramientas de cotización" });
  await tools.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${REVIEW}/quotation-tools`);
  await expect(page.getByRole("heading", { name: "Calculadora de empaque" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Calculadora de empaque" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Tus herramientas, en su lugar" })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Procesos móviles" }).click();
  await expect(page.getByRole("heading", { name: "Inventario Visual" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agenda de OSI" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(requests.every((url) => url.startsWith(REVIEW))).toBe(true);
  expect(requests.some((url) => /\/api\//.test(url))).toBe(false);
  expect(errors).toEqual([]);
});

test("cada apertura usa el origen actual sin opener, referrer ni parámetros", async ({ page, context }) => {
  const opened: { url: string; referrer?: string }[] = [];
  await context.route("https://ip-suite-inventario-empaquee.vercel.app/**", async (route) => {
    opened.push({ url: route.request().url(), referrer: route.request().headers().referer });
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Destino de prueba</title><h1>Aplicación existente</h1>" });
  });
  for (const [path, label, url] of [["/quotation-tools", /Abrir calculadora/, PACKING], ["/mobile-processes", /Abrir inventario/, INVENTORY]] as const) {
    await page.goto(`${REVIEW}${path}?returnTo=https://example.test/&client=ajeno#token=secreto`);
    const popup = context.waitForEvent("page");
    await page.getByRole("link", { name: label }).click();
    const target = await popup;
    await target.waitForLoadState("domcontentloaded");
    expect(target.url()).toBe(url);
    expect(await target.evaluate(() => window.opener === null)).toBe(true);
    await target.close();
  }
  expect(opened.map((entry) => entry.url)).toEqual([PACKING, INVENTORY]);
  expect(opened.every((entry) => !entry.referrer)).toBe(true);
});

test("la revisión mantiene API cerrada y políticas de aislamiento", async ({ request }) => {
  for (const path of ["/api", "/api/auth/me", "/api/materials/catalog"]) {
    const response = await request.get(`${REVIEW}${path}`);
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ error: "NAVIGATION_REVIEW_ONLY" });
    expect(response.headers()["content-security-policy"]).toContain("connect-src 'none'");
    expect(response.headers()["permissions-policy"]).toContain("camera=()");
  }
  expect((await request.get(`${REVIEW}/survey`)).status()).toBe(404);
});
