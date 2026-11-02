import { expect, test, type Page } from "@playwright/test";
import { BIN_REF, MANAGER_REF, POPULATED_SHEET, ROOT_REF, SHEET, USE_REF, ZONE_REF, fulfill, openNewSheet, selectSection, sheetSession } from "./fixtures";

const identifier = (page: Page, label: string) => page.getByLabel(`Identificador de ${label}`, { exact: true });
const addRoute = (page: Page) => page.getByRole("button", { name: "Agregar recorrido a la hoja", exact: true });
const save = (page: Page) => page.getByRole("button", { name: "Guardar hoja", exact: true });
async function openExisting(page: Page) {
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Editar Almacén 1", exact: true }).click();
  await expect(page.getByTestId("warehouse-route-builder")).toBeVisible();
}
async function referenceRoute(page: Page) {
  await identifier(page, "zona").fill("TRD"); await identifier(page, "estantería").fill("AA");
  await identifier(page, "estantería").blur();
}
async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await page.getByTestId("warehouse-route-builder").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

test("reference route is inline, compact and responsive, then saves exactly zone TRD and rack AA", async ({ page }, testInfo) => {
  const fixture = await sheetSession(page); await openExisting(page);
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(save(page)).toBeDisabled();
  await page.getByLabel("Uso del almacén", { exact: true }).selectOption(USE_REF);
  await page.getByLabel("Encargado", { exact: true }).selectOption(MANAGER_REF);
  const aisle = identifier(page, "pasillo"); const expectedHeight = (page.viewportSize()?.width ?? 0) < 640 ? "32px" : "28px";
  await aisle.fill("12"); await identifier(page, "estantería").click(); await aisle.click();
  expect(await aisle.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, 2]);
  await expect(aisle).toHaveAttribute("type", "text"); await expect(aisle).toHaveAttribute("inputmode", "numeric");
  await expect(aisle).toHaveCSS("height", expectedHeight); await expect(aisle).toHaveCSS("width", "80px");
  await aisle.press("ArrowUp"); await aisle.press("ArrowDown"); await expect(aisle).toHaveValue("12");
  await aisle.fill("00"); await referenceRoute(page);
  const preview = page.getByTestId("warehouse-route-preview");
  await expect(preview).toContainText("2 nuevas · 1 existentes · 0 ya en la hoja");
  await expect(page.getByTestId("warehouse-route-label")).toHaveText("ALM-01-TRD-00-AA-0-0");
  await expect(page.getByTestId("warehouse-route-step")).toHaveCount(3);
  await expect(page.getByTestId("warehouse-sheet-row")).toHaveCount(0); expect(fixture.commands).toHaveLength(0);
  await noPageOverflow(page);
  if (testInfo.project.name === "chromium-desktop") {
    const viewport = page.viewportSize()!; await page.setViewportSize({ width: 1024, height: 768 }); await noPageOverflow(page); await page.setViewportSize(viewport);
  }
  await page.getByText("Crear varias ubicaciones por cantidades", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/osi-warehouse-20d-routes-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });
  await page.getByRole("heading", { name: "Editar almacén", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/osi-warehouse-20d-routes-viewport-${testInfo.project.name}.png`, animations: "disabled" });
  await page.getByTestId("warehouse-route-builder").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `/tmp/osi-warehouse-20d-routes-builder-viewport-${testInfo.project.name}.png`, animations: "disabled" });
  await addRoute(page).click(); await expect(page.getByTestId("warehouse-sheet-row")).toHaveCount(2);
  await expect(preview).toContainText("0 nuevas · 1 existentes · 2 ya en la hoja");
  await page.getByRole("button", { name: "Ver fila en la hoja", exact: true }).click();
  await expect(page.getByLabel("Nombre, fila 2", { exact: true })).toBeFocused();
  await page.getByLabel("Uso, fila 1", { exact: true }).selectOption(USE_REF);
  await save(page).click(); await expect(page.getByText(/^Guardado: Almacén 1/)).toBeVisible();
  expect(fixture.commands).toHaveLength(1);
  const rows = fixture.commands[0].rows as { kind: string; identifier?: string; rowId: string; parentRowId: string | null; parentLocationRef: string | null }[];
  expect(rows).toMatchObject([{ kind: "ZONE", identifier: "TRD", parentRowId: null, parentLocationRef: null }, { kind: "RACK", identifier: "AA", parentLocationRef: null }]);
  expect(rows[1].parentRowId).toBe(rows[0].rowId); expect(rows).toHaveLength(2);
  expect(fixture.getSheets()[0].locations).toHaveLength(3);
  expect(fixture.getSheets()[0].locations.at(-1)?.address?.label).toBe("ALM-01-TRD-00-AA-0-0");
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("route-working")))).toEqual([]);
  expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});

test("a fully existing route opens its destination row without posting or changing its name or use", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [POPULATED_SHEET] }); await openExisting(page); await referenceRoute(page);
  await expect(page.getByTestId("warehouse-route-preview")).toContainText("0 nuevas · 3 existentes · 0 ya en la hoja");
  await page.getByRole("button", { name: "Abrir ubicación existente", exact: true }).click();
  await expect(page.getByLabel("Nombre, fila 2", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Uso, fila 2", { exact: true })).toHaveValue(USE_REF); await expect(save(page)).toBeDisabled();
  await page.getByLabel("Nombre de zona", { exact: true }).fill("Nombre incompatible");
  await expect(page.getByText(/Ya existe como «Zona TRD»/)).toBeVisible(); await expect(addRoute(page)).toBeDisabled();
  expect(fixture.commands).toHaveLength(0); expect(fixture.getSheets()[0]).toEqual(POPULATED_SHEET); expect(fixture.unexpected).toEqual([]);
});

test("mixed branches reuse the staged zone but keep direct rack AA separate from aisle01 rack AA", async ({ page }) => {
  const fixture = await sheetSession(page); await openExisting(page); await referenceRoute(page); await addRoute(page).click();
  await identifier(page, "pasillo").fill("1"); await identifier(page, "nivel").fill("2"); await identifier(page, "posición").fill("4"); await identifier(page, "posición").blur();
  await expect(identifier(page, "pasillo")).toHaveValue("01");
  await expect(page.getByTestId("warehouse-route-preview")).toContainText("4 nuevas · 1 existentes · 1 ya en la hoja");
  await expect(page.getByTestId("warehouse-route-label")).toHaveText("ALM-01-TRD-01-AA-2-4");
  await addRoute(page).click(); await expect(page.getByTestId("warehouse-sheet-row")).toHaveCount(6);
  await identifier(page, "pasillo").fill("0"); await identifier(page, "nivel").fill("0"); await identifier(page, "posición").fill("0"); await identifier(page, "posición").blur();
  await expect(page.getByTestId("warehouse-route-preview")).toContainText("0 nuevas · 1 existentes · 2 ya en la hoja");
  await page.getByRole("button", { name: "Ver fila en la hoja", exact: true }).click(); await expect(page.getByLabel("Nombre, fila 2", { exact: true })).toBeFocused();
  expect(fixture.commands).toHaveLength(0); await save(page).click(); await expect(page.getByText(/^Guardado: Almacén 1/)).toBeVisible();
  expect(fixture.commands[0].rows as unknown[]).toHaveLength(6);
  const locations = fixture.getSheets()[0].locations; const racks = locations.filter((row) => row.kind === "RACK");
  expect(racks).toHaveLength(2); expect(racks.map((row) => row.address?.label).sort()).toEqual(["ALM-01-TRD-00-AA-0-0", "ALM-01-TRD-01-AA-0-0"]);
  expect(new Set(racks.map((row) => row.parentLocationRef)).size).toBe(2); expect(fixture.unexpected).toEqual([]);
});

test("fixed formats reject wrong characters and preserve valid alphanumeric zones and numeric padding", async ({ page }) => {
  const fixture = await sheetSession(page); await openExisting(page);
  const reset = page.getByRole("button", { name: "Limpiar recorrido", exact: true });
  for (const [label, value] of [["zona", "TR"], ["zona", "A_1"], ["pasillo", "ZZ"], ["estantería", "A1"], ["nivel", "X"], ["posición", "5"]]) {
    await reset.click(); await identifier(page, label).fill(value); await identifier(page, label).blur();
    await expect(identifier(page, label)).toHaveAttribute("aria-invalid", "true"); await expect(addRoute(page)).toBeDisabled();
  }
  await reset.click(); await identifier(page, "nivel").fill("1"); await expect(page.getByText("Un nivel necesita una estantería en este recorrido.", { exact: true })).toBeVisible(); await expect(addRoute(page)).toBeDisabled();
  for (const zone of ["A01", "00A", "TRD"]) {
    await reset.click(); await identifier(page, "zona").fill(zone); await expect(addRoute(page)).toBeEnabled();
    await expect(page.getByTestId("warehouse-route-label")).toHaveText(`ALM-01-${zone}-00-00-0-0`);
  }
  await reset.click(); await identifier(page, "zona").fill("1"); await identifier(page, "pasillo").fill("1"); await identifier(page, "pasillo").blur();
  await expect(identifier(page, "zona")).toHaveValue("001"); await expect(identifier(page, "pasillo")).toHaveValue("01");
  await expect(identifier(page, "zona")).toHaveAttribute("maxlength", "3"); await expect(identifier(page, "pasillo")).toHaveAttribute("maxlength", "2");
  expect(fixture.commands).toHaveLength(0); expect(fixture.unexpected).toEqual([]);
});

test("an unadded route survives reload and a visit to Configuration without enabling an empty save", async ({ page }) => {
  const fixture = await sheetSession(page); await openExisting(page); await referenceRoute(page);
  await page.getByLabel("Nombre de zona", { exact: true }).fill("Zona en borrador");
  await expect(save(page)).toBeDisabled(); await page.reload();
  await expect(page.getByTestId("warehouse-sheet")).toBeVisible();
  await expect(identifier(page, "zona")).toHaveValue("TRD"); await expect(identifier(page, "estantería")).toHaveValue("AA");
  await expect(page.getByLabel("Nombre de zona", { exact: true })).toHaveValue("Zona en borrador");
  await expect(save(page)).toBeDisabled(); await expect(page.getByTestId("warehouse-sheet-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Crear uso en Configuración", exact: true }).click(); await expect(page).toHaveURL(/\/warehouses\/configuration$/);
  await selectSection(page, "/warehouses/spaces"); await expect(page).toHaveURL(/\/warehouses\/spaces$/);
  await expect(identifier(page, "zona")).toHaveValue("TRD"); await expect(save(page)).toBeDisabled(); expect(fixture.commands).toHaveLength(0);
  await page.getByRole("button", { name: "Descartar borrador", exact: true }).click();
  await expect(page.getByTestId("warehouse-sheet")).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Almacén 1", exact: true }).click();
  await expect(identifier(page, "zona")).toHaveValue("000"); await expect(identifier(page, "estantería")).toHaveValue("00");
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("route-working")))).toEqual([]);
  expect(fixture.commands).toHaveLength(0); expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});

test("unknown warehouse prefix stays ALM-?? until its explicit route is saved", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] }); await openNewSheet(page, "Almacén con recorrido"); await referenceRoute(page);
  await expect(page.getByTestId("warehouse-route-label")).toHaveText("ALM-??-TRD-00-AA-0-0");
  await save(page).click(); await expect(page.getByRole("alert")).toContainText("Agregue el recorrido a la hoja"); expect(fixture.commands).toHaveLength(0);
  await addRoute(page).click(); await expect(page.getByTestId("warehouse-sheet-row").last()).toContainText("ALM-??-TRD-00-AA-0-0");
  await save(page).click(); await expect(page.getByText(/^Guardado: Almacén con recorrido/)).toBeVisible();
  expect(fixture.getSheets()[0].warehouseNumber).toBe(1); expect(fixture.getSheets()[0].locations.at(-1)?.address?.label).toBe("ALM-01-TRD-00-AA-0-0");
  expect(fixture.unexpected).toEqual([]);
});

test("a lost explicit-route receipt stays locked and retries the identical payload through a20D rollout gate", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] });
  fixture.setPostBehavior(async (route, _raw, confirm) => {
    if (fixture.commands.length === 1) { confirm(); return route.abort("connectionreset"); }
    if (fixture.commands.length === 2) return fulfill(route, "WAREHOUSE_ROUTES_DISABLED", 409);
    return fulfill(route, confirm());
  });
  await openNewSheet(page, "Almacén con recibo pendiente"); await referenceRoute(page); await addRoute(page).click(); await save(page).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await expect(identifier(page, "zona")).toBeDisabled(); await expect(page.getByRole("button", { name: "Descartar borrador", exact: true })).toBeDisabled();
  await page.reload(); await expect(page.getByRole("button", { name: "Reintentar guardado", exact: true })).toBeVisible();
  await expect(identifier(page, "zona")).toHaveValue("TRD"); await expect(identifier(page, "estantería")).toHaveValue("AA"); expect(fixture.commands).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("El guardado anterior sigue sin confirmar");
  await expect(identifier(page, "zona")).toBeDisabled(); await page.reload();
  await expect(page.getByRole("button", { name: "Reintentar guardado", exact: true })).toBeVisible(); expect(fixture.commands).toHaveLength(2);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByText(/^Guardado: Almacén con recibo pendiente/)).toBeVisible();
  expect(fixture.commands).toHaveLength(3); expect(fixture.commands[1]).toEqual(fixture.commands[0]); expect(fixture.commands[2]).toEqual(fixture.commands[0]);
  expect(fixture.commands[0].rows).toMatchObject([{ identifier: "TRD" }, { identifier: "AA" }]);
  expect(fixture.getSheets()).toHaveLength(1); expect(fixture.getSheets()[0].locations).toHaveLength(3); expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});

test("an inactive root blocks new route locations while existing destinations can still be inspected", async ({ page }) => {
  const inactive = { ...POPULATED_SHEET, locations: POPULATED_SHEET.locations.map((row) => row.locationRef === ROOT_REF ? { ...row, status: "INACTIVE" } : row) };
  const fixture = await sheetSession(page, { sheets: [inactive] }); await openExisting(page); await referenceRoute(page);
  await page.getByRole("button", { name: "Abrir ubicación existente", exact: true }).click(); await expect(page.getByLabel("Nombre, fila 2", { exact: true })).toBeFocused();
  await identifier(page, "estantería").fill("AB");
  await expect(page.getByTestId("warehouse-route-preview")).toContainText("El almacén o una ubicación superior está inactiva");
  await expect(addRoute(page)).toBeDisabled(); expect(fixture.commands).toHaveLength(0);
  expect(fixture.getSheets()[0].locations.find((row) => row.locationRef === BIN_REF)?.address?.rackCode).toBe("AA");
  expect(fixture.getSheets()[0].locations.find((row) => row.locationRef === ZONE_REF)?.areaUseRef).toBe(USE_REF); expect(fixture.unexpected).toEqual([]);
});

test("the secondary quantity generator stays automatic and reserves explicitly chosen rack AA first", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [SHEET] }); await openExisting(page);
  await page.getByText("Crear varias ubicaciones por cantidades", { exact: true }).click();
  await page.getByLabel("Cantidad de estantería", { exact: true }).fill("1"); await page.getByRole("button", { name: "Agregar filas generadas", exact: true }).click();
  await identifier(page, "estantería").fill("AA"); await addRoute(page).click();
  await expect(page.getByTestId("warehouse-sheet-row").first()).toContainText("ALM-01-000-00-AB-0-0");
  await expect(page.getByTestId("warehouse-sheet-row").last()).toContainText("ALM-01-000-00-AA-0-0");
  await save(page).click(); await expect(page.getByText(/^Guardado: Almacén 1/)).toBeVisible();
  const rows = fixture.commands[0].rows as { identifier?: string }[];
  expect(rows[0]).not.toHaveProperty("identifier"); expect(rows[1].identifier).toBe("AA");
  expect(fixture.getSheets()[0].locations.filter((row) => row.kind === "RACK").map((row) => row.address?.rackCode).sort()).toEqual(["AA", "AB"]);
  expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});
