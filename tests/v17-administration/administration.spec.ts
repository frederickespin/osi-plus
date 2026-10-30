import { expect, test, type Page } from "@playwright/test";

const MEMBERSHIP_REF = "22222222-2222-4222-8222-222222222222";
const ALL_SECTIONS = [
  "membership:view",
  "services:catalog:view",
  "services:packages:view",
  "services:materials:view",
  "logistics:rules:view",
  "costing:rules:view",
  "communications:templates:view",
  "personnel:profiles:view",
];

// All API requests are intercepted. These tests exercise navigation and
// permission boundaries; they never connect to a deployment or a database.
async function session(page: Page, initialPermissions: string[], initialDenied: string[] = [], materialPolicies: readonly unknown[] = []) {
  let permissions = initialPermissions;
  let deniedPermissions = initialDenied;
  const apiRequests: string[] = [];
  const resources: string[] = [];
  const unexpected: string[] = [];
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.administration.test.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({
      name: "Administración sintética",
      role: "A",
      membershipRef,
      memberships: [{ membershipRef, tenantName: "Empresa sintética", role: "A", preferred: true }],
    }));
  }, { membershipRef: MEMBERSHIP_REF });
  page.on("request", (request) => resources.push(new URL(request.url()).pathname));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    apiRequests.push(path);
    const fulfill = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" },
      body: JSON.stringify(body),
    });
    if (route.request().method() !== "GET") {
      unexpected.push(`${route.request().method()} ${path}`);
      return fulfill({ ok: false, error: "UNEXPECTED_TEST_MUTATION" }, 405);
    }
    if (path === "/api/auth/me") return fulfill({ ok: true, user: {
      name: "Administración sintética", role: "A", status: "ACTIVE", permissions, deniedPermissions,
      membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Empresa sintética", role: "A" },
      memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Empresa sintética", role: "A", preferred: true }],
    } });
    expect(route.request().headers().authorization).toBe("Bearer synthetic.administration.test.token");
    if (path === "/api/admin/memberships") return fulfill({ ok: true, data: [], total: 0, page: 1, pageSize: 20 });
    if (path === "/api/communications/variables") return fulfill({ ok: true, data: { catalogVersion: 1, variables: [] } });
    if (path === "/api/crm/services/material-policies") return fulfill({ ok: true, data: materialPolicies });
    if ([
      "/api/logistics/rules", "/api/costing/rules", "/api/costing/exchange-rates",
      "/api/communications/templates", "/api/crm/services/catalog",
      "/api/crm/services/modes", "/api/crm/services/catalog-modes",
      "/api/crm/services/packages", "/api/crm/services/material-policies",
    ].includes(path)) return fulfill({ ok: true, data: [] });
    unexpected.push(`GET ${path}`);
    return fulfill({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }, 404);
  });
  return {
    apiRequests, resources, unexpected,
    updateAuthorization(nextPermissions: string[], nextDenied: string[] = []) {
      permissions = nextPermissions;
      deniedPermissions = nextDenied;
    },
  };
}

async function selectSection(page: Page, path: string) {
  const mobileSelect = page.getByLabel("Sección de Administración", { exact: true });
  if (await mobileSelect.isVisible()) await mobileSelect.selectOption(path);
  else await page.getByRole("navigation", { name: "Secciones de Administración" }).locator(`a[href="${path}"]`).click();
}

function nonAuth(requests: string[]) { return requests.filter((path) => path !== "/api/auth/me"); }

test("la entrada general carga sólo Accesos aunque las seis secciones estén autorizadas", async ({ page }) => {
  const seen = await session(page, ALL_SECTIONS);
  await page.goto("/administration");
  await expect(page.getByRole("heading", { name: "Administración", exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-tenant-memberships")).toBeVisible();
  await expect(page.getByText("No hay membresías para estos filtros.")).toBeVisible();
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/admin/memberships"]));
  expect(seen.resources.some((path) => /\/(?:ServiceConfigurationAdmin|LogisticsRulesAdmin|CostingRulesAdmin|CommunicationTemplatesAdmin|PersonnelPoliciesAdmin)\.tsx$/.test(path))).toBe(false);
  expect(seen.unexpected).toEqual([]);
});

test("logística y comunicaciones se abren por separado sin permiso de membresías", async ({ page }) => {
  const seen = await session(page, ["logistics:rules:view", "communications:templates:view"]);
  await page.goto("/administration/logistics");
  await expect(page.getByTestId("logistics-rules-admin")).toBeVisible();
  await expect.poll(() => seen.apiRequests.includes("/api/logistics/rules")).toBe(true);
  expect(nonAuth(seen.apiRequests)).not.toContain("/api/communications/templates");
  expect(seen.resources.some((path) => /CommunicationTemplatesAdmin\.tsx$/.test(path))).toBe(false);

  await selectSection(page, "/administration/communications");
  await expect(page).toHaveURL(/\/administration\/communications$/);
  await expect(page.getByRole("heading", { name: "Plantillas y Comunicaciones", exact: true })).toBeVisible();
  await expect(page.getByTestId("logistics-rules-admin")).toHaveCount(0);
  await expect.poll(() => seen.apiRequests.includes("/api/communications/templates")).toBe(true);
  expect(seen.apiRequests.some((path) => path.startsWith("/api/admin/"))).toBe(false);
  expect(seen.resources.some((path) => /AdminTenantMembershipModule\.tsx$/.test(path))).toBe(false);
  expect(seen.unexpected).toEqual([]);
});

test("un lector de Costos entra desde el Hub sin permisos de membresías", async ({ page }) => {
  const seen = await session(page, ["costing:rules:view"]);
  await page.goto("/hub");
  await page.getByRole("button", { name: /Abrir Administración/ }).click();
  await expect(page.getByTestId("costing-rules-admin")).toBeVisible();
  await expect.poll(() => seen.apiRequests.includes("/api/costing/exchange-rates")).toBe(true);
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/costing/rules", "/api/costing/exchange-rates"]));
  expect(seen.unexpected).toEqual([]);
});

test("un lector sólo del catálogo de Servicios no consulta paquetes ni materiales", async ({ page }) => {
  const seen = await session(page, ["services:catalog:view"]);
  await page.goto("/administration");
  await expect(page.getByTestId("service-configuration-admin")).toBeVisible();
  await expect.poll(() => seen.apiRequests.includes("/api/crm/services/catalog")).toBe(true);
  await expect(page.getByText("Cargando configuración…", { exact: true })).toHaveCount(0);
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/crm/services/catalog"]));
  expect(seen.unexpected).toEqual([]);
});

test("un lector sólo de paquetes abre su pestaña y no consulta el catálogo", async ({ page }) => {
  const seen = await session(page, ["services:packages:view"]);
  await page.goto("/administration/services");
  await expect(page.getByRole("heading", { name: "Paquetes reutilizables", exact: true })).toBeVisible();
  await expect.poll(() => seen.apiRequests.includes("/api/crm/services/packages")).toBe(true);
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/crm/services/packages", "/api/crm/services/modes"]));
  expect(seen.unexpected).toEqual([]);
});

test("un lector sólo de políticas de materiales no solicita maestros de otras pestañas", async ({ page }) => {
  const seen = await session(page, ["services:materials:view"]);
  await page.goto("/administration/services");
  await expect(page.getByTestId("service-configuration-admin")).toBeVisible();
  await expect(page.getByText("No hay políticas de materiales registradas.")).toBeVisible();
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/crm/services/material-policies"]));
  expect(seen.unexpected).toEqual([]);
});

test("denegar Logística bloquea su ruta y conserva el acceso independiente a Costos", async ({ page }) => {
  const seen = await session(page, ["logistics:rules:view", "costing:rules:view"], ["logistics:rules:view"]);
  await page.goto("/administration/logistics?permission=logistics:rules:view#enabled");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(nonAuth(seen.apiRequests)).toEqual([]);
  expect(seen.resources.some((path) => /LogisticsRulesAdmin\.tsx$/.test(path))).toBe(false);
  await page.goto("/administration");
  await expect(page.getByTestId("costing-rules-admin")).toBeVisible();
  await expect.poll(() => seen.apiRequests.includes("/api/costing/rules")).toBe(true);
  expect(seen.apiRequests).not.toContain("/api/logistics/rules");
  expect(seen.unexpected).toEqual([]);
});

test("enlace directo, recarga, historial y retorno al Hub conservan la sección", async ({ page }) => {
  const seen = await session(page, ["logistics:rules:view", "costing:rules:view"]);
  await page.goto("/administration/logistics");
  await expect(page.getByTestId("logistics-rules-admin")).toBeVisible();
  await selectSection(page, "/administration/costing");
  await expect(page).toHaveURL(/\/administration\/costing$/);
  await expect(page.getByTestId("costing-rules-admin")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("costing-rules-admin")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/administration\/logistics$/);
  await expect(page.getByTestId("logistics-rules-admin")).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("costing-rules-admin")).toBeVisible();
  await page.getByRole("link", { name: "Volver al Hub", exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.getByRole("button", { name: /Abrir Administración/ })).toBeVisible();
  expect(seen.unexpected).toEqual([]);
});

test("revocar el permiso antes de navegar impide cargar la siguiente sección", async ({ page }) => {
  const seen = await session(page, ["logistics:rules:view", "costing:rules:view"]);
  await page.goto("/administration/logistics");
  await expect(page.getByTestId("logistics-rules-admin")).toBeVisible();
  seen.updateAuthorization(["logistics:rules:view"]);
  await selectSection(page, "/administration/costing");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(seen.apiRequests.some((path) => path.startsWith("/api/costing/"))).toBe(false);
  expect(seen.resources.some((path) => /CostingRulesAdmin\.tsx$/.test(path))).toBe(false);
  expect(seen.unexpected).toEqual([]);
});

test("las seis opciones se pueden recorrer sin desbordar el ancho del dispositivo", async ({ page }, testInfo) => {
  const seen = await session(page, ALL_SECTIONS);
  await page.goto("/administration");
  await expect(page.getByTestId("admin-tenant-memberships")).toBeVisible();
  const paths = ["access", "services", "logistics", "costing", "communications", "policies"].map((section) => `/administration/${section}`);
  if (testInfo.project.name.includes("mobile")) {
    const select = page.getByLabel("Sección de Administración", { exact: true });
    await expect(select).toBeVisible();
    expect(await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(paths);
  } else {
    const navigation = page.getByRole("navigation", { name: "Secciones de Administración" });
    await expect(navigation).toBeVisible();
    for (const path of paths) await expect(navigation.locator(`a[href="${path}"]`)).toBeVisible();
  }
  await page.screenshot({ path: `/tmp/osi-administration-18a-${testInfo.project.name}.png`, fullPage: true });
  await selectSection(page, "/administration/costing");
  await expect(page.getByTestId("costing-rules-admin")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(seen.unexpected).toEqual([]);
});

test("las políticas pobladas conservan el desplazamiento dentro de su tabla", async ({ page }) => {
  const seen = await session(page, ["services:materials:view"], [], [{
    policyRef: "33333333-3333-4333-8333-333333333333",
    versionRef: "44444444-4444-4444-8444-444444444444",
    code: "MATERIALS-SYNTHETIC-18A", name: "Política sintética de materiales", version: 1,
    state: "PUBLISHED", packageVersionRef: null, serviceRef: null, modeRef: null,
    preferenceCode: null, standardCode: "STANDARD", validFrom: null, validTo: null, lines: [],
  }]);
  await page.goto("/administration/services");
  await expect(page.getByText("Política sintética de materiales", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(seen.unexpected).toEqual([]);
});

test("la ayuda se abre por teclado o toque y devuelve el foco sin cambiar la sección", async ({ page }, testInfo) => {
  const seen = await session(page, ["costing:rules:view"]);
  await page.goto("/administration/costing");
  await expect(page.getByTestId("costing-rules-admin")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Ayuda de Costos y monedas", exact: true });
  if (testInfo.project.name.includes("mobile")) await trigger.tap();
  else await trigger.press("Enter");
  const help = page.getByRole("dialog", { name: "Costos y monedas", exact: true });
  await expect(help).toBeVisible();
  await expect(help.getByText(/Cada regla y tasa conserva su versión/)).toBeVisible();
  await page.screenshot({ path: `/tmp/osi-administration-18a-help-${testInfo.project.name}.png`, fullPage: true });
  if (testInfo.project.name.includes("mobile")) await help.getByRole("button", { name: "Cerrar ayuda", exact: true }).tap();
  else await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/administration\/costing$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/costing/rules", "/api/costing/exchange-rates"]));
  expect(seen.unexpected).toEqual([]);
});
