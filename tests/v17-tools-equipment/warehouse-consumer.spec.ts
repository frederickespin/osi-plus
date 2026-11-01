import { expect, test, type Page, type Route } from "@playwright/test";

const membershipRef = "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
async function session(page: Page, permissions: string[], deniedPermissions: string[] = []) {
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.assets.reader");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Lector sintético", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] }));
  }, { membershipRef });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ok: true, user: { name: "Lector sintético", role: "A", status: "ACTIVE", permissions, deniedPermissions, membership: { membershipRef, tenantName: "Tenant sintético", role: "A" }, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] } } }));
}
function empty(path: string) { return path.endsWith("/instances") ? { page: 1, pageSize: 25, total: 0, items: [] } : []; }

test("lector de instancias no consulta modelos ni ofertas sin permiso", async ({ page }) => {
  await session(page, ["assets:instance:view", "assets:model:view"], ["assets:model:view"]);
  const reads: string[] = [];
  await page.route("**/api/assets/**", (route) => {
    const path = new URL(route.request().url()).pathname; reads.push(path);
    return route.fulfill({ json: { ok: true, data: empty(path) } });
  });
  await page.goto("/assets");
  await expect(page.getByText("No hay activos para estos filtros.")).toBeVisible();
  expect([...new Set(reads)]).toEqual(["/api/assets/instances"]);
  await expect(page.getByRole("button", { name: "Modelos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recursos externos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("modelos y ofertas se cargan al seleccionarlos y descartan errores tardíos", async ({ page }) => {
  await session(page, ["assets:instance:view", "assets:model:view", "assets:external:view"]);
  const reads: string[] = [];
  let pendingModels: Route | undefined;
  await page.route("**/api/assets/**", (route) => {
    const path = new URL(route.request().url()).pathname; reads.push(path);
    if (path.endsWith("/models")) { pendingModels = route; return; }
    return route.fulfill({ json: { ok: true, data: empty(path) } });
  });
  await page.goto("/assets");
  await expect(page.getByText("No hay activos para estos filtros.")).toBeVisible();
  expect([...new Set(reads)]).toEqual(["/api/assets/instances"]);
  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  await expect.poll(() => Boolean(pendingModels)).toBe(true);
  await page.getByRole("button", { name: "Recursos externos", exact: true }).click();
  await expect.poll(() => reads.includes("/api/assets/external/offers")).toBe(true);
  const lateResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/assets/models");
  await pendingModels!.fulfill({ status: 403, json: { ok: false, error: "ASSET_FORBIDDEN" } });
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.getByRole("heading", { name: "Equipos externos y alquileres" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("activos se integra en Almacenes con un solo main y filtros compactos", async ({ page }, testInfo) => {
  await session(page, ["assets:instance:view"]);
  await page.route("**/api/assets/**", (route) => route.fulfill({ json: { ok: true, data: empty(new URL(route.request().url()).pathname) } }));
  await page.goto("/warehouses/equipment");
  await expect(page.getByRole("heading", { name: "Almacenes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Herramientas y Equipos", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Volver al Hub" })).toHaveCount(0);
  const height = await page.getByLabel("Familia", { exact: true }).evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBe(testInfo.project.name.includes("mobile") ? 32 : 28);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
