import { expect, test } from "@playwright/test";
import { BIN_REF, MANAGER, MANAGER_REF, PERSON, SHEET, STOCK, USE_REF, ZONE_REF, fulfill, nonAuth, openNewSheet, selectSection, sheetSession } from "./fixtures";

test("one page creates a complete 32-row sheet with use, manager and compact direct-entry quantities", async ({ page }, testInfo) => {
  const fixture = await sheetSession(page, { sheets: [] });
  await openNewSheet(page, "Almacén de operaciones");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Uso del almacén", { exact: true }).selectOption(USE_REF);
  await page.getByLabel("Encargado", { exact: true }).selectOption(MANAGER_REF);
  const heading = page.getByLabel("Nombre del almacén", { exact: true });
  const expectedHeight = (page.viewportSize()?.width ?? 0) < 640 ? "32px" : "28px";
  await expect(heading).toHaveCSS("height", expectedHeight);
  await page.getByText("Generar recorrido por cantidades", { exact: true }).click();
  const aisles = page.getByLabel("Cantidad de pasillo", { exact: true });
  await aisles.fill("12"); await page.getByLabel("Cantidad de estantería", { exact: true }).click(); await aisles.click();
  expect(await aisles.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, 2]);
  await expect(aisles).toHaveAttribute("type", "text"); await expect(aisles).toHaveAttribute("inputmode", "numeric");
  await expect(aisles).toHaveCSS("height", expectedHeight); await expect(aisles).toHaveCSS("width", "64px");
  await aisles.press("ArrowUp"); await aisles.press("ArrowDown"); await expect(aisles).toHaveValue("12");
  await aisles.fill("2"); await page.getByLabel("Cantidad de estantería", { exact: true }).fill("3"); await page.getByLabel("Cantidad de nivel", { exact: true }).fill("4");
  await expect(page.getByText(/^32 filas:/)).toBeVisible();
  await expect(page.getByTestId("warehouse-sheet-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Agregar filas generadas", exact: true }).click();
  await expect(page.getByTestId("warehouse-sheet-row")).toHaveCount(32);
  await page.getByLabel("Uso, fila 1", { exact: true }).selectOption(USE_REF);
  await heading.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `/tmp/osi-warehouse-20c-sheet-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });
  await page.screenshot({ path: `/tmp/osi-warehouse-20c-sheet-viewport-${testInfo.project.name}.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Guardar hoja", exact: true }).click();
  await expect(page.getByText(/^Guardado: Almacén de operaciones/)).toBeVisible();
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(33);
  expect(fixture.commands).toHaveLength(1);
  const body = fixture.commands[0]; expect(body).toMatchObject({ name: "Almacén de operaciones", managerMembershipRef: MANAGER_REF, rootAreaUseRef: USE_REF, expectedWarehouseVersion: 0, expectedProfileVersion: 0, expectedRootConfigurationVersion: 0 });
  const rows = body.rows as { action: string; kind: string; parentRowId: string | null }[];
  expect(rows.filter((row) => row.kind === "AISLE")).toHaveLength(2); expect(rows.filter((row) => row.kind === "RACK")).toHaveLength(6); expect(rows.filter((row) => row.kind === "LEVEL")).toHaveLength(24);
  expect(rows.every((row) => row.action === "CREATE")).toBe(true); expect(rows.some((row) => ["ZONE", "BIN", "WAREHOUSE_ROOT"].includes(row.kind))).toBe(false);
  expect(fixture.getSheets()[0].manager?.displayName).toBe(PERSON.displayName); expect(fixture.getSheets()[0].locations.some((row) => row.address?.label === "ALM-01-000-01-AA-1-0")).toBe(true);
  await page.getByLabel("Buscar almacenes y ubicaciones", { exact: true }).fill("ALM-01-000-01-AA-1-0");
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(4);
  await expect(page.getByTestId("warehouse-space-row").filter({ hasText: "ALM-01-000-01-AA-1-0" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Editar Almacén de operaciones", exact: true })).toBeVisible();
  expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});

test("omitted structural levels are zero label segments and never physical rows", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] }); await openNewSheet(page, "Almacén sin niveles intermedios");
  await page.getByRole("button", { name: "Agregar fila", exact: true }).click();
  await page.getByLabel("Tipo, fila 1", { exact: true }).selectOption("BIN");
  await page.getByLabel("Nombre, fila 1", { exact: true }).fill("Posición de acceso");
  await page.getByLabel("Uso, fila 1", { exact: true }).selectOption(USE_REF);
  await expect(page.getByRole("button", { name: "Agregar ubicación dentro de fila 1", exact: true })).toBeDisabled();
  await page.getByText("Generar recorrido por cantidades", { exact: true }).click();
  await page.getByLabel("Cantidad de posición", { exact: true }).fill("5");
  await expect(page.getByRole("button", { name: "Agregar filas generadas", exact: true })).toBeDisabled();
  // The helper is not a submitted row: its invalid unused quantity must not
  // prevent saving the independently valid worksheet.
  await page.getByRole("button", { name: "Guardar hoja", exact: true }).click();
  await expect(page.getByText(/^Guardado: Almacén sin niveles intermedios/)).toBeVisible();
  const saved = fixture.getSheets()[0]; expect(saved.locations).toHaveLength(2); expect(saved.locations.find((row) => row.kind === "BIN")?.address?.label).toBe("ALM-01-000-00-00-0-1");
  expect(fixture.commands[0].rows).toMatchObject([{ action: "CREATE", parentRowId: null, parentLocationRef: null, kind: "BIN", name: "Posición de acceso", areaUseRef: USE_REF }]);
  expect(fixture.unexpected).toEqual([]);
});

test("editing one existing row sends a sparse versioned update and preserves canonical codes", async ({ page }) => {
  const fixture = await sheetSession(page); await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Editar Zona sintética", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Editar almacén", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByLabel("Nombre, fila 1", { exact: true })).toBeFocused();
  await expect(page.getByLabel(/^Tipo, fila/)).toHaveCount(0); await expect(page.getByLabel(/^Dentro de, fila/)).toHaveCount(0); await expect(page.getByRole("button", { name: /^Quitar fila/ })).toHaveCount(0);
  await page.getByLabel("Nombre, fila 1", { exact: true }).fill("Zona de preparación");
  await page.getByLabel("Uso, fila 1", { exact: true }).selectOption(USE_REF);
  await page.getByRole("button", { name: "Guardar hoja", exact: true }).click();
  await expect(page.getByTestId("warehouse-space-row").filter({ hasText: "Zona de preparación" })).toBeVisible();
  expect(fixture.commands).toHaveLength(1); expect(fixture.commands[0].rows).toMatchObject([{ action: "UPDATE", locationRef: ZONE_REF, expectedVersion: 1, expectedConfigurationVersion: 0, name: "Zona de preparación", areaUseRef: USE_REF }]);
  expect(fixture.commands[0].rows as unknown[]).toHaveLength(1);
  const saved = fixture.getSheets()[0]; expect(saved.code).toBe(SHEET.code); expect(saved.locations.find((row) => row.locationRef === ZONE_REF)?.code).toBe(SHEET.locations.find((row) => row.locationRef === ZONE_REF)?.code);
  expect(saved.locations.find((row) => row.locationRef === BIN_REF)).toEqual(SHEET.locations.find((row) => row.locationRef === BIN_REF));
  expect(fixture.unexpected).toEqual([]);
});

test("editable working draft survives creating a use in Configuration and returning", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [], uses: [] }); await openNewSheet(page, "Hoja conservada");
  await page.getByRole("button", { name: "Agregar fila", exact: true }).click(); await page.getByLabel("Nombre, fila 1", { exact: true }).fill("Zona conservada");
  await page.getByRole("button", { name: "Crear uso en Configuración", exact: true }).click();
  await expect(page).toHaveURL(/\/warehouses\/configuration$/);
  await page.getByRole("button", { name: "Nuevo uso", exact: true }).click(); await page.getByLabel("Nombre del uso", { exact: true }).fill("Uso creado desde la hoja");
  await page.getByLabel("Destino orientativo", { exact: true }).selectOption("INTERNAL");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click(); await expect(page.getByTestId("warehouse-use-row")).toContainText("Uso creado desde la hoja");
  await selectSection(page, "/warehouses/spaces");
  await expect(page.getByTestId("warehouse-sheet")).toBeVisible(); await expect(page.getByLabel("Nombre del almacén", { exact: true })).toHaveValue("Hoja conservada");
  await expect(page.getByLabel("Nombre, fila 1", { exact: true })).toHaveValue("Zona conservada");
  await page.getByLabel("Uso del almacén", { exact: true }).selectOption(fixture.getUses()[0].useRef);
  expect(fixture.commands).toHaveLength(0);
  await page.getByRole("button", { name: "Guardar hoja", exact: true }).click(); await expect(page.getByText(/^Guardado: Hoja conservada/)).toBeVisible();
  expect(fixture.commands).toHaveLength(1); expect(fixture.commands[0].rows).toMatchObject([{ name: "Zona conservada", action: "CREATE" }]); expect(fixture.unexpected).toEqual([]);
});

test("refreshing a failed use catalog preserves typed worksheet fields and its rows", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] }); let failed = true;
  await page.route("**/api/materials/warehouse-configuration", (route) => failed ? fulfill(route, "MATERIALS_DATABASE_UNAVAILABLE", 503) : fulfill(route, fixture.getConfiguration()));
  await openNewSheet(page, "Nombre durante error de usos"); await page.getByRole("button", { name: "Agregar fila", exact: true }).click(); await page.getByLabel("Nombre, fila 1", { exact: true }).fill("Zona durante error");
  await expect(page.getByRole("button", { name: "Guardar hoja", exact: true })).toBeDisabled();
  failed = false; await page.getByRole("button", { name: "Reintentar consulta", exact: true }).click();
  await expect(page.getByLabel("Uso del almacén", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Nombre del almacén", { exact: true })).toHaveValue("Nombre durante error de usos"); await expect(page.getByLabel("Nombre, fila 1", { exact: true })).toHaveValue("Zona durante error");
  expect(fixture.commands).toHaveLength(0); await page.getByRole("button", { name: "Guardar hoja", exact: true }).click(); await expect(page.getByText(/^Guardado: Nombre durante error de usos/)).toBeVisible(); expect(fixture.unexpected).toEqual([]);
});

test("a lost success keeps the exact request across navigation, reload and a denied retry", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] });
  fixture.setPostBehavior(async (route, _raw, confirm) => {
    if (fixture.commands.length === 1) { confirm(); return route.abort("connectionreset"); }
    if (fixture.commands.length === 2) return fulfill(route, "WAREHOUSE_SHEET_FORBIDDEN", 403);
    return fulfill(route, confirm());
  });
  await openNewSheet(page, "Almacén de respuesta perdida"); await page.getByRole("button", { name: "Agregar fila", exact: true }).click(); await page.getByLabel("Nombre, fila 1", { exact: true }).fill("Zona única");
  await page.getByRole("button", { name: "Guardar hoja", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await expect(page.getByLabel("Nombre del almacén", { exact: true })).toBeDisabled();
  await selectSection(page, "/warehouses/configuration"); await selectSection(page, "/warehouses/spaces"); await page.reload();
  await expect(page.getByRole("button", { name: "Reintentar guardado", exact: true })).toBeVisible(); expect(fixture.commands).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("El guardado anterior sigue sin confirmar");
  await page.reload(); await expect(page.getByLabel("Nombre, fila 1", { exact: true })).toHaveValue("Zona única"); expect(fixture.commands).toHaveLength(2);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByText(/^Guardado: Almacén de respuesta perdida/)).toBeVisible();
  expect(fixture.commands).toHaveLength(3); expect(fixture.commands[1]).toEqual(fixture.commands[0]); expect(fixture.commands[2]).toEqual(fixture.commands[0]); expect(fixture.getSheets()).toHaveLength(1); expect(fixture.getSheets()[0].locations).toHaveLength(2); expect(fixture.unexpected).toEqual([]);
});

test("an invalid 200 receipt remains uncertain and never clears or automatically resends the sheet", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] });
  fixture.setPostBehavior(async (route, _raw, confirm) => {
    const result = confirm(); return fulfill(route, fixture.commands.length === 1 ? { warehouse: result.warehouse, rowResults: [] } : result);
  });
  await openNewSheet(page, "Almacén con recibo incompleto"); await page.getByRole("button", { name: "Agregar fila", exact: true }).click(); await page.getByLabel("Nombre, fila 1", { exact: true }).fill("Fila conservada");
  await page.getByRole("button", { name: "Guardar hoja", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await page.reload(); await expect(page.getByLabel("Nombre, fila 1", { exact: true })).toHaveValue("Fila conservada"); await expect(page.getByLabel("Nombre, fila 1", { exact: true })).toBeDisabled(); expect(fixture.commands).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click(); await expect(page.getByText(/^Guardado: Almacén con recibo incompleto/)).toBeVisible(); expect(fixture.commands[1]).toEqual(fixture.commands[0]); expect(fixture.getSheets()).toHaveLength(1); expect(fixture.unexpected).toEqual([]);
});

test("stock-only access sees the sheet-backed list without manager lookup or mutation controls", async ({ page }) => {
  const fixture = await sheetSession(page, { permissions: STOCK }); await page.goto("/warehouses/spaces");
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(3); await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);
  expect(nonAuth(fixture.apiRequests)).toEqual(expect.arrayContaining(["/api/materials/warehouse-sheets", "/api/materials/warehouse-configuration"]));
  expect(fixture.apiRequests.some((path) => path.includes("manager-options"))).toBe(false); expect(fixture.resources.some((path) => path.includes("WarehouseSheetEditor.tsx"))).toBe(false); expect(fixture.unexpected).toEqual([]);
});

test("an explicit stock denial prevents domain reads and worksheet controls", async ({ page }) => {
  const fixture = await sheetSession(page, { permissions: MANAGER, denied: ["inventory:stock:view"] }); await page.goto("/warehouses/spaces");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible(); expect(nonAuth(fixture.apiRequests)).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

test("a disabled worksheet API leaves creation blocked and never falls back to old mutations", async ({ page }) => {
  const fixture = await sheetSession(page, { readError: "WAREHOUSE_SHEET_DISABLED" }); await page.goto("/warehouses/spaces");
  await expect(page.getByRole("alert")).toContainText("La hoja de almacenes todavía no está habilitada"); await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toBeDisabled();
  expect(fixture.commands).toHaveLength(0); expect(fixture.apiRequests.some((path) => path === "/api/materials/warehouses")).toBe(false); expect(fixture.unexpected).toEqual([]);
});

test("an invalid cyclic draft can be discarded without trapping the user or sending a command", async ({ page }) => {
  const fixture = await sheetSession(page, { sheets: [] }); await openNewSheet(page, "Borrador que se descarta");
  await page.getByRole("button", { name: "Agregar fila", exact: true }).click(); await page.getByLabel("Nombre, fila 1", { exact: true }).fill("Zona A");
  await page.getByRole("button", { name: "Agregar fila", exact: true }).click(); await page.getByLabel("Nombre, fila 2", { exact: true }).fill("Zona B");
  await page.getByLabel("Dentro de, fila 1", { exact: true }).selectOption({ label: "Zona B · Nueva 2" });
  await page.getByLabel("Dentro de, fila 2", { exact: true }).selectOption({ label: "Zona A · Nueva 1" });
  await page.getByRole("button", { name: "Guardar hoja", exact: true }).click(); expect(fixture.commands).toHaveLength(0);
  await page.getByRole("button", { name: "Descartar borrador", exact: true }).click(); await expect(page.getByTestId("warehouse-sheet")).toHaveCount(0);
  await page.reload(); await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toBeEnabled(); await expect(page.getByRole("button", { name: "Continuar borrador", exact: true })).toHaveCount(0);
  expect(fixture.commands).toHaveLength(0); expect(fixture.unexpected).toEqual([]); expect(fixture.browserErrors).toEqual([]);
});
