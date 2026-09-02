import { expect, test } from "@playwright/test";

test("Survey recupera agenda, visita técnica y confirmación puntual sin seleccionar materiales", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/experience-preview/survey");
  await expect(page.getByTestId("crm-survey-visual-preview")).toBeVisible();
  const expectedTabs = ["Agenda", "Inventario", "Accesos", "Evidencias", "Revisión", "Detalle técnico"];
  await expect(page.getByRole("tab")).toHaveCount(expectedTabs.length);
  expect(await page.getByRole("tab").allTextContents()).toEqual(expectedTabs);
  await expect(page.getByRole("tab", { name: "Empaque" })).toHaveCount(0);

  const agenda = page.getByTestId("survey-agenda");
  const visitList = page.getByTestId("visit-list");
  await expect(agenda).toContainText("15 visitas asignadas");
  await expect(visitList.getByRole("button")).toHaveCount(15);
  const nearestVisit = visitList.locator('button[aria-current="true"]');
  await expect(nearestVisit).toContainText("5:30 p. m.");
  await expect(nearestVisit).toContainText("Ana María Gómez");
  await expect(nearestVisit).toContainText("Más próxima");
  await expect(visitList).toContainText("Salida anticipada");

  await agenda.getByRole("button", { name: "Distantes" }).click();
  await expect(visitList.getByRole("button")).toHaveCount(6);
  await agenda.getByRole("button", { name: "Todas" }).click();

  if (process.env.SURVEY_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.SURVEY_SCREENSHOT_PATH, fullPage: true });
  }

  await nearestVisit.click();
  await expect(page.getByTestId("survey-inventory")).toBeVisible();
  const arrival = page.getByTestId("arrival-control");
  await arrival.getByRole("button", { name: "Registrar llegada" }).click();
  await expect(arrival.getByRole("status")).toContainText("Llegada registrada dentro de la tolerancia");
  await arrival.getByRole("button", { name: "Cliente confirma llegada" }).click();
  await expect(arrival.getByRole("status")).toContainText("Puntual · confirmado por cliente");

  await expect(page.getByTestId("survey-inventory")).toContainText("Sofá de 3 plazas");
  await page.getByRole("button", { name: "Agregar lámpara del catálogo" }).click();
  await expect(page.getByTestId("survey-inventory")).toContainText("Lámpara de pie");
  await expect(page.getByTestId("survey-inventory")).toContainText("No selecciona materiales de empaque");

  await page.getByRole("tab", { name: "Accesos" }).click();
  await expect(page.getByTestId("survey-access")).toContainText("Long carrying");
  await expect(page.getByTestId("survey-access")).toContainText("Motor Logístico");

  await page.getByRole("tab", { name: "Evidencias" }).click();
  await page.getByRole("button", { name: "Foto" }).click();
  await expect(page.getByTestId("survey-evidence").getByRole("status")).toContainText("Foto vinculada al origen");
  await page.getByRole("button", { name: /Firma del cliente visitado/ }).click();
  await expect(page.getByRole("button", { name: /Firma del cliente visitado/ })).toContainText("Confirma la información levantada, no precios");

  await page.getByRole("tab", { name: "Revisión" }).click();
  await expect(page.getByTestId("survey-review")).toContainText("Volumen y peso por área");
  await expect(page.getByTestId("survey-review")).toContainText("Resumen operativo");

  await page.getByRole("tab", { name: "Detalle técnico" }).click();
  const technical = page.getByTestId("survey-technical");
  await expect(technical).toContainText("Cajas de madera / huacales");
  await expect(technical).toContainText("Resultado automático de recetas administrativas · no editable por el evaluador");
  await expect(technical).toContainText("Peso real: pendiente");
  await expect(technical).toContainText("Peso cobrable: Cotización");
  await expect(technical.getByRole("button", { name: "Publicar resultado de Survey" })).toBeVisible();

  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole("tab", { name: "Agenda" }).click();
  await expect(page.getByTestId("visit-list").getByRole("button")).toHaveCount(15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  if (process.env.SURVEY_MOBILE_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.SURVEY_MOBILE_SCREENSHOT_PATH, fullPage: true });
  }
  expect(apiRequests).toEqual([]);
});
