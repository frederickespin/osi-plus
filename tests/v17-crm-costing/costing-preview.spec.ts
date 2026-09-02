import { expect, test } from "@playwright/test";

test("Preview de Costos separa Survey, recursos, costo interno, precio y margen", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/experience-preview/costing");
  await expect(page.getByTestId("crm-costing-visual-preview")).toBeVisible();
  const expectedTabs = ["Resumen", "Servicios", "Survey", "Costos", "Actividad", "Tareas", "Cotización", "Notas", "Archivos", "Comunicación"];
  await expect(page.getByRole("tab")).toHaveCount(expectedTabs.length);
  expect(await page.getByRole("tab").allTextContents()).toEqual(expectedTabs);
  await expect(page.getByTestId("costing-case-panel")).toBeVisible();
  await expect(page.getByText("Survey publicado", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("cost-lines-table").getByText("Costo interno", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cost-lines-table").getByText("Precio sugerido", { exact: true })).toBeVisible();
  await expect(page.getByText("Guacales a medida", { exact: true })).toBeVisible();
  await expect(page.getByText("Fumigación de guacales", { exact: true })).toBeVisible();

  const initialSummary = await page.getByTestId("cost-summary").textContent();
  await page.getByRole("button", { name: "Excluir Guacales a medida" }).click();
  const adjustedSummary = await page.getByTestId("cost-summary").textContent();
  expect(adjustedSummary).not.toEqual(initialSummary);
  await page.getByRole("button", { name: "Incluir Guacales a medida" }).click();

  await page.getByRole("button", { name: "Ocultar costos internos" }).click();
  await expect(page.getByRole("button", { name: "Mostrar costos internos" })).toBeVisible();
  await page.getByRole("button", { name: "Configurar catálogos de costos" }).click();
  const catalog = page.getByTestId("cost-catalog-dialog");
  await expect(catalog.getByText("Catálogos y reglas", { exact: true })).toBeVisible();
  await expect(catalog.getByText("Versión activa 4", { exact: false })).toBeVisible();
  await catalog.getByRole("tab", { name: "Transporte" }).click();
  await expect(catalog.getByText("Camión cerrado 24 pies", { exact: true })).toBeVisible();
  await catalog.getByRole("button", { name: "Desactivar Camión cerrado 24 pies" }).click();
  await expect(catalog.getByRole("button", { name: "Activar Camión cerrado 24 pies" })).toBeVisible();
  await catalog.getByRole("button", { name: "Cerrar catálogos de costos" }).click();

  await page.getByRole("button", { name: "Enviar escenario a Cotización" }).click();
  await expect(page.getByRole("status")).toContainText("Snapshot preparado para Cotización");
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole("tab", { name: "Costos", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(apiRequests).toEqual([]);
});
