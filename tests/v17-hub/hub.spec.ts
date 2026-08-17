import { expect, test, type Page } from "@playwright/test";

type Actor = { role: string; permissions?: string[]; deniedPermissions?: string[]; name?: string };

async function authenticate(page: Page, actor: Actor) {
  await page.addInitScript(({ role }) => {
    localStorage.setItem("osi-plus.token", "synthetic.hub.test.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "hub-test-user", name: "Storage no autoritativo", role }));
    localStorage.setItem("VITE_OSI_HUB_MODE", "LOCAL_ONLY");
    localStorage.setItem("osi-plus.fake-permissions", "admin:full_access");
  }, { role: actor.role });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "hub-test-user", code: "SYNTHETIC", name: actor.name || `Actor ${actor.role}`, email: "synthetic@example.invalid", phone: "", role: actor.role, status: "active", joinDate: "2026-01-01", points: 0, rating: 0, permissions: actor.permissions, deniedPermissions: actor.deniedPermissions } }),
  }));
}

test("compuerta acepta sólo DISABLED/LOCAL_ONLY exactos y LOCAL_ONLY sólo en loopback", async ({ page }) => {
  const cases = [
    ["__ABSENT__", "127.0.0.1", "DISABLED", "false", "true"],
    ["DISABLED", "127.0.0.1", "DISABLED", "false", "true"],
    ["LOCAL_ONLY", "127.0.0.1", "LOCAL_ONLY", "true", "true"],
    ["LOCAL_ONLY", "localhost", "LOCAL_ONLY", "true", "true"],
    ["LOCAL_ONLY", "preview.example.test", "DISABLED", "false", "false"],
    ["LOCAL_ONLY&vercel=1", "127.0.0.1", "DISABLED", "false", "false"],
    ["local_only", "127.0.0.1", "DISABLED", "false", "false"],
    ["%20LOCAL_ONLY", "127.0.0.1", "DISABLED", "false", "false"],
    ["%EF%BB%BFLOCAL_ONLY", "127.0.0.1", "DISABLED", "false", "false"],
  ];
  for (const [gate, host, mode, enabled, valid] of cases) {
    await page.goto(`/tests/v17-hub/mode-harness.html?gate=${gate}&host=${host}`);
    await expect(page.locator("body")).toHaveAttribute("data-mode", mode);
    await expect(page.locator("body")).toHaveAttribute("data-enabled", enabled);
    await expect(page.locator("body")).toHaveAttribute("data-valid", valid);
  }
});

test("DISABLED conserva la aplicación actual y no descarga el chunk Hub", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await authenticate(page, { role: "A", name: "Actor legacy" });
  await page.goto("http://127.0.0.1:4184/");
  await expect(page.getByText("Actor legacy")).toBeVisible();
  await expect(page.getByText("OSi Plus Hub", { exact: true })).toHaveCount(0);
  expect(requests.some((path) => /HubWorkspace|OsiSurveyInactive|appCatalog/i.test(path))).toBe(false);
  expect(requests.filter((path) => path.startsWith("/api/"))).toEqual(["/api/auth/me"]);
});

test("matriz de roles muestra sólo aplicaciones baseline", async ({ browser }) => {
  const expected: Record<string, string[]> = {
    A: ["Comercial y CRM", "Coordinación", "Operaciones", "Materiales y Equipos", "Taller y Carpintería", "Administración", "Recursos Humanos"],
    V: ["Comercial y CRM"], K: ["Coordinación"], B: ["Operaciones"], C: ["Materiales y Equipos"], C1: ["Operaciones"], D: ["Operaciones"], E: ["Operaciones"], G: ["Operaciones"], N: ["Operaciones"],
    PA: ["Taller y Carpintería"], PB: ["Taller y Carpintería"], PC: ["Taller y Carpintería"], PD: ["Taller y Carpintería"], PF: ["Taller y Carpintería"], I: ["Recursos Humanos"], PE: ["Operaciones"], RB: [],
  };
  for (const [role, apps] of Object.entries(expected)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await authenticate(page, { role });
    await page.goto("/hub");
    await expect(page.getByText("OSi Plus Hub", { exact: true }).first()).toBeVisible();
    expect(await page.locator("main h2").allTextContents()).toEqual(apps);
    await context.close();
  }
});

test("deniedPermissions prevalece y ruta directa usa la misma decisión 403", async ({ page }) => {
  await authenticate(page, { role: "A", deniedPermissions: ["clients:view"] });
  await page.goto("/hub?app=commercial-crm", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toHaveCount(0);
  await page.goto("/commercial?role=A");
  await expect(page.getByTestId("hub-forbidden")).toContainText("403");
});

test("query, storage y x-osi-* no elevan un contexto validado", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-osi-role": "A", "x-osi-userid": "forged" });
  await authenticate(page, { role: "G" });
  await page.goto("/commercial?role=A&permission=clients:view");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  await page.goto("/hub");
  await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Operaciones" })).toBeVisible();
});

test("OSi Survey exige autorización explícita y permanece sin API ni persistencia", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/")) apiRequests.push(path); });
  await authenticate(page, { role: "D", permissions: ["survey:assigned:view"] });
  await page.goto("/survey");
  await expect(page.getByTestId("osi-survey-inactive")).toContainText("Módulo planificado — sin backend conectado");
  expect(apiRequests).toEqual(["/api/auth/me"]);
  const stored = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  expect(stored.session).toEqual([]);
  expect(stored.local.some((key) => /survey|draft|autosave/i.test(key))).toBe(false);
});

test("deep link, reload, regreso al Hub y navegación móvil conservan autoridad", async ({ page }, testInfo) => {
  await authenticate(page, { role: "A" });
  await page.goto("/materials");
  await expect(page.getByRole("heading", { name: "Materiales y Equipos" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Materiales y Equipos" })).toBeVisible();
  await page.getByRole("button", { name: "OSi Plus Hub", exact: true }).click();
  await expect(page.getByText("Hola, Actor A")).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    await expect(page.getByRole("navigation", { name: "Aplicaciones OSi Plus" })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar navegación" }).press("Enter");
  } else {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  }
});
