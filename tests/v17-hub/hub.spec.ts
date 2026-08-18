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
    { gate: "__ABSENT__", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: true },
    { gate: "DISABLED", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: true },
    { gate: "LOCAL_ONLY", host: "127.0.0.1", mode: "LOCAL_ONLY", enabled: true, valid: true },
    { gate: "LOCAL_ONLY", host: "localhost", mode: "LOCAL_ONLY", enabled: true, valid: true },
    { gate: "LOCAL_ONLY", host: "[::1]", mode: "LOCAL_ONLY", enabled: true, valid: true },
    { gate: "LOCAL_ONLY", host: "::1", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "127.0.0.1.evil.test", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "localhost.example.test", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "127.0.0.10", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "preview.example.test", mode: "DISABLED", enabled: false, valid: false },
    { gate: "local_only", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY ", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: false },
    { gate: "\"LOCAL_ONLY\"", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: false },
    { gate: "\uFEFFLOCAL_ONLY", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY\r\n", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: false },
    { gate: "UNKNOWN", host: "127.0.0.1", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "127.0.0.1", vercelKey: "VERCEL", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "127.0.0.1", vercelKey: "VERCEL_ENV", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "127.0.0.1", vercelKey: "VERCEL_GIT_COMMIT_REF", mode: "DISABLED", enabled: false, valid: false },
    { gate: "LOCAL_ONLY", host: "127.0.0.1", vercelKey: "VERCEL_URL", mode: "DISABLED", enabled: false, valid: false },
  ];
  for (const { gate, host, vercelKey, mode, enabled, valid } of cases) {
    const params = new URLSearchParams({ gate, host });
    if (vercelKey) params.set("vercelKey", vercelKey);
    await page.goto(`/tests/v17-hub/mode-harness.html?${params}`);
    await expect(page.locator("body")).toHaveAttribute("data-mode", mode);
    await expect(page.locator("body")).toHaveAttribute("data-enabled", String(enabled));
    await expect(page.locator("body")).toHaveAttribute("data-valid", String(valid));
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

test("DISABLED también bloquea deep links sin prefetch, listeners ni timers del Hub", async ({ page }) => {
  const resources: string[] = [];
  await page.addInitScript(() => {
    const originalAddEventListener = window.addEventListener.bind(window);
    const originalSetTimeout = window.setTimeout.bind(window);
    const audit = { listeners: [] as string[], timers: [] as string[] };
    Object.defineProperty(window, "__v17HubDisabledAudit", { value: audit });
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      const stack = new Error().stack || "";
      if (/src[\\/]hub|HubWorkspace|OsiSurveyInactive/i.test(stack)) audit.listeners.push(type);
      return originalAddEventListener(type, listener, options);
    }) as typeof window.addEventListener;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const stack = new Error().stack || "";
      if (/src[\\/]hub|HubWorkspace|OsiSurveyInactive/i.test(stack)) audit.timers.push(String(timeout));
      return originalSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout;
  });
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await authenticate(page, { role: "A", name: "Actor disabled" });
  await page.goto("http://127.0.0.1:4184/survey");
  await expect(page.getByText("Actor disabled")).toBeVisible();
  await expect(page.getByText("OSi Plus Hub", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("osi-survey-inactive")).toHaveCount(0);
  const audit = await page.evaluate(() => (window as typeof window & { __v17HubDisabledAudit: { listeners: string[]; timers: string[] } }).__v17HubDisabledAudit);
  expect(audit).toEqual({ listeners: [], timers: [] });
  expect(resources.some((path) => /HubWorkspace|OsiSurveyInactive|appCatalog|hubAccess/i.test(path))).toBe(false);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /HubWorkspace|OsiSurveyInactive|appCatalog|hubAccess/i.test(entry.name)))).toBe(false);
});

test("matriz de roles muestra sólo aplicaciones baseline", async ({ browser }) => {
  const expected: Record<string, string[]> = {
    A: ["Coordinación", "Operaciones", "Materiales y Equipos", "Taller y Carpintería", "Administración", "Recursos Humanos"],
    V: [], K: ["Coordinación"], B: ["Operaciones"], C: ["Materiales y Equipos"], C1: ["Operaciones"], D: ["Operaciones"], E: ["Operaciones"], G: ["Operaciones"], N: ["Operaciones"],
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
  await authenticate(page, { role: "A", deniedPermissions: ["pipeline:view"] });
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

test("hash, URL, sessionStorage y headers de proxy no alteran autoridad", async ({ page }) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-host": "127.0.0.1",
    "x-osi-role": "A",
    "x-osi-userid": "forged",
  });
  await authenticate(page, { role: "RB" });
  await page.addInitScript(() => {
    sessionStorage.setItem("role", "A");
    sessionStorage.setItem("permissions", "clients:view,survey:assigned:view");
  });
  await page.goto("/commercial?role=A#permission=clients:view");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  await page.goto("/survey?permission=survey:assigned:view#role=A");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
});

test("rutas desconocidas y traversal permanecen cerrados; back/forward conserva la guardia", async ({ page }) => {
  await authenticate(page, { role: "A", permissions: ["pipeline:view"] });
  for (const pathname of ["/unknown-hub-route", "/survey/%252e%252e/commercial", "/%2F%2Fevil.example.test"]) {
    await page.goto(pathname);
    await expect(page.getByText("404 · Ruta del Hub no registrada")).toBeVisible();
  }
  await page.goto("/hub");
  await page.locator("main").getByRole("button", { name: /Comercial y CRM/ }).click();
  await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Hola, Actor A")).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toBeVisible();
});

test("denegar Survey no descarga el módulo destino", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await authenticate(page, { role: "A", deniedPermissions: ["survey:assigned:view"] });
  await page.goto("/survey");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(requests.some((path) => /OsiSurveyInactive/i.test(path))).toBe(false);
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
