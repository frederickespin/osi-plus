import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { formatWarehouseAddress } from "../../shared/warehouseSheetAddress.js";
import { formatWarehouseDisplayAddress } from "../../shared/warehouseLocalityAddress.js";
import type { WarehouseSheet } from "../../src/warehouses/sheetTypes";
import { SHEET, fulfill, openNewSheet, sheetSession } from "./fixtures";

const locality = (page: Page) => page.getByLabel("Número de localidad", { exact: true });
const identifier = (page: Page, label: string) => page.getByLabel(`Identificador de ${label}`, { exact: true });
const save = (page: Page) => page.getByRole("button", { name: "Guardar hoja", exact: true });
const add = (page: Page) => page.getByRole("button", { name: "Agregar recorrido a la hoja", exact: true });
function configured(number: number, localityNumber: number | null): WarehouseSheet {
  return { ...SHEET, name: `Almacén ${number}`, warehouseNumber: number, localityNumber, warehouseLabel: `ALM-${String(number).padStart(2, "0")}`,
    locations: SHEET.locations.map((location) => {
      const segments = { ...location.address!, warehouseNumber: number };
      return { ...location, address: { ...segments, label: formatWarehouseAddress(segments), displayLabel: formatWarehouseDisplayAddress(localityNumber, segments) } };
    }) };
}
async function openExisting(page: Page, number = 4) {
  await page.goto("/warehouses/spaces"); await page.getByRole("button", { name: `Editar Almacén ${number}`, exact: true }).click();
  await expect(locality(page)).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.getByTestId("warehouse-route-builder").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

test("existing warehouses remain unassigned and a locality-only save preserves every historical identity", async ({ page }, testInfo) => {
  const initial = configured(4, null), fixture = await sheetSession(page, { sheets: [initial] });
  await openExisting(page); await expect(locality(page)).toHaveValue(""); await expect(save(page)).toBeDisabled();
  await expect(page.getByTestId("warehouse-sheet")).toContainText("Localidad sin asignar");
  await locality(page).fill("1"); await expect(save(page)).toBeEnabled(); await save(page).click();
  await expect(page.getByText("Guardado: Almacén 4 · S1-ALM4", { exact: true })).toBeVisible();
  expect(fixture.commands[0]).toMatchObject({ localityNumber: 1, rows: [] });
  const saved = fixture.getSheets()[0]; expect(saved.warehouseRef).toBe(initial.warehouseRef); expect(saved.code).toBe(initial.code);
  expect(saved.locations.map(({ locationRef, code, path, parentLocationRef }) => ({ locationRef, code, path, parentLocationRef }))).toEqual(initial.locations.map(({ locationRef, code, path, parentLocationRef }) => ({ locationRef, code, path, parentLocationRef })));
  expect(saved.locations[0].address?.label).toBe(initial.locations[0].address?.label);
  await page.reload(); await expect(page.getByTestId("warehouse-locality-group")).toHaveText("Localidad S1");
  await expect(page.getByTestId("warehouse-space-row")).toContainText("S1-ALM4");
  const screenshot = `/tmp/osi-warehouse-20e-saved-${testInfo.project.name}.png`;
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
  await testInfo.attach("Localidad guardada y recuperada", { path: screenshot, contentType: "image/png" });
  await page.getByRole("button", { name: "Editar Almacén 4", exact: true }).click(); await locality(page).fill(""); await save(page).click();
  await expect(page.getByTestId("warehouse-locality-group")).toHaveText("Localidad sin asignar");
  expect(fixture.commands[1].localityNumber).toBeNull(); expect(fixture.browserErrors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

test("container bank format uses S1 ALM4 and level02 while the saved identifier stays2", async ({ page }, testInfo) => {
  const fixture = await sheetSession(page, { sheets: [configured(4, 1)] }); await openExisting(page);
  await expect(identifier(page, "nivel")).toHaveAttribute("maxlength", "2"); await expect(identifier(page, "nivel")).toHaveValue("00");
  await identifier(page, "estantería").fill("AA"); await identifier(page, "nivel").fill("02"); await identifier(page, "nivel").blur();
  await expect(page.getByTestId("warehouse-route-label")).toHaveText("S1-ALM4-000-00-AA-02-0"); await noOverflow(page);
  await page.screenshot({ path: `/tmp/osi-warehouse-20e-bank-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });
  await add(page).click(); await expect(page.getByTestId("warehouse-sheet-row").last()).toContainText("S1-ALM4-000-00-AA-02-0"); await save(page).click();
  await expect(page.getByTestId("warehouse-sheet")).toHaveCount(0);
  expect(fixture.commands[0].rows).toMatchObject([{ kind: "RACK", identifier: "AA" }, { kind: "LEVEL", identifier: "2" }]);
  expect(fixture.getSheets()[0].locations.at(-1)?.address).toMatchObject({ label: "ALM-04-000-00-AA-2-0", displayLabel: "S1-ALM4-000-00-AA-02-0", levelNumber: 2 });
  await page.getByLabel("Buscar almacenes y ubicaciones", { exact: true }).fill("S1-ALM4-000-00-AA-02-0");
  await expect(page.getByTestId("warehouse-space-row").last()).toContainText("S1-ALM4-000-00-AA-02-0");
  expect(fixture.browserErrors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

test("GM1 reference route previews and persists the exact S1-ALM2-GM1-01-AB-03-0 label", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [configured(2, 1)] }); await openExisting(page, 2);
  for (const [name, value] of [["zona", "GM1"], ["pasillo", "01"], ["estantería", "AB"], ["nivel", "03"]]) await identifier(page, name).fill(value);
  await expect(page.getByTestId("warehouse-route-label")).toHaveText("S1-ALM2-GM1-01-AB-03-0");
  await add(page).click(); await save(page).click(); await expect(page.getByTestId("warehouse-sheet")).toHaveCount(0);
  expect(fixture.commands[0].rows).toMatchObject([{ identifier: "GM1" }, { identifier: "01" }, { identifier: "AB" }, { identifier: "3" }]);
  expect(fixture.getSheets()[0].locations.at(-1)?.address?.displayLabel).toBe("S1-ALM2-GM1-01-AB-03-0");
  expect(fixture.browserErrors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

test("new warehouse proposes1 and an edited locality and unadded route survive reload", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] }); await openNewSheet(page, "Madera sintética");
  await expect(locality(page)).toHaveValue("1"); await expect(page.getByTestId("warehouse-route-label")).toHaveText("S1-ALM?-000-00-00-00-0");
  await locality(page).fill("3"); await identifier(page, "estantería").fill("AA"); await identifier(page, "nivel").fill("02"); await identifier(page, "nivel").blur();
  await page.reload(); await expect(locality(page)).toHaveValue("3"); await expect(identifier(page, "nivel")).toHaveValue("02");
  await expect(page.getByTestId("warehouse-route-label")).toHaveText("S3-ALM?-000-00-AA-02-0"); expect(fixture.commands).toHaveLength(0);
  await add(page).click(); await save(page).click(); await expect(page.getByText(/^Guardado: Madera sintética/)).toBeVisible();
  expect(fixture.commands[0].localityNumber).toBe(3); expect(fixture.getSheets()[0].localityNumber).toBe(3);
  expect(fixture.getSheets()[0].locations.at(-1)?.address?.displayLabel).toBe("S3-ALM1-000-00-AA-02-0");
  expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});

test("lost locality receipt stays locked and retries the identical body through a20E gate rejection", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [configured(4, null)] });
  fixture.setPostBehavior(async (route, _raw, confirm) => {
    if (fixture.commands.length === 1) { confirm(); return route.abort("connectionreset"); }
    if (fixture.commands.length === 2) return fulfill(route, "WAREHOUSE_LOCALITIES_DISABLED", 409);
    return fulfill(route, confirm());
  });
  await openExisting(page); await locality(page).fill("2"); await save(page).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado"); await expect(locality(page)).toBeDisabled();
  await page.reload(); await expect(locality(page)).toHaveValue("2"); await expect(locality(page)).toBeDisabled();
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("El guardado anterior sigue sin confirmar");
  await expect(page.getByRole("button", { name: "Descartar borrador", exact: true })).toBeDisabled(); await page.reload();
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByText("Guardado: Almacén 4 · S2-ALM4", { exact: true })).toBeVisible();
  expect(fixture.commands).toHaveLength(3); expect(fixture.commands[1]).toEqual(fixture.commands[0]); expect(fixture.commands[2]).toEqual(fixture.commands[0]);
  expect(fixture.getSheets()).toHaveLength(1); expect(fixture.browserErrors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

test("locality grouping and filter separate assigned warehouses from unassigned ones", async ({ page }) => {
  const initial = configured(4, 1), other = configured(2, null);
  const warehouseRef = randomUUID(), rootLocationRef = randomUUID();
  const second: WarehouseSheet = { ...other, warehouseRef, rootLocationRef, locations: other.locations.map((row) => ({ ...row, locationRef: rootLocationRef })) };
  const fixture = await sheetSession(page, { sheets: [second, initial], permissions: ["inventory:stock:view"] }); await page.goto("/warehouses/spaces");
  await expect(page.getByTestId("warehouse-locality-group")).toHaveText(["Localidad S1", "Localidad sin asignar"]);
  await page.getByLabel("Filtrar por localidad", { exact: true }).selectOption("unassigned");
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(1); await expect(page.getByTestId("warehouse-space-row")).toContainText("Almacén 2");
  await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toHaveCount(0);
  expect(fixture.commands).toHaveLength(0); expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});

test("legacy pending commands and receipts remain recoverable without injecting locality", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [SHEET] }); await page.goto("/warehouses/spaces");
  const change = { operation: "WAREHOUSE_SHEET_SAVE", warehouseRef: SHEET.warehouseRef, expectedWarehouseVersion: SHEET.version, expectedProfileVersion: SHEET.profileVersion, expectedRootConfigurationVersion: SHEET.rootConfigurationVersion, name: "Nombre legado recuperado", managerMembershipRef: null, rootAreaUseRef: null, rows: [] };
  await page.evaluate(({ draft }) => { sessionStorage.setItem("osi-plus.warehouses.pending.v1:82222222-2222-4222-8222-222222222222", JSON.stringify({ version: 1, draft })); }, { draft: { requestId: randomUUID(), change } });
  fixture.setPostBehavior(async (route, _raw, confirm) => {
    const saved = confirm();
    const warehouse = { ...saved.warehouse }; delete warehouse.localityNumber;
    const locations = warehouse.locations.map((location) => { if (!location.address) return location; const address = { ...location.address }; delete address.displayLabel; return { ...location, address }; });
    return fulfill(route, { ...saved, warehouse: { ...warehouse, locations } });
  });
  await page.reload(); await expect(page.getByRole("button", { name: "Reintentar guardado", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByText(/^Guardado: Nombre legado recuperado/)).toBeVisible();
  expect(fixture.commands[0]).not.toHaveProperty("localityNumber"); expect(fixture.browserErrors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});
