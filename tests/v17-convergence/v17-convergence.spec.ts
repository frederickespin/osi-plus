import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const legacyUser = {
  id: "v17-user-a",
  code: "V17-A",
  name: "Usuario V17",
  email: "v17@example.invalid",
  phone: "",
  role: "A",
  status: "active",
  department: null,
  joinDate: "2026-01-01",
  points: 0,
  rating: 0,
};

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installShellApi(context: BrowserContext) {
  const calls = { login: 0, me: 0, crm: 0, evaluator: 0 };
  let role = "A";
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/crm/")) {
      calls.crm += 1;
      await fulfillJson(route, 500, { ok: false, error: "CRM no debe consultarse" });
      return;
    }
    if (path.startsWith("/api/evaluator/")) {
      calls.evaluator += 1;
      await fulfillJson(route, 500, { ok: false, error: "Evaluador no debe consultarse" });
      return;
    }
    const currentUser = { ...legacyUser, role };
    if (path === "/api/auth/login") {
      calls.login += 1;
      await fulfillJson(route, 200, { ok: true, token: "legacy-v17-test", user: currentUser });
      return;
    }
    if (path === "/api/auth/me") {
      calls.me += 1;
      await fulfillJson(route, 200, { ok: true, user: currentUser });
      return;
    }
    await fulfillJson(route, 200, { ok: true, total: 0, data: [] });
  });
  return { calls, setRole(nextRole: string) { role = nextRole; } };
}

async function login(page: import("@playwright/test").Page) {
  await page.getByLabel("Correo electrónico").fill("v17@example.invalid");
  await page.getByLabel("Contraseña").fill("V17-local-test-only");
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
}

async function openMobileNavigationIfNeeded(page: import("@playwright/test").Page) {
  const trigger = page.getByRole("button", { name: "Abrir navegación" });
  if (await trigger.isVisible()) await trigger.click();
}

test("muestra el Evaluador sin presentar mocks como datos reales", async ({ page }) => {
  await page.goto("/tests/v17-convergence/harness.html");
  await expect(page.getByTestId("evaluator-canonical-root")).toBeVisible();
  await expect(page.getByText("Backend del Evaluador no disponible")).toBeVisible();
  await expect(page.getByText("Esta pantalla no representa visitas reales.")).toBeVisible();
});

test("conserva dominio puro y deep link canónico", async ({ page }) => {
  await page.goto("/tests/v17-convergence/harness.html");
  await expect.poll(() => page.locator("html").getAttribute("data-pipeline-route")).toBe("crm-pipeline");
  await expect.poll(() => page.locator("html").getAttribute("data-volume")).toBe("1");
  await expect.poll(() => page.locator("html").getAttribute("data-weight")).toBe("100");
  await expect.poll(() => page.locator("html").getAttribute("data-access-errors")).toBe("1");
  await expect.poll(() => page.locator("html").getAttribute("data-rejected-routes"))
    .toBe("REJECTED,REJECTED,REJECTED,REJECTED,REJECTED");
  await expect.poll(() => page.locator("html").getAttribute("data-non-deep-module-route")).toBe("/");
});

test("usa sólo Bearer en el contrato Evaluador y reconoce desarrollo local", async ({ page }) => {
  await page.goto("/tests/v17-convergence/harness.html");
  await expect.poll(() => page.locator("html").getAttribute("data-environment")).toBe("Desarrollo local");
  await expect.poll(() => page.locator("html").getAttribute("data-environment-matrix"))
    .toBe("development,development,development,preview,production,unknown");
  await expect.poll(() => page.locator("html").getAttribute("data-api-headers")).toBe("accept,authorization");
  await expect.poll(() => page.locator("html").getAttribute("data-evaluator-errors"))
    .toBe("401:EVALUATOR_STATUS_401,403:EVALUATOR_STATUS_403,404:EVALUATOR_STATUS_404,409:EVALUATOR_STATUS_409,503:EVALUATOR_STATUS_503");
});

test("adapta asignados y no asignados sin cargar CRM ni solicitar datos", async ({ page }) => {
  const crmRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/crm")) crmRequests.push(request.url()); });
  await page.goto("/tests/v17-convergence/harness.html");
  await expect.poll(() => page.locator("html").getAttribute("data-pipeline-distribution")).toBe("2/1/1");
  expect(crmRequests).toEqual([]);
  const scripts = await page.locator("script[src]").evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src));
  expect(scripts.some((url) => /RelationalPipelineModule/i.test(url))).toBe(false);
});

test("el shell conserva login, deep links y CRM apagado después de reload", async ({ page, context }) => {
  const shellApi = await installShellApi(context);
  const { calls } = shellApi;
  const crmScripts: string[] = [];
  page.on("response", (response) => {
    if (/RelationalPipelineModule/i.test(response.url())) crmScripts.push(response.url());
  });

  await page.goto("/sales/pipeline");
  await login(page);

  await expect(page).toHaveURL(/\/sales\/pipeline$/);
  await expect(page.getByTestId("crm-pipeline-unavailable")).toBeVisible();
  await expect(page.getByText("Usuario V17", { exact: true })).toBeAttached();
  await expect(page.getByText("Comercial", { exact: true })).toBeAttached();
  await expect(page.getByText("Administración", { exact: true })).toBeAttached();
  await expect(page.getByText("Materiales y Logística", { exact: true })).toBeAttached();
  const collapseNavigation = page.getByRole("button", { name: "Colapsar navegación" });
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await collapseNavigation.click();
    const administrationGroup = page.getByRole("button", { name: "Administración", exact: true });
    await administrationGroup.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Usuarios y Roles", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expandir navegación" }).click();
  }
  expect(calls.crm).toBe(0);
  expect(calls.evaluator).toBe(0);
  expect(crmScripts).toEqual([]);

  await page.reload();
  await expect(page).toHaveURL(/\/sales\/pipeline$/);
  await expect(page.getByText("Usuario V17", { exact: true })).toBeAttached();
  await expect(page.getByTestId("crm-pipeline-unavailable")).toBeVisible();
  expect(calls).toEqual({ login: 1, me: 1, crm: 0, evaluator: 0 });
  expect(crmScripts).toEqual([]);

  await openMobileNavigationIfNeeded(page);
  await page.getByRole("button", { name: "Cerrar Sesión" }).click();
  await expect(page).toHaveURL(/\/sales\/pipeline$/);
  await login(page);
  await expect(page.getByTestId("crm-pipeline-unavailable")).toBeVisible();

  await page.goto("/evaluator");
  await expect(page.getByTestId("evaluator-canonical-root")).toBeVisible();
  await expect(page.getByText("Backend del Evaluador no disponible")).toBeVisible();
  await expect(page.getByText("Evaluador", { exact: true })).toBeAttached();
  await page.reload();
  await expect(page.getByTestId("evaluator-canonical-root")).toBeVisible();
  await openMobileNavigationIfNeeded(page);
  await page.getByRole("button", { name: "Cerrar Sesión" }).click();
  await expect(page).toHaveURL(/\/evaluator$/);
  await login(page);
  await expect(page.getByTestId("evaluator-canonical-root")).toBeVisible();

  shellApi.setRole("C");
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("evaluator-canonical-root")).toHaveCount(0);
  await expect(page.getByText("Evaluador", { exact: true })).toHaveCount(0);
  expect(calls.crm).toBe(0);
  expect(calls.evaluator).toBe(0);
  expect(crmScripts).toEqual([]);
});
