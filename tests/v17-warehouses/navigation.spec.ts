import { expect, test } from "@playwright/test";
import { nonAuth, selectSection, session } from "./fixtures";

const ALL_READERS = ["inventory:stock:view", "inventory:catalog:view", "assets:instance:view"];

test("stock reader enters spaces without loading material or equipment consumers", async ({ page }) => {
  const seen = await session(page, ["inventory:stock:view"]);
  await page.goto("/warehouses");
  await expect(page.getByRole("heading", { name: "Almacenes", exact: true })).toBeVisible();
  await expect(page.getByTestId("warehouse-spaces")).toBeVisible();
  await expect(page.getByText("Todavía no hay almacenes registrados.", { exact: true })).toBeVisible();
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/materials/warehouses"]));
  expect(seen.resources.some((path) => /(?:MaterialsInventoryApp|ToolsEquipmentApp)\.tsx$/.test(path))).toBe(false);
  await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toHaveCount(0);
  await expect(page.locator('a[href="/warehouses/materials"], option[value="/warehouses/materials"]')).toHaveCount(0);
  await expect(page.locator('a[href="/warehouses/equipment"], option[value="/warehouses/equipment"]')).toHaveCount(0);
  expect(seen.unexpected).toEqual([]);
});

test("equipment reader enters its authorized section without model or external requests", async ({ page }) => {
  const seen = await session(page, ["assets:instance:view"]);
  await page.goto("/warehouses");
  await expect(page.getByRole("heading", { name: "Almacenes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Herramientas y Equipos", exact: true })).toBeVisible();
  await expect(page.getByText("No hay activos para estos filtros.", { exact: true })).toBeVisible();
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/assets/instances"]));
  expect(seen.resources.some((path) => /(?:WarehouseSpaces|MaterialsInventoryApp)\.tsx$/.test(path))).toBe(false);
  await expect(page.getByRole("button", { name: "Modelos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recursos externos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveCount(1);
  expect(seen.unexpected).toEqual([]);
});

test("material reader loads only catalog dependencies in its selected section", async ({ page }) => {
  const seen = await session(page, ["inventory:stock:view", "inventory:catalog:view"]);
  await page.goto("/warehouses/materials");
  await expect(page.getByRole("heading", { name: "Materiales e Inventario", exact: true })).toBeVisible();
  await expect(page.getByText("No hay materiales para estos filtros.", { exact: true })).toBeVisible();
  expect(new Set(nonAuth(seen.apiRequests))).toEqual(new Set(["/api/materials/catalog", "/api/materials/warehouses"]));
  await expect(page.getByRole("button", { name: "Reservas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recetas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Necesidades Survey", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveCount(1);
  expect(seen.resources.some((path) => /(?:WarehouseSpaces|ToolsEquipmentApp)\.tsx$/.test(path))).toBe(false);
  expect(seen.unexpected).toEqual([]);
});

for (const [path, denied] of [
  ["/warehouses/spaces", "inventory:stock:view"],
  ["/warehouses/materials", "inventory:catalog:view"],
  ["/warehouses/equipment", "assets:instance:view"],
] as const) {
  test(`denied ${path} stops before lazy consumers and business requests`, async ({ page }) => {
    const seen = await session(page, ALL_READERS, [denied]);
    await page.goto(path);
    await expect(page.getByTestId("hub-forbidden")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No puedes abrir esta aplicación", exact: true })).toBeVisible();
    expect(nonAuth(seen.apiRequests)).toEqual([]);
    expect(seen.resources.some((resource) => /(?:HubWorkspace|WarehouseWorkspace|WarehouseSpaces|MaterialsInventoryApp|ToolsEquipmentApp)\.tsx$/.test(resource))).toBe(false);
    expect(seen.unexpected).toEqual([]);
  });
}

test("one Almacenes launcher keeps sections, history and mobile navigation consistent", async ({ page }, testInfo) => {
  const seen = await session(page, ALL_READERS);
  await page.goto("/hub");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: /Abrir Almacenes/ })).toHaveCount(1);
  await expect(main.getByRole("button", { name: /Abrir Inventario|Abrir Activos/ })).toHaveCount(0);
  await main.getByRole("button", { name: /Abrir Almacenes/ }).click();
  await expect(page.getByTestId("warehouse-spaces")).toBeVisible();
  await expect(page.getByText("Todavía no hay almacenes registrados.", { exact: true })).toBeVisible();
  expect(nonAuth(seen.apiRequests)).not.toContain("/api/assets/instances");
  expect(nonAuth(seen.apiRequests)).not.toContain("/api/materials/catalog");

  await selectSection(page, "/warehouses/materials");
  await expect(page).toHaveURL(/\/warehouses\/materials$/);
  await expect(page.getByRole("heading", { name: "Materiales e Inventario", exact: true })).toBeVisible();
  await expect(page.getByTestId("warehouse-spaces")).toHaveCount(0);
  expect(nonAuth(seen.apiRequests)).not.toContain("/api/assets/instances");

  await page.goBack();
  await expect(page).toHaveURL(/\/warehouses$/);
  await expect(page.getByTestId("warehouse-spaces")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/warehouses\/materials$/);
  await expect(page.getByRole("heading", { name: "Materiales e Inventario", exact: true })).toBeVisible();

  await selectSection(page, "/warehouses/equipment");
  await expect(page).toHaveURL(/\/warehouses\/equipment$/);
  await expect(page.getByRole("heading", { name: "Herramientas y Equipos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Materiales e Inventario", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Herramientas y Equipos", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.getByLabel("Sección de Almacenes", { exact: true })).toHaveValue("/warehouses/equipment");
    expect(await page.getByLabel("Sección de Almacenes", { exact: true }).evaluate((element) => element.getBoundingClientRect().height)).toBe(32);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.getByRole("link", { name: "Volver al Hub", exact: true }).click();
  await expect(page.getByRole("main").getByRole("button", { name: /Abrir Almacenes/ })).toBeVisible();
  expect(seen.unexpected).toEqual([]);
});

test("navigation revalidates a revoked section before mounting its consumer", async ({ page }) => {
  const seen = await session(page, ALL_READERS);
  await page.goto("/warehouses/spaces");
  await expect(page.getByText("Todavía no hay almacenes registrados.", { exact: true })).toBeVisible();
  seen.updateAuthorization(ALL_READERS, ["inventory:stock:view"]);
  await selectSection(page, "/warehouses/materials");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  await expect(page).toHaveURL(/\/warehouses\/spaces$/);
  expect(nonAuth(seen.apiRequests)).not.toContain("/api/materials/catalog");
  expect(seen.resources.some((path) => /MaterialsInventoryApp\.tsx$/.test(path))).toBe(false);
  expect(seen.unexpected).toEqual([]);
});
