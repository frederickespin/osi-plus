import { expect, test } from "@playwright/test";

test("Survey concentra captura móvil, trazabilidad y salida sin precios", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/experience-preview/survey");
  await expect(page.getByTestId("crm-survey-visual-preview")).toBeVisible();
  const expectedTabs = ["Asignación", "Facilidades", "Artículos", "Empaque", "Evidencias", "Resumen"];
  await expect(page.getByRole("tab")).toHaveCount(expectedTabs.length);
  expect(await page.getByRole("tab").allTextContents()).toEqual(expectedTabs);

  await expect(page.getByTestId("survey-articles")).toContainText("Sofá de 3 plazas");
  await expect(page.getByTestId("survey-articles")).toContainText("Cuadro enmarcado");
  await page.getByRole("button", { name: "Agregar lámpara del catálogo" }).click();
  await expect(page.getByTestId("survey-articles")).toContainText("Lámpara de pie");

  await page.getByRole("tab", { name: "Asignación" }).click();
  await expect(page.getByTestId("survey-assignment")).toContainText("Sólo puede consultar y capturar el servicio asignado");
  await expect(page.getByTestId("survey-assignment")).toContainText("El ICP no lo calcula");

  await page.getByRole("tab", { name: "Facilidades" }).click();
  await expect(page.getByTestId("survey-access")).toContainText("Permiso de estacionamiento");
  await expect(page.getByTestId("survey-access")).toContainText("Motor Logístico");

  await page.getByRole("tab", { name: "Empaque" }).click();
  await expect(page.getByTestId("survey-packing")).toContainText("Receta v3");
  await expect(page.getByTestId("survey-packing")).toContainText("Candidato a nesting");
  await expect(page.getByTestId("survey-packing")).toContainText("Inventario confirma existencia y costo");

  await page.getByRole("tab", { name: "Evidencias" }).click();
  await page.getByRole("button", { name: "Foto" }).click();
  await expect(page.getByRole("status")).toContainText("Foto vinculada al origen");
  await page.getByRole("button", { name: /Firma del cliente visitado/ }).click();
  await expect(page.getByRole("button", { name: /Firma del cliente visitado/ })).toContainText("Confirma la información levantada, no precios");

  await page.getByRole("tab", { name: "Resumen" }).click();
  const summary = page.getByTestId("survey-summary");
  await expect(summary).toContainText("Marítimo");
  await expect(summary).toContainText("Aéreo");
  await expect(summary).toContainText("Almacenaje");
  await expect(summary).toContainText("Peso real: pendiente");
  await expect(summary).toContainText("Peso cobrable: Cotización");
  await expect(summary.getByRole("button", { name: "Publicar resultado de Survey" })).toBeVisible();

  if (process.env.SURVEY_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.SURVEY_SCREENSHOT_PATH, fullPage: true });
  }

  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole("tab", { name: "Resumen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  if (process.env.SURVEY_MOBILE_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.SURVEY_MOBILE_SCREENSHOT_PATH, fullPage: true });
  }
  expect(apiRequests).toEqual([]);
});
