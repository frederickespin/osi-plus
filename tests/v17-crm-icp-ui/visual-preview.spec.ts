import { expect, test } from "@playwright/test";

test("Preview visual aislado abre el ICP sin autenticación ni llamadas API", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/experience-preview/icp");
  await expect(page.getByTestId("crm-icp-v2-visual-preview")).toBeVisible();
  await expect(page.getByTestId("crm-icp-v2-intake-form")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuevo caso comercial" })).toBeVisible();
  await expect(page.getByText("Volumen pendiente", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/volumen|cbm/i)).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});
