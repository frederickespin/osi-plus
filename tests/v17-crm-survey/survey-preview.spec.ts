import { expect, test } from "@playwright/test";

test("Survey integra agenda, inventario rápido, medidas duales y accesos históricos", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/experience-preview/survey");
  await expect(page.getByTestId("crm-survey-visual-preview")).toBeVisible();
  const expectedTabs = ["Agenda", "Inventario", "Accesos", "Revisión", "Detalle técnico", "Firma"];
  await expect(page.getByRole("tab")).toHaveCount(expectedTabs.length);
  expect(await page.getByRole("tab").allTextContents()).toEqual(expectedTabs);
  await expect(page.getByRole("tab", { name: "Empaque" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Evidencias" })).toHaveCount(0);

  const agenda = page.getByTestId("survey-agenda");
  const visitList = page.getByTestId("visit-list");
  await expect(agenda).toContainText("15 visitas asignadas");
  await expect(visitList.getByRole("button")).toHaveCount(15);
  const nearestVisit = visitList.locator('button[aria-current="true"]');
  await expect(nearestVisit).toContainText("5:30 p. m.");
  await expect(nearestVisit).toContainText("Ana María Gómez");
  await expect(nearestVisit).toContainText("Más próxima");
  await expect(visitList).toContainText("Salida anticipada");
  const visitContext = page.getByTestId("visit-context");
  await expect(visitContext).toContainText("Próxima visita");
  await expect(visitContext).toContainText("Coca-Cola");
  await expect(visitContext).toContainText("María López · SIRVA");
  await expect(visitContext).toContainText("Santo Domingo · Piantini");
  await expect(visitContext).toContainText("Av. Abraham Lincoln núm. 456");
  await expect(visitContext).toContainText("Madrid · Salamanca");
  await expect(visitContext).toContainText("Llamar 15 minutos antes");

  await visitList.getByRole("button", { name: /Carlos Mena/ }).click();
  await expect(visitContext).toContainText("Carlos Mena");
  await expect(visitContext).toContainText("Boca Chica");
  await expect(visitContext).toContainText("Calle Duarte núm. 18");
  await expect(visitContext).toContainText("Confirmar por WhatsApp antes de salir");
  await nearestVisit.click();

  await agenda.getByRole("button", { name: "Distantes" }).click();
  await expect(visitList.getByRole("button")).toHaveCount(6);
  await agenda.getByRole("button", { name: "Todas" }).click();

  if (process.env.SURVEY_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.SURVEY_SCREENSHOT_PATH, fullPage: true });
  }

  const arrival = page.getByTestId("arrival-control");
  await expect(visitContext.getByRole("button", { name: "Registrar llegada" })).toBeVisible();
  await arrival.getByRole("button", { name: "Registrar llegada" }).click();
  await expect(arrival.getByRole("status")).toContainText("Llegada registrada dentro de la tolerancia");
  await arrival.getByRole("button", { name: "Cliente confirma llegada" }).click();
  await expect(arrival.getByRole("status")).toContainText("Puntual · confirmado");
  await arrival.getByRole("button", { name: "Iniciar Survey" }).click();

  const inventory = page.getByTestId("survey-inventory");
  await expect(inventory).toBeVisible();
  await expect(page.getByTestId("arrival-control")).toHaveCount(0);
  await expect(inventory.getByLabel("Área o habitación")).toHaveValue("Sala");
  await expect(inventory.getByLabel("Modo de traslado")).toHaveValue("Marítimo");
  await expect(inventory).toContainText("Sala · 2 renglones · 4 piezas");
  const quantity = inventory.getByRole("textbox", { name: "Cantidad", exact: true });
  await expect(quantity).toHaveValue("1");
  await inventory.getByRole("button", { name: "Aumentar cantidad" }).click();
  await expect(quantity).toHaveValue("2");
  await inventory.getByRole("button", { name: "Disminuir cantidad" }).click();

  await inventory.getByLabel("Buscar artículo del catálogo").fill("sof");
  await expect(page.getByTestId("article-suggestions")).toContainText("Sofá de 3 plazas");
  await page.getByTestId("article-suggestions").getByRole("button", { name: /Sofá de 3 plazas/ }).click();
  await inventory.getByLabel("Condición del artículo").selectOption("Averiado");
  await expect(inventory.getByRole("alert")).toContainText("requiere una fotografía");
  await expect(inventory.getByRole("button", { name: "Próximo" })).toBeDisabled();
  const cameraInput = inventory.getByTestId("article-camera-input");
  await expect(cameraInput).toHaveAttribute("accept", "image/*");
  await expect(cameraInput).toHaveAttribute("capture", "environment");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await inventory.getByRole("button", { name: "Activar cámara para el artículo" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: "sofa-averiado.jpg", mimeType: "image/jpeg", buffer: Buffer.from("survey-photo") });
  await inventory.getByLabel("Caja de madera").check();
  await expect(page.getByTestId("conditional-measurements")).not.toContainText("Medidas activadas");
  await expect(inventory.getByLabel("Largo en centímetros")).toHaveValue("120");
  await expect(page.getByTestId("conditional-measurements")).toContainText("Equiv. 47.2 pulg");
  await inventory.getByRole("button", { name: "Próximo" }).click();
  await expect(inventory.getByLabel("Buscar artículo del catálogo")).toHaveValue("");
  await expect(inventory.getByLabel("Buscar artículo del catálogo")).toBeFocused();
  await expect(inventory.getByRole("button", { name: "Próximo" })).toBeDisabled();
  await expect(inventory.getByRole("button", { name: /Sofá de 3 plazas/ })).toHaveCount(2);
  await expect(inventory.getByLabel("Área o habitación")).toHaveValue("Sala");
  await expect(inventory.getByLabel("Modo de traslado")).toHaveValue("Marítimo");
  await expect(quantity).toHaveValue("1");
  await expect(inventory).toContainText("ft³");
  await expect(inventory).toContainText("no selecciona materiales de empaque");

  await inventory.getByLabel("Área o habitación").selectOption("Comedor");
  await expect(inventory).toContainText("Comedor · 1 renglón · 1 pieza");
  await expect(inventory).toContainText("Mesa de comedor");
  await expect(inventory).not.toContainText("Cuadro enmarcado");
  await inventory.getByRole("button", { name: /Mesa de comedor/ }).click();
  await expect(inventory.getByRole("button", { name: "Actualizar" })).toBeVisible();
  await inventory.getByLabel("Nota opcional del artículo").fill("Revisar desmontaje con el cliente.");
  await inventory.getByRole("button", { name: "Actualizar" }).click();
  await inventory.getByRole("button", { name: /Mesa de comedor/ }).click();
  const arrowBeforeMeasurements = await inventory.getByRole("button", { name: "Artículo anterior" }).boundingBox();
  await inventory.getByRole("button", { name: "Artículo anterior" }).click();
  await expect(inventory.getByRole("button", { name: "Actualizar" })).toBeVisible();
  await expect(inventory.getByLabel("Área o habitación")).toHaveValue("Sala");
  await expect(inventory.getByLabel("Modo de traslado")).toHaveValue("Aéreo");
  await expect(inventory.getByLabel("Buscar artículo del catálogo")).toHaveValue("Cuadro enmarcado");
  await expect(inventory.getByTestId("global-article-position")).toContainText("Artículo 2 / 4");
  await expect(inventory.getByLabel("Nota opcional del artículo")).toHaveValue("Desgaste visible en esquina inferior.");
  const arrowAfterMeasurements = await inventory.getByRole("button", { name: "Artículo anterior" }).boundingBox();
  expect(Math.abs((arrowBeforeMeasurements?.y ?? 0) - (arrowAfterMeasurements?.y ?? 0))).toBeLessThanOrEqual(1);
  await inventory.getByRole("button", { name: "Eliminar artículo" }).click();
  await expect(inventory.getByRole("button", { name: "Confirmar eliminación" })).toBeVisible();
  await inventory.getByRole("button", { name: "Cancelar" }).click();
  await expect(inventory.getByLabel("Caja de madera")).toBeVisible();
  await expect(inventory.getByLabel("Frágil")).toBeVisible();
  await expect(inventory.getByLabel("Valioso")).toBeVisible();
  await expect(inventory.getByLabel("Sobredimensionado")).toBeVisible();

  await inventory.getByRole("button", { name: "Configurar catálogos" }).click();
  await expect(page.getByTestId("catalog-configuration")).toContainText("Áreas configurables");
  await expect(page.getByTestId("catalog-configuration")).toContainText("Receta local");
  await expect(page.getByTestId("catalog-configuration")).toContainText("Receta internacional");
  await expect(page.getByTestId("catalog-configuration")).toContainText("Preferencia de medidas");
  await page.getByTestId("catalog-configuration").getByRole("button", { name: "Pulgadas (pulg)" }).click();
  await expect(inventory.getByLabel("Largo en pulgadas")).toHaveValue("47.2");
  await expect(page.getByTestId("conditional-measurements")).toContainText("Equiv. 120 cm");

  await page.getByRole("tab", { name: "Accesos" }).click();
  const access = page.getByTestId("survey-access");
  await expect(access).toContainText("Acarreo largo");
  const originAccessCamera = access.getByTestId("access-camera-origen");
  const destinationAccessCamera = access.getByTestId("access-camera-destino");
  await expect(originAccessCamera).toHaveAttribute("accept", "image/*");
  await expect(originAccessCamera).toHaveAttribute("capture", "environment");
  await expect(destinationAccessCamera).toHaveAttribute("capture", "environment");
  await originAccessCamera.dispatchEvent("change");
  await expect(access.getByRole("button", { name: "Activar cámara de origen" }).locator("span")).toHaveCount(0);
  const originAccessChooserPromise = page.waitForEvent("filechooser");
  await access.getByRole("button", { name: "Activar cámara de origen" }).click();
  const originAccessChooser = await originAccessChooserPromise;
  await originAccessChooser.setFiles({ name: "acceso-origen.jpg", mimeType: "image/jpeg", buffer: Buffer.from("origin-access") });
  await expect(access.getByRole("button", { name: "Activar cámara de origen" }).locator("span")).toHaveText("1");
  const destinationAccessChooserPromise = page.waitForEvent("filechooser");
  await access.getByRole("button", { name: "Activar cámara de destino" }).click();
  const destinationAccessChooser = await destinationAccessChooserPromise;
  await destinationAccessChooser.setFiles({ name: "acceso-destino.jpg", mimeType: "image/jpeg", buffer: Buffer.from("destination-access") });
  await expect(access.getByRole("button", { name: "Activar cámara de destino" }).locator("span")).toHaveText("1");
  await expect(page.getByTestId("survey-access")).toContainText("No cabe en elevador");
  await expect(page.getByTestId("building-access-catalog")).toContainText("Perfil interno del edificio");
  await expect(page.getByTestId("building-access-catalog")).toContainText("Aprendizaje de zona");
  await expect(page.getByTestId("survey-access")).toContainText("Motor Logístico");

  await page.getByRole("tab", { name: "Revisión" }).click();
  const review = page.getByTestId("survey-review");
  await expect(review).toContainText("Agrupado por área");
  await expect(review).toContainText("Agrupado por modo");
  await review.getByRole("button", { name: /Comedor/ }).click();
  await expect(inventory).toBeVisible();
  await expect(inventory.getByLabel("Área o habitación")).toHaveValue("Comedor");
  await page.getByRole("tab", { name: "Revisión" }).click();
  await review.getByRole("button", { name: /Aéreo/ }).click();
  await expect(inventory.getByLabel("Modo de traslado")).toHaveValue("Aéreo");
  await expect(inventory).toContainText("Aéreo");

  await page.getByRole("tab", { name: "Detalle técnico" }).click();
  const technical = page.getByTestId("survey-technical");
  await expect(technical).toContainText("Artículos · peso y volumen");
  await expect(technical).toContainText("Condiciones especiales agrupadas");
  await expect(technical).toContainText("Resultado automático de recetas administrativas · no editable por el evaluador");
  await expect(technical).toContainText("ft³");
  await expect(technical).toContainText("lb");
  await expect(technical).toContainText("Desgaste visible en esquina inferior");
  await expect(technical.getByRole("button", { name: "Publicar resultado de Survey" })).toBeVisible();

  await page.getByRole("tab", { name: "Firma" }).click();
  const signature = page.getByTestId("survey-signature");
  await expect(signature).toContainText("Reporte para aceptación del cliente");
  await expect(signature).toContainText("No constituye una cotización ni aceptación de precios");
  const specialConditions = signature.getByTestId("signature-special-conditions");
  await expect(specialConditions).toContainText("Huacal");
  await expect(specialConditions).toContainText("Frágil");
  await expect(specialConditions).toContainText("Armar / desarmar");
  await expect(specialConditions).toContainText("Desgaste visible en esquina inferior");
  await expect(specialConditions).toContainText("Revisar desmontaje con el cliente");
  const signButton = signature.getByRole("button", { name: "Firmar reporte" });
  await expect(signButton).toBeDisabled();
  await signature.getByRole("checkbox").check();
  await signButton.click();
  await expect(signature.getByRole("button", { name: /Firmado por el cliente/ })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await signature.getByRole("button", { name: "Generar y entregar copia PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("survey-ana-maria-gomez.pdf");
  if (process.env.SURVEY_PDF_PATH) await download.saveAs(process.env.SURVEY_PDF_PATH);
  await expect(signature.getByRole("status")).toContainText("Cliente firmó y recibió copia PDF");
  await expect(signature.getByRole("status")).toContainText("Registro CRM del preview");

  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole("tab", { name: "Agenda" }).click();
  await expect(page.getByTestId("visit-list").getByRole("button")).toHaveCount(15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("tab", { name: "Inventario" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const conditionBox = await inventory.getByLabel("Condición del artículo").boundingBox();
  const mobileViewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect((conditionBox?.x || 0) + (conditionBox?.width || 0)).toBeLessThanOrEqual(mobileViewportWidth);
  const mobileControlFontSizes = await page.getByTestId("survey-inventory").locator("input, select, textarea").evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...mobileControlFontSizes)).toBeGreaterThanOrEqual(16);
  if (process.env.SURVEY_MOBILE_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.SURVEY_MOBILE_SCREENSHOT_PATH, fullPage: true });
  }
  expect(apiRequests).toEqual([]);
});
