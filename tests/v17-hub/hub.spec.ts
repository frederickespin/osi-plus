import { expect, test, type Page } from "@playwright/test";

type Actor = { role: string; permissions?: string[]; deniedPermissions?: string[]; name?: string };

function authMeBody(actor: Actor & { id?: string }) {
  return JSON.stringify({
    ok: true,
    user: {
      id: actor.id || "hub-test-user",
      code: "SYNTHETIC",
      name: actor.name || `Actor ${actor.role}`,
      email: "synthetic@example.invalid",
      phone: "",
      role: actor.role,
      status: "active",
      joinDate: "2026-01-01",
      points: 0,
      rating: 0,
      permissions: actor.permissions,
      deniedPermissions: actor.deniedPermissions,
    },
  });
}

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
    body: authMeBody(actor),
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
  expect(requests.some((path) => /HubWorkspace|OsiSurveyInactive|CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
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
  expect(resources.some((path) => /HubWorkspace|OsiSurveyInactive|CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /HubWorkspace|OsiSurveyInactive|CommercialInboxModule|CommercialCaseDetail/i.test(entry.name)))).toBe(false);
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
    if (apps.length === 0) {
      await expect(page.getByTestId("hub-forbidden")).toBeVisible();
      await expect(page.getByText("OSi Plus Hub", { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText("OSi Plus Hub", { exact: true }).first()).toBeVisible();
      expect(await page.locator("main h2").allTextContents()).toEqual(apps);
    }
    await context.close();
  }
});

test("deniedPermissions prevalece antes del lazy y no bloquea otras aplicaciones legítimas", async ({ browser }) => {
  const deniedContext = await browser.newContext();
  const deniedPage = await deniedContext.newPage();
  const deniedResources: string[] = [];
  deniedPage.on("request", (request) => deniedResources.push(new URL(request.url()).pathname));
  await authenticate(deniedPage, { role: "A", deniedPermissions: ["pipeline:view"] });
  await deniedPage.goto("/commercial?role=A");
  await expect(deniedPage.getByTestId("hub-forbidden")).toContainText("403");
  await expect(deniedPage.getByRole("heading", { name: "No puedes abrir esta aplicación" })).toBeFocused();
  await expect(deniedPage.getByRole("button", { name: "Volver a una ruta segura" })).toBeVisible();
  expect(deniedResources.some((path) => /HubWorkspace|CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
  expect(deniedResources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
  await deniedContext.close();

  const hubContext = await browser.newContext();
  const hubPage = await hubContext.newPage();
  await authenticate(hubPage, { role: "A", deniedPermissions: ["pipeline:view"] });
  await hubPage.goto("/hub?app=commercial-crm", { waitUntil: "domcontentloaded" });
  await expect(hubPage.getByRole("heading", { name: "Comercial y CRM" })).toHaveCount(0);
  await expect(hubPage.getByRole("heading", { name: "Coordinación" })).toBeVisible();
  await hubContext.close();
});

test("query, storage y x-osi-* no elevan un contexto validado", async ({ page }) => {
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await page.setExtraHTTPHeaders({ "x-osi-role": "A", "x-osi-userid": "forged" });
  await authenticate(page, { role: "G" });
  await page.goto("/commercial?role=A&permission=clients:view");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(resources.some((path) => /HubWorkspace|CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
  expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
  await page.goto("/hub");
  await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Operaciones" })).toBeVisible();
});

test("hash, URL, sessionStorage y headers de proxy no alteran autoridad", async ({ page }) => {
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
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
  expect(resources.some((path) => /HubWorkspace|CommercialInboxModule|CommercialCaseDetail|OsiSurveyInactive/i.test(path))).toBe(false);
  expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
});

test("cuatro rutas deny, back/forward y logout permanecen antes del límite lazy", async ({ browser }) => {
  const actor = { role: "V", permissions: ["pipeline:view"], deniedPermissions: ["pipeline:view"] };
  const routes = ["/commercial", "/crm", "/sales/pipeline", "/commercial/cases/22222222-2222-4222-8222-222222222222"];
  for (const route of routes) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const resources: string[] = [];
    const issues: string[] = [];
    page.on("request", (request) => resources.push(new URL(request.url()).pathname));
    page.on("console", (message) => { if (["warning", "error"].includes(message.type())) issues.push(message.type()); });
    page.on("pageerror", () => issues.push("pageerror"));
    await authenticate(page, actor);
    await page.goto(`${route}?role=A&permission=pipeline:view#pipeline:view`);
    await expect(page.getByTestId("hub-forbidden")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No puedes abrir esta aplicación" })).toBeFocused();
    expect(resources.some((path) => /HubWorkspace|CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
    expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
    expect(issues).toEqual([]);
    await context.close();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  const resources: string[] = [];
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await authenticate(page, actor);
  await page.goto("/commercial");
  await page.goto("/crm");
  await page.goBack();
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(resources.some((path) => /HubWorkspace|CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
  expect(resources.some((path) => path.startsWith("/api/crm/"))).toBe(false);
  await page.getByRole("button", { name: "Volver a una ruta segura" }).press("Enter");
  await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("osi-plus.token"), localStorage.getItem("osi-plus.session")])).toEqual([null, null]);
  await context.close();
});

test("un permiso retirado se revalida antes de una navegación SPA y bloquea el Inbox", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let denied = false;
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.hub.revocation.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "hub-revocation-user", name: "Actor revalidado", role: "V" }));
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "hub-revocation-user", code: "SYNTHETIC", name: "Actor revalidado", email: "synthetic@example.invalid", phone: "", role: "V", status: "active", joinDate: "2026-01-01", points: 0, rating: 0, permissions: ["pipeline:view"], deniedPermissions: denied ? ["pipeline:view"] : [] } }),
  }));
  await page.goto("/hub");
  await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toBeVisible();
  denied = true;
  const requestsAfterRevocation: string[] = [];
  page.on("request", (request) => requestsAfterRevocation.push(new URL(request.url()).pathname));
  await page.locator("main").getByRole("button").filter({ hasText: "Comercial y CRM" }).click();
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/hub");
  expect(requestsAfterRevocation.filter((path) => path === "/api/auth/me")).toHaveLength(1);
  expect(requestsAfterRevocation.some((path) => /CommercialInboxModule|CommercialCaseDetail/i.test(path))).toBe(false);
  expect(requestsAfterRevocation.some((path) => path.startsWith("/api/crm/"))).toBe(false);
  await context.close();
});

test("pushState espera autorización y un fallo de red desmonta el Hub con error accesible", async ({ page }) => {
  const actor = { id: "hub-network-user", role: "A", permissions: ["pipeline:view"] };
  let requestNumber = 0;
  let navigationOutcome: "ALLOW" | "NETWORK_ERROR" | "UNAUTHORIZED" = "ALLOW";
  let releaseNavigation: (() => void) | null = null;
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.hub.network.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "hub-network-user", name: "Actor red", role: "A" }));
  });
  await page.route("**/api/auth/me", async (route) => {
    requestNumber += 1;
    if (requestNumber > 1 && navigationOutcome === "NETWORK_ERROR") await new Promise<void>((resolve) => { releaseNavigation = resolve; });
    if (navigationOutcome === "NETWORK_ERROR") {
      await route.abort("connectionfailed");
      return;
    }
    if (navigationOutcome === "UNAUTHORIZED") {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: "UNAUTHORIZED" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: authMeBody(actor) });
  });

  await page.goto("/hub");
  await expect(page.getByText("Hola, Actor A")).toBeVisible();
  navigationOutcome = "NETWORK_ERROR";
  await page.locator("main").getByRole("button").filter({ hasText: "Comercial y CRM" }).click();
  await expect(page.locator('[role="status"]')).toContainText("Verificando acceso");
  expect(new URL(page.url()).pathname).toBe("/hub");
  await expect(page.getByText("Hola, Actor A")).toBeVisible();
  releaseNavigation?.();
  await expect(page.getByTestId("hub-authorization-error")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No pudimos verificar tu sesión" })).toBeFocused();
  await expect(page.getByText("Hola, Actor A")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/hub");

  navigationOutcome = "UNAUTHORIZED";
  await page.getByRole("button", { name: "Volver a una ruta segura" }).press("Enter");
  await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("osi-plus.token"), localStorage.getItem("osi-plus.session")])).toEqual([null, null]);
});

test("cambio de identidad y logout durante revalidación cierran la sesión y anulan respuestas tardías", async ({ page }, testInfo) => {
  let phase: "INITIAL" | "IDENTITY_CHANGE" | "PENDING_LOGOUT" = "INITIAL";
  const observedPhases: string[] = [];
  let releaseNavigation: (() => void) | null = null;
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.hub.continuity.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "hub-continuity-user", name: "Actor continuo", role: "A" }));
  });
  await page.route("**/api/auth/me", async (route) => {
    observedPhases.push(phase);
    if (phase === "PENDING_LOGOUT") await new Promise<void>((resolve) => { releaseNavigation = resolve; });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: authMeBody({ id: phase === "IDENTITY_CHANGE" ? "different-tenant-user" : "hub-continuity-user", role: "A", permissions: ["pipeline:view", "projects:view"] }),
    });
  });

  await page.goto("/hub");
  await page.waitForLoadState("networkidle");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("osi-plus.session") || "{}"))).toMatchObject({ userId: "hub-continuity-user" });
  phase = "IDENTITY_CHANGE";
  await page.locator("main").getByRole("button").filter({ hasText: "Coordinación" }).click();
  await expect.poll(() => observedPhases.filter((value) => value === "IDENTITY_CHANGE").length).toBe(1);
  await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("osi-plus.token"), localStorage.getItem("osi-plus.session")])).toEqual([null, null]);

  phase = "INITIAL";
  await page.reload();
  await expect(page.getByText("Hola, Actor A")).toBeVisible();
  await page.waitForLoadState("networkidle");
  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("button", { name: "Abrir navegación" }).click();
  }
  phase = "PENDING_LOGOUT";
  releaseNavigation = null;
  const navigationRoot = testInfo.project.name.includes("mobile") ? page.getByRole("navigation", { name: "Aplicaciones OSi Plus" }) : page.locator("main");
  await navigationRoot.getByRole("button").filter({ hasText: "Coordinación" }).click();
  await expect.poll(() => releaseNavigation !== null).toBe(true);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  releaseNavigation?.();
  await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  await page.waitForTimeout(100);
  await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/hub");
});

test("veinte intenciones rápidas cancelan las anteriores y sólo la última gana", async ({ page }) => {
  const actor = { id: "hub-race-user", role: "A", permissions: ["pipeline:view", "projects:view"] };
  let requestNumber = 0;
  const pendingNavigationResponses: Array<() => void> = [];
  const failedRequests: string[] = [];
  const apiRequests: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("osi-plus.token", "synthetic.hub.race.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "hub-race-user", name: "Actor carrera", role: "A" }));
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) apiRequests.push(path);
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/me") failedRequests.push(request.failure()?.errorText || "aborted");
  });
  await page.route("**/api/auth/me", async (route) => {
    requestNumber += 1;
    const current = requestNumber;
    if (current > 1) await new Promise<void>((resolve) => pendingNavigationResponses.push(resolve));
    try {
      await route.fulfill({ status: 200, contentType: "application/json", body: authMeBody(actor) });
    } catch {
      // El navegador canceló correctamente una intención obsoleta.
    }
  });

  await page.goto("/hub");
  const commercial = page.locator("main").getByRole("button").filter({ hasText: "Comercial y CRM" });
  const coordination = page.locator("main").getByRole("button").filter({ hasText: "Coordinación" });
  for (let index = 0; index < 20; index += 1) {
    await (index % 2 === 0 ? commercial : coordination).click();
  }
  await expect.poll(() => pendingNavigationResponses.length).toBe(20);
  pendingNavigationResponses.at(-1)?.();
  await expect(page).toHaveURL(/\/coordination$/);
  await expect(page.getByRole("heading", { name: "Coordinación" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/coordination");
  expect(apiRequests.filter((path) => path === "/api/auth/me")).toHaveLength(21);
  expect(apiRequests.some((path) => path.startsWith("/api/crm/"))).toBe(false);
  expect(failedRequests.length).toBeGreaterThanOrEqual(19);
  for (const release of pendingNavigationResponses.slice(0, -1).reverse()) release();
  await page.waitForTimeout(100);
  await expect(page.getByRole("heading", { name: "Coordinación" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/coordination");
});

test("cincuenta navegaciones no acumulan listeners, timers ni revalidaciones", async ({ page }) => {
  const actor = { id: "hub-stability-user", role: "A", permissions: ["pipeline:view", "projects:view"] };
  let authRequests = 0;
  await page.addInitScript(() => {
    const originalAdd = window.addEventListener.bind(window);
    const originalRemove = window.removeEventListener.bind(window);
    let activePopstate = 0;
    Object.defineProperty(window, "__hubNavigationAudit", { value: { get activePopstate() { return activePopstate; } } });
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "popstate") activePopstate += 1;
      return originalAdd(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === "popstate") activePopstate -= 1;
      return originalRemove(type, listener, options);
    }) as typeof window.removeEventListener;
    localStorage.setItem("osi-plus.token", "synthetic.hub.stability.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ userId: "hub-stability-user", name: "Actor estable", role: "A" }));
  });
  await page.route("**/api/auth/me", async (route) => {
    authRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: authMeBody(actor) });
  });
  await page.goto("/hub");
  const startedAt = Date.now();
  for (let index = 0; index < 25; index += 1) {
    await page.locator("main").getByRole("button").filter({ hasText: "Coordinación" }).click();
    await expect(page).toHaveURL(/\/coordination$/);
    await expect(page.getByRole("heading", { name: "Coordinación" })).toBeVisible();
    await page.getByRole("button", { name: "OSi Plus Hub", exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.getByText("Hola, Actor A")).toBeVisible();
  }
  const elapsedMs = Date.now() - startedAt;
  const audit = await page.evaluate(() => (window as typeof window & { __hubNavigationAudit: { activePopstate: number } }).__hubNavigationAudit);
  expect(audit.activePopstate).toBe(1);
  expect(authRequests).toBe(51);
  expect(elapsedMs).toBeLessThan(30_000);
});

test("rutas desconocidas y traversal permanecen cerrados; back/forward conserva la guardia", async ({ page }) => {
  await authenticate(page, { role: "A", permissions: ["pipeline:view"] });
  for (const pathname of ["/unknown-hub-route", "/survey/%252e%252e/commercial", "/%2F%2Fevil.example.test"]) {
    await page.goto(pathname);
    await expect(page.getByText("404 · Ruta del Hub no registrada")).toBeVisible();
  }
  await page.goto("/hub");
  await page.locator("main").getByRole("button", { name: /Comercial y CRM/ }).click();
  await expect(page).toHaveURL(/\/commercial$/);
  await expect(page.getByRole("heading", { name: "Comercial y CRM" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/hub$/);
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
  expect(requests.some((path) => /HubWorkspace|OsiSurveyInactive/i.test(path))).toBe(false);
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
