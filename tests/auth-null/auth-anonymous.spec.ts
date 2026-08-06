import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const SESSION_KEY = "osi-plus.session";
const TOKEN_KEY = "osi-plus.token";
const V2_PATH = /^\/api\/auth\/(?:refresh|logout|session\/upgrade)$/;
const RELEVANT_ROLES = [
  "A", "V", "K", "B", "C", "C1", "D", "E", "G", "N", "PA", "PB", "PC", "PD", "PF", "I", "PE", "RB",
] as const;

type ApiMode = "OK" | "UNAUTHORIZED";

function user(role: string) {
  return {
    id: `user-${role}`,
    code: `EMP-${role}`,
    name: `Usuario ${role}`,
    email: `${role.toLowerCase()}@example.invalid`,
    phone: "",
    role,
    status: "active",
    department: null,
    joinDate: "2026-01-01",
    points: 0,
    rating: 0,
  };
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installLegacySession(page: Page, role = "A", token = `legacy-${role}`) {
  await page.addInitScript(({ sessionKey, tokenKey, selectedRole, selectedToken }) => {
    localStorage.setItem(sessionKey, JSON.stringify({
      userId: `user-${selectedRole}`,
      name: `Usuario ${selectedRole}`,
      role: selectedRole,
      token: selectedToken,
    }));
    localStorage.setItem(tokenKey, selectedToken);
  }, { sessionKey: SESSION_KEY, tokenKey: TOKEN_KEY, selectedRole: role, selectedToken: token });
}

async function configureApi(context: BrowserContext, options: {
  mode?: ApiMode;
  role?: () => string;
  delayMeMs?: number;
} = {}) {
  const calls = { me: 0, v2: 0, other: 0 };
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (V2_PATH.test(path)) {
      calls.v2 += 1;
      await fulfillJson(route, 500, { ok: false, error: "V2 inesperado" });
      return;
    }
    if (path === "/api/auth/me") {
      calls.me += 1;
      if (options.delayMeMs) await new Promise((resolve) => setTimeout(resolve, options.delayMeMs));
      if (options.mode === "UNAUTHORIZED") {
        await fulfillJson(route, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      const role = options.role?.() ?? "A";
      await fulfillJson(route, 200, { ok: true, user: user(role) });
      return;
    }
    if (path === "/api/auth/login") {
      const role = options.role?.() ?? "A";
      await fulfillJson(route, 200, { ok: true, token: `legacy-${role}`, user: user(role) });
      return;
    }
    calls.other += 1;
    await fulfillJson(route, 200, { ok: true, total: 0, data: [] });
  });
  return calls;
}

function capturePageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error.stack || error.message)));
  return errors;
}

async function expectLogin(page: Page) {
  await expect(page.getByText("OSi-Plus ERP", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    const requested = new URL(route.request().url());
    if (requested.protocol === "http:" && requested.hostname === "127.0.0.1" && requested.port === "4175") {
      await route.fallback();
      return;
    }
    await route.abort("blockedbyclient");
    throw new Error(`Solicitud externa bloqueada: ${requested.origin}`);
  });
});

test("navegación limpia y recarga permanecen anónimas sin errores", async ({ page, context }) => {
  const calls = await configureApi(context);
  const errors = capturePageErrors(page);
  await page.goto("/");
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
  await expectLogin(page);
  await page.reload();
  await expectLogin(page);
  expect(calls).toEqual({ me: 0, v2: 0, other: 0 });
});

test("deep link protegido muestra login sin redirección", async ({ page, context }) => {
  const calls = await configureApi(context);
  const errors = capturePageErrors(page);
  await page.goto("/comercial/cotizacion/privada");
  await expectLogin(page);
  expect(page.url()).toContain("/comercial/cotizacion/privada");
  expect(errors).toEqual([]);
  expect(calls.v2).toBe(0);
});

test("AUTH_LOADING no lee role antes de validar la sesión", async ({ page, context }) => {
  await installLegacySession(page, "V");
  const calls = await configureApi(context, { role: () => "V", delayMeMs: 350 });
  const errors = capturePageErrors(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Verificando sesión...")).toBeVisible();
  await expect(page.getByText("Usuario V")).toBeVisible();
  expect(errors).toEqual([]);
  expect(calls.me).toBe(1);
  expect(calls.v2).toBe(0);
});

for (const scenario of ["respuesta /auth/me 401", "JWT expirado"] as const) {
  test(`${scenario} limpia la sesión y muestra login`, async ({ page, context }) => {
    await installLegacySession(page, "A", scenario === "JWT expirado" ? "expired-jwt" : "rejected-jwt");
    const calls = await configureApi(context, { mode: "UNAUTHORIZED" });
    const errors = capturePageErrors(page);
    await page.goto("/");
    await expectLogin(page);
    const stored = await page.evaluate(({ sessionKey, tokenKey }) => ({
      session: localStorage.getItem(sessionKey),
      token: localStorage.getItem(tokenKey),
    }), { sessionKey: SESSION_KEY, tokenKey: TOKEN_KEY });
    expect(stored).toEqual({ session: null, token: null });
    expect(errors).toEqual([]);
    expect(calls.me).toBe(1);
    expect(calls.v2).toBe(0);
  });
}

test("localStorage legacy corrupto se elimina sin consultar role", async ({ page, context }) => {
  await page.addInitScript(({ sessionKey, tokenKey }) => {
    localStorage.setItem(sessionKey, "{corrupto");
    localStorage.setItem(tokenKey, "legacy-orphan");
  }, { sessionKey: SESSION_KEY, tokenKey: TOKEN_KEY });
  const calls = await configureApi(context);
  const errors = capturePageErrors(page);
  await page.goto("/");
  await expectLogin(page);
  expect(await page.evaluate(({ sessionKey, tokenKey }) => [
    localStorage.getItem(sessionKey), localStorage.getItem(tokenKey),
  ], { sessionKey: SESSION_KEY, tokenKey: TOKEN_KEY })).toEqual([null, null]);
  expect(errors).toEqual([]);
  expect(calls).toEqual({ me: 0, v2: 0, other: 0 });
});

test("login y logout LEGACY conservan el contrato sin llamadas V2", async ({ page, context }) => {
  const role = "A";
  const calls = await configureApi(context, { role: () => role });
  const errors = capturePageErrors(page);
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("admin@example.invalid");
  await page.getByLabel("Contraseña").fill("Legacy123*");
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
  await expect(page.getByText("Usuario A")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar Sesión" }).click();
  await expectLogin(page);
  expect(await page.evaluate(({ sessionKey, tokenKey }) => [
    localStorage.getItem(sessionKey), localStorage.getItem(tokenKey),
  ], { sessionKey: SESSION_KEY, tokenKey: TOKEN_KEY })).toEqual([null, null]);
  expect(errors).toEqual([]);
  expect(calls.me).toBe(0);
  expect(calls.v2).toBe(0);
});

test("cada rol legacy sólo entra al shell después de AUTHENTICATED", async ({ page, context }) => {
  let role = "A";
  const calls = await configureApi(context, { role: () => role });
  const errors = capturePageErrors(page);
  await installLegacySession(page, role);
  for (const selectedRole of RELEVANT_ROLES) {
    role = selectedRole;
    await page.goto("/");
    await expect(page.getByText(`Usuario ${selectedRole}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar Sesión" })).toBeVisible();
    await page.evaluate(({ sessionKey, tokenKey, nextRole }) => {
      const token = `legacy-${nextRole}`;
      localStorage.setItem(sessionKey, JSON.stringify({
        userId: `user-${nextRole}`, name: `Usuario ${nextRole}`, role: nextRole, token,
      }));
      localStorage.setItem(tokenKey, token);
    }, { sessionKey: SESSION_KEY, tokenKey: TOKEN_KEY, nextRole: selectedRole });
  }
  expect(errors).toEqual([]);
  expect(calls.me).toBe(RELEVANT_ROLES.length);
  expect(calls.v2).toBe(0);
});
