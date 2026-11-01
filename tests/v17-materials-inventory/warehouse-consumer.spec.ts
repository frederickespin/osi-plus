import { expect, test, type Page, type Route } from "@playwright/test";

const membershipRef = "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
async function session(page: Page, permissions: string[], deniedPermissions: string[] = []) {
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.materials.reader");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Lector sintético", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] }));
  }, { membershipRef });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ok: true, user: { name: "Lector sintético", role: "A", status: "ACTIVE", permissions, deniedPermissions, membership: { membershipRef, tenantName: "Tenant sintético", role: "A" }, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] } } }));
}
function empty(path: string) { return path.endsWith("/catalog") ? { page: 1, pageSize: 25, total: 0, items: [] } : path.endsWith("/movements") ? { items: [] } : []; }

test("lector de catálogo y stock consulta sólo la pestaña elegida y respeta deny", async ({ page }) => {
  await session(page, ["inventory:catalog:view", "inventory:stock:view", "inventory:recipes:view"], ["inventory:recipes:view"]);
  const reads: string[] = [];
  await page.route("**/api/materials/**", (route) => {
    const path = new URL(route.request().url()).pathname; reads.push(path);
    return route.fulfill({ json: { ok: true, data: empty(path) } });
  });
  await page.goto("/materials");
  await expect(page.getByText("No hay materiales para estos filtros.")).toBeVisible();
  expect([...new Set(reads)].sort()).toEqual(["/api/materials/catalog", "/api/materials/warehouses"]);
  await expect(page.getByRole("button", { name: "Reservas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recetas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Necesidades Survey", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Movimientos", exact: true }).click();
  await expect.poll(() => reads.filter((path) => path.endsWith("/movements")).length).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("una carga anterior no publica errores en otra pestaña", async ({ page }) => {
  await session(page, ["inventory:catalog:view", "inventory:stock:view", "inventory:recipes:view"]);
  const reads: string[] = [];
  let pendingRecipe: Route | undefined;
  await page.route("**/api/materials/**", (route) => {
    const path = new URL(route.request().url()).pathname; reads.push(path);
    if (path.endsWith("/recipes")) { pendingRecipe = route; return; }
    return route.fulfill({ json: { ok: true, data: empty(path) } });
  });
  await page.goto("/materials");
  await expect(page.getByText("No hay materiales para estos filtros.")).toBeVisible();
  expect(reads).not.toContain("/api/materials/recipes");
  expect(reads).not.toContain("/api/materials/requirements");
  await page.getByRole("button", { name: "Recetas", exact: true }).click();
  await expect.poll(() => Boolean(pendingRecipe)).toBe(true);
  await page.getByRole("button", { name: "Necesidades Survey", exact: true }).click();
  await expect.poll(() => reads.includes("/api/materials/requirements")).toBe(true);
  const lateResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/materials/recipes");
  await pendingRecipe!.fulfill({ status: 403, json: { ok: false, error: "MATERIALS_FORBIDDEN" } });
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.getByText(/snapshots inmutables/)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("materiales se integra en Almacenes con un solo main y controles compactos", async ({ page }, testInfo) => {
  await session(page, ["inventory:catalog:view", "inventory:stock:view"]);
  await page.route("**/api/materials/**", (route) => route.fulfill({ json: { ok: true, data: empty(new URL(route.request().url()).pathname) } }));
  await page.goto("/warehouses/materials");
  await expect(page.getByRole("heading", { name: "Almacenes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Materiales e Inventario", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Volver al Hub" })).toHaveCount(0);
  const height = await page.getByLabel("Filtrar por familia").evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBe(testInfo.project.name.includes("mobile") ? 32 : 28);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("un error de recepción conserva la cantidad y el formulario", async ({ page }) => {
  await session(page, ["inventory:catalog:view", "inventory:stock:view", "inventory:stock:receive"]);
  const materialRef = "148f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
  const warehouseRef = "348f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
  const locationRef = "448f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
  await page.route("**/api/materials/catalog", (route) => route.fulfill({ json: { ok: true, data: { page: 1, pageSize: 25, total: 1, items: [{ materialRef, code: "CAJA", name: "Caja sintética", description: null, family: "CAJAS", subfamily: null, baseUnit: { unitRef: membershipRef, code: "UND", name: "Unidad" }, status: "ACTIVE", version: 1, minimumStock: null, reorderPoint: null, currentCost: null, inventory: { physical: 0, reserved: 0, assigned: 0, available: 0, byWarehouse: [] } }] } } }));
  await page.route("**/api/materials/warehouses", (route) => route.fulfill({ json: { ok: true, data: [{ warehouseRef, code: "ALM", name: "Almacén sintético", status: "ACTIVE", version: 1, locations: [{ locationRef, code: "RAIZ", name: "Almacén sintético", kind: "WAREHOUSE_ROOT", depth: 0, path: "RAIZ", status: "ACTIVE", parentLocationRef: null, version: 1 }] }] } }));
  await page.route("**/api/materials/movements", (route) => route.fulfill({ status: 409, json: { ok: false, error: "MATERIALS_VERSION_CONFLICT" } }));
  await page.goto("/materials");
  await page.getByText("Caja sintética", { exact: true }).click();
  await page.getByRole("button", { name: "Recepción", exact: true }).click();
  const quantity = page.getByLabel("Cantidad (UND)");
  await quantity.focus();
  expect(await quantity.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 1]);
  await quantity.fill("7.5");
  await quantity.press("ArrowUp");
  await expect(quantity).toHaveValue("7.5");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("MATERIALS_VERSION_CONFLICT");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(quantity).toHaveValue("7.5");
  await expect(page.getByRole("button", { name: "Confirmar", exact: true })).toBeEnabled();
});

test("la disponibilidad excluye áreas bloqueadas y conserva visible toda la existencia física", async ({ page }) => {
  await session(page, ["inventory:catalog:view", "inventory:stock:view"]);
  const base = { description: null, family: "CAJAS", subfamily: null, baseUnit: { unitRef: membershipRef, code: "UND", name: "Unidad" }, status: "ACTIVE", version: 1, minimumStock: null, reorderPoint: 2, currentCost: null };
  const items = [
    { ...base, materialRef: "148f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", code: "RETENIDO", name: "Material en área bloqueada", inventory: { physical: 12, reserved: 2, assigned: 0, available: 10, dispatchable: 0, blockedAvailable: 10, blockedPhysical: 12, byWarehouse: [] } },
    { ...base, materialRef: "248f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", code: "LIBRE", name: "Material despachable", inventory: { physical: 7, reserved: 0, assigned: 0, available: 7, dispatchable: 7, blockedAvailable: 0, blockedPhysical: 0, byWarehouse: [] } },
  ];
  await page.route("**/api/materials/catalog", (route) => route.fulfill({ json: { ok: true, data: { page: 1, pageSize: 25, total: items.length, items } } }));
  await page.route("**/api/materials/warehouses", (route) => route.fulfill({ json: { ok: true, data: [] } }));
  await page.goto("/warehouses/materials");
  const blocked = page.getByRole("row").filter({ hasText: "RETENIDO" });
  await expect(blocked.getByRole("cell").nth(3)).toHaveText("12");
  await expect(blocked.getByRole("cell").nth(6)).toHaveText("0");
  await expect(blocked.getByRole("cell").nth(7)).toHaveText("10");
  await expect(page.getByText(/sigue incluida en la existencia física/)).toBeVisible();
  await page.getByLabel("Filtrar por disponibilidad").selectOption("AVAILABLE");
  await expect(blocked).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "LIBRE" })).toBeVisible();
  await page.getByLabel("Filtrar por disponibilidad").selectOption("OUT");
  await expect(blocked).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "LIBRE" })).toHaveCount(0);
  await page.getByLabel("Filtrar por disponibilidad").selectOption("BLOCKED");
  await blocked.click();
  await expect(page.getByText("Bloqueado por almacén", { exact: true })).toBeVisible();
  await expect(page.getByText(/contienen 12 UND de existencia física/)).toBeVisible();
});
