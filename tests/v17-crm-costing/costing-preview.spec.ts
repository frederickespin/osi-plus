import { expect, test } from "@playwright/test";

test("Preview separa Motor Logístico, costos y tres propuestas con aprobación exclusiva", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/experience-preview/costing");
  await expect(page.getByTestId("crm-costing-visual-preview")).toBeVisible();
  const expectedTabs = ["Resumen", "Servicios", "Survey", "Costos", "Gestiones", "Actividad", "Tareas", "Cotización", "Notas", "Archivos", "Comunicación"];
  await expect(page.getByRole("tab")).toHaveCount(expectedTabs.length);
  expect(await page.getByRole("tab").allTextContents()).toEqual(expectedTabs);
  await expect(page.getByTestId("costing-case-panel")).toBeVisible();
  await expect(page.getByText("Survey publicado", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("cost-lines-table").getByText("Costo interno", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cost-lines-table").getByText("Precio sugerido", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Cajas de madera 2 conceptos/ }).click();
  await expect(page.getByText("Guacales fabricados en taller", { exact: true })).toBeVisible();
  await expect(page.getByText("Tratamiento y certificado ISPM 15", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Fletes 1 conceptos/ }).click();
  await expect(page.getByText("Flete marítimo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Aduanas 2 conceptos/ }).click();
  await expect(page.getByText("Servicios aduanales", { exact: true })).toBeVisible();

  const initialSummary = await page.getByTestId("cost-summary").textContent();
  await page.getByRole("button", { name: "Excluir Guacales fabricados en taller" }).click();
  const adjustedSummary = await page.getByTestId("cost-summary").textContent();
  expect(adjustedSummary).not.toEqual(initialSummary);
  await page.getByRole("button", { name: "Incluir Guacales fabricados en taller" }).click();

  await page.getByRole("button", { name: "Ocultar costos internos" }).click();
  await expect(page.getByRole("button", { name: "Mostrar costos internos" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir Motor Logístico en Administración" }).click();
  await expect(page.getByTestId("admin-logistic-engine-preview")).toBeVisible();
  await expect(page.getByText("Reglas automáticas de desplazamiento", { exact: true })).toBeVisible();
  await expect(page.getByText("Base → origen → base", { exact: true })).toBeVisible();
  await expect(page.getByText("Hospedaje", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver a la Ficha del Caso" }).click();
  await expect(page.getByTestId("costing-case-panel")).toBeVisible();

  await page.getByRole("button", { name: "Enviar escenario a Cotización" }).click();
  await expect(page.getByRole("status")).toContainText("Snapshot preparado para Cotización");

  await page.getByRole("tab", { name: "Cotización", exact: true }).click();
  const quote = page.getByTestId("quote-proposal-panel");
  await expect(quote).toBeVisible();
  await expect(quote.getByTestId("proposal-selector").getByRole("button")).toHaveCount(3);
  await expect(quote.getByRole("button", { name: "Límite de 3 propuestas alcanzado" })).toBeDisabled();
  await expect(quote.getByText("Esencial", { exact: true })).toBeVisible();
  await expect(quote.getByText("Recomendada", { exact: true })).toBeVisible();
  await expect(quote.getByText("Integral", { exact: true })).toBeVisible();
  await expect(quote.getByTestId("commercial-context")).toContainText("Sirva");
  await expect(quote.getByTestId("commercial-context")).toContainText("SIRVA-INT-2026");
  await expect(quote.getByTestId("exchange-control")).toContainText("USD fijada");
  await expect(quote.getByText("Compensación por variación cambiaria", { exact: true })).toBeVisible();
  await expect(quote.getByText("Pr: propio · Ex: externo · De: desembolso.", { exact: false })).toBeVisible();

  await quote.getByRole("button", { name: "Agregar concepto adicional" }).click();
  await expect(quote.getByTestId("additional-concept-form")).toBeVisible();
  await quote.getByRole("textbox", { name: "Concepto adicional" }).fill("Seguro especial solicitado");
  await quote.getByRole("spinbutton", { name: "Costo adicional" }).fill("1000");
  await quote.getByRole("spinbutton", { name: "Precio adicional" }).fill("1500");
  await quote.getByRole("button", { name: "Guardar concepto adicional" }).click();
  await expect(quote.getByText("Seguro especial solicitado", { exact: true })).toBeVisible();
  await expect(quote.getByText("Cotización bloqueada: 1 pendiente.", { exact: true })).toBeVisible();
  await quote.getByRole("button", { name: "Resolver pendiente Seguro especial solicitado" }).click();
  await expect(quote.getByText("Lista para aprobación.", { exact: true })).toBeVisible();

  const initialCompensation = await quote.getByTestId("quote-summary").textContent();
  await quote.getByRole("spinbutton", { name: "Tasa USD vigente" }).fill("64.70");
  const changedCompensation = await quote.getByTestId("quote-summary").textContent();
  expect(changedCompensation).not.toEqual(initialCompensation);

  const localMovePrice = quote.getByRole("spinbutton", { name: "Precio cotizado de Servicio local de mudanza" });
  await localMovePrice.fill("50000");
  await expect(quote.getByText("Margen bloqueado.", { exact: true })).toBeVisible();
  await expect(quote.getByRole("button", { name: "Registrar aprobación del cliente para Recomendada" })).toBeDisabled();
  await localMovePrice.fill("92000");
  await expect(quote.getByText("Lista para aprobación.", { exact: true })).toBeVisible();
  await quote.getByRole("button", { name: "Registrar aprobación del cliente para Recomendada" }).click();
  await expect(quote.getByRole("button", { name: "Recomendada aprobada por el cliente" })).toBeDisabled();
  await expect(quote.getByText("Aprobada", { exact: true })).toHaveCount(1);

  await quote.getByRole("button", { name: /Propuesta 3/ }).click();
  await expect(quote.getByText("Cotización bloqueada: 1 pendiente.", { exact: true })).toBeVisible();
  await expect(quote.getByRole("button", { name: "Registrar aprobación del cliente para Integral" })).toBeDisabled();
  await quote.getByRole("button", { name: "Resolver pendiente Permiso de tránsito en zona restringida" }).click();
  await expect(quote.getByText("Lista para aprobación.", { exact: true })).toBeVisible();
  await quote.getByRole("button", { name: "Registrar aprobación del cliente para Integral" }).click();
  await expect(quote.getByRole("button", { name: "Integral aprobada por el cliente" })).toBeDisabled();
  await expect(quote.getByText("Aprobada", { exact: true })).toHaveCount(1);
  await expect(quote.getByRole("status")).toContainText("Integral es la única propuesta aprobada");

  await page.getByRole("tab", { name: "Gestiones", exact: true }).click();
  await expect(page.getByTestId("case-management-panel")).toBeVisible();
  await expect(page.getByTestId("permits-management")).toContainText("el bloqueo fue liberado");
  await page.getByRole("tab", { name: "Terceros", exact: true }).click();
  await expect(page.getByTestId("third-party-management")).toContainText("Grúas del Caribe");
  await expect(page.getByTestId("third-party-management")).toContainText("GC-842");

  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole("tab", { name: "Cotización", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(apiRequests).toEqual([]);
});
