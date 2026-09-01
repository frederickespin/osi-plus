import { expect, test } from "@playwright/test";

test("Preview visual aislado recorre ICP, Servicios y Survey sin autenticación ni llamadas API", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/experience-preview/icp");
  await expect(page.getByTestId("crm-icp-v2-visual-preview")).toBeVisible();
  const dialog = page.getByTestId("crm-icp-v2-preview-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuevo Caso (ICP mínimo)" })).toBeVisible();
  await expect(page.getByLabel(/volumen|cbm/i)).toHaveCount(0);
  await expect(page.getByText(/rnc|cédula/i)).toHaveCount(0);
  await expect(dialog.getByLabel("Servicio principal *")).toHaveCount(0);
  await expect(dialog.getByText(/survey|paradas/i)).toHaveCount(0);
  await page.getByRole("tab", { name: /Paso 2/ }).click();
  await expect(dialog.getByLabel("Notas del requerimiento")).toBeVisible();
  await expect(dialog.getByText(/survey|paradas/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Crear caso" }).click();
  await expect(page.getByTestId("crm-icp-v2-preview-case")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Servicios" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Survey" })).toBeVisible();
  await expect(page.getByLabel("Servicio principal *")).toBeVisible();
  await expect(page.getByLabel("Alcance *")).toBeVisible();
  await expect(page.getByLabel("Servicios complementarios")).toBeVisible();
  await page.getByRole("tab", { name: "Survey" }).click();
  await expect(page.getByRole("heading", { name: "Survey del caso" })).toBeVisible();
  for (const method of ["Presencial", "Virtual", "Mini Survey", "Información del cliente"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${method}`) })).toBeVisible();
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole("tab", { name: "Servicios" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Survey" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(apiRequests).toEqual([]);
});
