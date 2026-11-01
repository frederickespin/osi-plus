import { expect, test } from "@playwright/test";
import { normalizeWarehouseLocationConfiguration } from "../../api/_lib/warehouseConfigurationContract.js";
import { BIN_REF, CONFIG_REF, MANAGER, ROOT_REF, USE, USE_REF, ZONE_REF, configuration, configurationSession, emptyConfiguration, fulfill } from "./fixtures";

test("a recovered location assignment can select another use after a confirmed inactive-use rejection", async ({ page }) => {
  const nextUse = { ...USE, useRef: "89999999-9999-4999-8999-999999999999", code: "USO-0002", name: "Uso activo alternativo" };
  const fixture = await configurationSession(page, MANAGER, { ...emptyConfiguration(), areaUses: [USE, nextUse] });
  const commands: Record<string, unknown>[] = [];
  await page.route(`**/api/materials/warehouses/locations/${ZONE_REF}/configuration`, async (route) => {
    const raw = route.request().postDataJSON(); commands.push(raw);
    const input = normalizeWarehouseLocationConfiguration(raw, ZONE_REF);
    if (commands.length === 1) {
      fixture.setConfiguration({ ...fixture.getConfiguration(), areaUses: [{ ...USE, status: "INACTIVE" }, nextUse] });
      return route.abort("failed");
    }
    if (commands.length === 2) return fulfill(route, "WAREHOUSE_AREA_USE_INACTIVE", 409);
    const saved = configuration(ZONE_REF, { version: 1, configRef: CONFIG_REF, areaUseRef: input.areaUseRef, notes: input.notes });
    fixture.setConfiguration({ ...fixture.getConfiguration(), locations: [configuration(ROOT_REF), saved, configuration(BIN_REF)] });
    return fulfill(route, saved);
  });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Configurar Zona sintética", exact: true }).click();
  await page.getByLabel("Uso del área", { exact: true }).selectOption(USE_REF);
  await page.getByLabel("Notas", { exact: true }).fill("Nota conservada");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await page.reload();
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ese uso está inactivo");
  await expect(page.getByLabel("Uso del área", { exact: true })).toBeEnabled();
  await page.getByLabel("Uso del área", { exact: true }).selectOption(nextUse.useRef);
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByTestId("warehouse-space-row").filter({ hasText: "Zona sintética" })).toContainText(nextUse.name);
  expect(commands).toHaveLength(3); expect(commands[1]).toEqual(commands[0]);
  expect(commands[2]).toMatchObject({ areaUseRef: nextUse.useRef, expectedVersion: 0, notes: "Nota conservada" });
  expect(commands[2].requestId).not.toBe(commands[0].requestId); expect(commands[2].payloadHash).not.toBe(commands[0].payloadHash);
  expect(fixture.unexpected).toEqual([]);
});
