import { expect, test, type Page } from "@playwright/test";

const CONSOLIDATED_ORIGIN = "https://osi-plus-erp-v17-git-feature-bb4db4-frederick-espinals-projects.vercel.app";
const SURVEY_URL = "https://osi-plus-erp-v17-git-feature-642495-frederick-espinals-projects.vercel.app/mobile/survey";

async function expectExternalLaunch(page: Page, buttonName: RegExp, expectedUrl: string) {
  const popupPromise = page.waitForEvent("popup");
  await page.locator("main").getByRole("button", { name: buttonName }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  expect(popup.url()).toBe(expectedUrl);
  await popup.close();
  await expect(page).toHaveURL(/\/experience-preview\/tools$/);
}

test("Hub Preview abre los módulos funcionales acordados y conserva el Hub", async ({ page }) => {
  await page.context().route(`${CONSOLIDATED_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Destino consolidado</title>" }));
  await page.context().route("https://osi-plus-erp-v17-git-feature-642495-frederick-espinals-projects.vercel.app/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>OSi Survey</title>" }));
  await page.goto("/experience-preview/tools");
  await expect(page.getByRole("heading", { name: "Hola, FREDERICK ESPINAL" })).toBeVisible();

  await page.locator("main").getByRole("button", { name: /Comercial y CRM/ }).click();
  await expect(page.getByTestId("recovered-commercial-preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inbox Comercial" })).toBeVisible();
  await expect(page.getByText("103 casos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hub", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hola, FREDERICK ESPINAL" })).toBeVisible();
  await expectExternalLaunch(page, /Almacenes/, `${CONSOLIDATED_ORIGIN}/warehouses`);
  await expectExternalLaunch(page, /Administración/, `${CONSOLIDATED_ORIGIN}/administration`);

  await page.locator("main").getByRole("button", { name: /OSi Plus Mobile/ }).click();
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();
  await expect(page.getByRole("button", { name: /OSi Survey/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Inventario Visual/ })).toBeVisible();
  await expect(page.getByText(/Calculadora/, { exact: false })).toHaveCount(0);
  await expectExternalLaunch(page, /OSi Survey/, SURVEY_URL);

  await page.getByRole("button", { name: /Inventario Visual/ }).click();
  await expect(page.getByTestId("visual-inventory-app")).toBeVisible();
  await expect(page.getByTestId("visual-inventory-frame")).toBeVisible();
  await expect(page.frameLocator('[data-testid="visual-inventory-frame"]').getByText("Inventario Visual", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "OSi Plus Mobile", exact: true }).click();
  await expect(page.getByTestId("osi-plus-mobile-hub")).toBeVisible();

  await page.getByRole("button", { name: "Volver al Hub", exact: true }).click();
  await page.locator("main").getByRole("button", { name: /Herramientas/ }).click();
  await expect(page.getByRole("button", { name: /Calculadora de empaque arqueológico/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Calculadora de empaque y cajas de madera/ })).toBeVisible();
});
