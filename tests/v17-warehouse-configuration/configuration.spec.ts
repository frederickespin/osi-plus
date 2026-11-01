import { expect, test } from "@playwright/test";
import { normalizeWarehouseAreaUseCreate, normalizeWarehouseAreaUseUpdate, normalizeWarehouseLocationConfiguration } from "../../api/_lib/warehouseConfigurationContract.js";
import { BIN_REF, CONFIG_REF, MANAGER, ROOT_REF, STOCK, USE, USE_REF, WAREHOUSE_REF, ZONE_REF, configuration, configurationSession, emptyConfiguration, fulfill, nonAuth, selectSection } from "./fixtures";

test("stock readers get only configuration data with grouped navigation and no mutation controls", async ({ page }) => {
  const fixture = await configurationSession(page, STOCK);
  await page.goto("/warehouses/configuration");
  await expect(page.getByText("Todavía no hay usos de áreas registrados.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo uso", exact: true })).toHaveCount(0);
  expect(new Set(nonAuth(fixture.apiRequests))).toEqual(new Set(["/api/materials/warehouse-configuration"]));
  const mobile = page.getByLabel("Sección de Almacenes", { exact: true });
  if (await mobile.isVisible()) {
    await expect(mobile.locator("optgroup")).toHaveAttribute("label", "Organización y catálogo");
    await expect(mobile.locator("option")).toHaveCount(2);
  } else {
    await expect(page.getByRole("button", { name: "Organización y catálogo", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Control de inventario", exact: true })).toHaveCount(0);
  }
  await selectSection(page, "/warehouses/spaces");
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Ver configuración de Zona sintética", exact: true }).click();
  await expect(page.getByLabel("Características", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Ayuda de Características de la ubicación", exact: true }).click();
  await expect(page.getByText("Este texto es informativo. Escribir dimensiones o capacidades no calcula espacio libre ni modifica los controles operativos.")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ayuda", exact: true }).click();
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toHaveCount(0);
  expect(fixture.apiRequests.some((path) => /catalog|assets/.test(path))).toBe(false);
  expect(fixture.unexpected).toEqual([]);
});

test("configuration deny is enforced before lazy consumer or domain reads", async ({ page }) => {
  const fixture = await configurationSession(page, [...MANAGER, "assets:instance:view"], emptyConfiguration(), ["inventory:stock:view"]);
  await page.goto("/warehouses/configuration");
  await expect(page.getByTestId("hub-forbidden")).toBeVisible();
  expect(nonAuth(fixture.apiRequests)).toEqual([]);
  expect(fixture.resources.some((path) => /WarehouseConfiguration\.tsx|LocationConfigurationEditor\.tsx/.test(path))).toBe(false);
  expect(fixture.unexpected).toEqual([]);
});

test("uses create and edit with automatic immutable codes, compact fields and help", async ({ page }, testInfo) => {
  const fixture = await configurationSession(page);
  const commands: Record<string, unknown>[] = [];
  await page.route("**/api/materials/warehouse-uses**", async (route) => {
    const raw = route.request().postDataJSON(); commands.push(raw);
    expect(raw).not.toHaveProperty("code"); expect(raw).not.toHaveProperty("tenantId"); expect(raw).not.toHaveProperty("operation");
    if (route.request().method() === "POST") {
      const normalized = normalizeWarehouseAreaUseCreate(raw);
      const row = { ...USE, name: normalized.name, purpose: normalized.purpose, description: normalized.description };
      fixture.setConfiguration({ ...fixture.getConfiguration(), areaUses: [row] });
      return fulfill(route, row, 201);
    }
    const normalized = normalizeWarehouseAreaUseUpdate(raw, USE_REF);
    const row = { ...USE, name: normalized.name, description: normalized.description, purpose: normalized.purpose, status: normalized.status, version: 2 };
    fixture.setConfiguration({ ...fixture.getConfiguration(), areaUses: [row] });
    return fulfill(route, row);
  });
  await page.goto("/warehouses/configuration");
  await page.getByRole("button", { name: "Nuevo uso", exact: true }).click();
  const name = page.getByLabel("Nombre del uso", { exact: true });
  await name.fill("Uso definido por el usuario");
  await expect(page.getByText("Código automático al guardar.", { exact: true })).toBeVisible();
  await page.getByLabel("Destino orientativo", { exact: true }).selectOption("MIXED");
  await page.getByLabel("Descripción", { exact: true }).fill("Descripción informativa");
  await expect(name).toHaveCSS("height", (page.viewportSize()?.width ?? 0) < 640 ? "32px" : "28px");
  await page.getByRole("button", { name: "Ayuda de Destino del uso", exact: true }).click();
  await expect(page.getByText("Este dato es descriptivo. No asigna propietarios ni crea registros de custodia de clientes.")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ayuda", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Destino del uso", exact: true })).toBeHidden();
  await page.screenshot({ path: `/tmp/osi-warehouse-20b-use-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByTestId("warehouse-use-row")).toContainText("USO-0001");
  await page.getByRole("button", { name: "Editar uso Uso definido por el usuario", exact: true }).click();
  await page.getByLabel("Nombre del uso", { exact: true }).fill("Uso renombrado");
  await page.getByRole("combobox", { name: "Estado del uso", exact: true }).selectOption("INACTIVE");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  const row = page.getByTestId("warehouse-use-row");
  await expect(row).toContainText("Uso renombrado"); await expect(row).toContainText("USO-0001"); await expect(row).toContainText("Inactivo");
  expect(commands).toHaveLength(2); expect(commands[1].expectedVersion).toBe(1); expect(commands[1]).not.toHaveProperty("useRef");
  expect(nonAuth(fixture.apiRequests).every((path) => path.includes("warehouse-configuration") || path.includes("warehouse-uses"))).toBe(true);
  expect(fixture.unexpected).toEqual([]);
});

test("assigning a use and informative text changes one location without control or code changes", async ({ page }) => {
  const fixture = await configurationSession(page, MANAGER, { ...emptyConfiguration(), areaUses: [USE] });
  const commands: Record<string, unknown>[] = [];
  await page.route(`**/api/materials/warehouses/locations/${ZONE_REF}/configuration`, async (route) => {
    const raw = route.request().postDataJSON(); commands.push(raw);
    const input = normalizeWarehouseLocationConfiguration(raw, ZONE_REF);
    const saved = configuration(ZONE_REF, { configRef: CONFIG_REF, version: 1, areaUseRef: input.areaUseRef, characteristics: input.characteristics, notes: input.notes });
    fixture.setConfiguration({ areaUses: [{ ...USE, assignedLocationCount: 1 }], locations: [configuration(ROOT_REF), saved, configuration(BIN_REF)] });
    return fulfill(route, saved);
  });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Configurar Zona sintética", exact: true }).click();
  await page.getByLabel("Uso del área", { exact: true }).selectOption(USE_REF);
  await page.getByLabel("Características", { exact: true }).fill("Área techada");
  await page.getByLabel("Notas", { exact: true }).fill("Indicación informativa");
  await expect(page.getByLabel("Estado operativo propio", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  const zone = page.getByTestId("warehouse-space-row").filter({ hasText: "Zona sintética" });
  await expect(zone).toContainText(USE.name); await expect(zone).toContainText("ALM-0001-Z01"); await expect(zone).toContainText("Despachos permitidos");
  await expect(page.getByTestId("warehouse-space-row").filter({ hasText: "Posición sintética" })).toContainText("Sin asignar");
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ expectedVersion: 0, areaUseRef: USE_REF, characteristics: "Área techada", notes: "Indicación informativa", operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED", changeReason: null, acknowledgeImpact: false });
  expect(commands[0]).not.toHaveProperty("locationRef"); expect(commands[0]).not.toHaveProperty("code");
  expect(fixture.unexpected).toEqual([]);
});

test("inherited restrictions show their source and reason without claiming a child is available", async ({ page }, testInfo) => {
  const restricted = { operationalStatus: "RESTRICTED" as const, availabilityRule: "CONDITION_BASED" as const, canReceive: false, canDispatch: false, inherited: false, blockedBy: [{ warehouseRef: WAREHOUSE_REF, locationRef: ZONE_REF, kind: "OPERATIONAL_STATUS" as const, value: "RESTRICTED", reason: "Mantenimiento de zona" }] };
  const fixture = await configurationSession(page, STOCK, { areaUses: [], locations: [configuration(ROOT_REF), configuration(ZONE_REF, { configRef: CONFIG_REF, version: 1, operationalStatus: "RESTRICTED", lastControlReason: "Mantenimiento de zona", effective: restricted }), configuration(BIN_REF, { effective: { ...restricted, inherited: true } })] });
  await page.goto("/warehouses/spaces");
  const bin = page.getByTestId("warehouse-space-row").filter({ hasText: "Posición sintética" });
  await expect(bin).toContainText("Restringido"); await expect(bin).toContainText("Despachos bloqueados · Heredado");
  await page.getByRole("button", { name: "Controles operativos de Posición sintética", exact: true }).click();
  await expect(page.getByLabel("Estado operativo propio", { exact: true })).toHaveValue("ACTIVE");
  await expect(page.getByLabel("Estado operativo propio", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Condición efectiva de la ubicación", { exact: true })).toContainText("Mantenimiento de zona");
  await expect(page.getByLabel("Condición efectiva de la ubicación", { exact: true })).toContainText("Almacén sintético › Zona sintética");
  await page.screenshot({ path: `/tmp/osi-warehouse-20b-controls-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });
  expect(fixture.unexpected).toEqual([]);
});

test("control changes in either direction need reason and acknowledgment and surface active commitments", async ({ page }) => {
  const fixture = await configurationSession(page);
  const commands: Record<string, unknown>[] = [];
  await page.route(`**/api/materials/warehouses/locations/${ZONE_REF}/configuration`, async (route) => {
    const raw = route.request().postDataJSON(); commands.push(raw);
    const input = normalizeWarehouseLocationConfiguration(raw, ZONE_REF);
    if (commands.length === 1) return fulfill(route, "WAREHOUSE_CONFIGURATION_COMMITMENTS_ACTIVE", 409);
    const saved = configuration(ZONE_REF, { configRef: CONFIG_REF, version: commands.length - 1, operationalStatus: input.operationalStatus, availabilityRule: input.availabilityRule, lastControlReason: input.changeReason,
      effective: { operationalStatus: input.operationalStatus, availabilityRule: input.availabilityRule, canReceive: true, canDispatch: input.availabilityRule !== "BLOCKED", inherited: false, blockedBy: input.availabilityRule === "BLOCKED" ? [{ warehouseRef: WAREHOUSE_REF, locationRef: ZONE_REF, kind: "DISPATCH_BLOCKED", value: "BLOCKED", reason: input.changeReason }] : [] } });
    fixture.setConfiguration({ ...fixture.getConfiguration(), locations: [configuration(ROOT_REF), saved, configuration(BIN_REF)] });
    return fulfill(route, saved);
  });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Controles operativos de Zona sintética", exact: true }).click();
  await page.getByLabel("Regla de disponibilidad", { exact: true }).selectOption("BLOCKED");
  const save = page.getByRole("button", { name: "Guardar cambios", exact: true });
  await expect(save).toBeDisabled();
  await page.getByLabel("Motivo del cambio", { exact: true }).fill("Revisión de despacho");
  await expect(save).toBeDisabled();
  await page.getByRole("checkbox").check(); await save.click();
  await expect(page.getByRole("alert")).toContainText("Hay reservas o préstamos pendientes");
  await expect(page.getByLabel("Regla de disponibilidad", { exact: true })).toBeEnabled();
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Controles operativos de Zona sintética", exact: true }).click();
  await expect(page.getByText("Último motivo registrado: Revisión de despacho")).toBeVisible();
  await page.getByLabel("Regla de disponibilidad", { exact: true }).selectOption("CONDITION_BASED");
  await expect(page.getByLabel("Motivo del cambio", { exact: true })).toHaveValue("");
  await expect(save).toBeDisabled();
  await page.getByLabel("Motivo del cambio", { exact: true }).fill("Revisión terminada");
  await page.getByRole("checkbox").check(); await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(commands).toHaveLength(3); expect(commands[0].payloadHash).toBe(commands[1].payloadHash);
  expect(commands[2]).toMatchObject({ availabilityRule: "CONDITION_BASED", changeReason: "Revisión terminada", acknowledgeImpact: true, expectedVersion: 1 });
  expect(fixture.unexpected).toEqual([]);
});

test("lost use response survives other sections and reload and retries exactly once on request", async ({ page }) => {
  const fixture = await configurationSession(page);
  const commands: Record<string, unknown>[] = [];
  await page.route("**/api/materials/warehouse-uses", async (route) => {
    const raw = route.request().postDataJSON(); commands.push(raw);
    normalizeWarehouseAreaUseCreate(raw);
    const row = { ...USE, name: "Uso con respuesta perdida" };
    fixture.setConfiguration({ ...fixture.getConfiguration(), areaUses: [row] });
    if (commands.length === 1) return route.abort("failed");
    return fulfill(route, row, 201);
  });
  await page.goto("/warehouses/configuration");
  await page.getByRole("button", { name: "Nuevo uso", exact: true }).click();
  await page.getByLabel("Nombre del uso", { exact: true }).fill("Uso con respuesta perdida");
  await page.getByLabel("Destino orientativo", { exact: true }).selectOption("INTERNAL");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await selectSection(page, "/warehouses/spaces");
  await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Ir al guardado pendiente", exact: true }).click();
  await expect(page.getByLabel("Nombre del uso", { exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Nombre del uso", { exact: true })).toHaveValue("Uso con respuesta perdida");
  await expect(page.getByLabel("Nombre del uso", { exact: true })).toBeDisabled();
  expect(commands).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByTestId("warehouse-use-row")).toHaveCount(1);
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("osi-plus.warehouses.pending.v1:")).length)).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});

test("an uncertain location change remains locked after pre-receipt denial and keeps its exact payload", async ({ page }) => {
  const fixture = await configurationSession(page);
  const commands: Record<string, unknown>[] = [];
  await page.route(`**/api/materials/warehouses/locations/${ZONE_REF}/configuration`, async (route) => {
    const raw = route.request().postDataJSON(); commands.push(raw);
    const input = normalizeWarehouseLocationConfiguration(raw, ZONE_REF);
    if (commands.length === 1) return route.abort("failed");
    if (commands.length === 2) return fulfill(route, "WAREHOUSE_CONFIGURATION_FORBIDDEN", 403);
    const saved = configuration(ZONE_REF, { version: 1, configRef: CONFIG_REF, characteristics: input.characteristics });
    fixture.setConfiguration({ ...fixture.getConfiguration(), locations: [configuration(ROOT_REF), saved, configuration(BIN_REF)] });
    return fulfill(route, saved);
  });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Configurar Zona sintética", exact: true }).click();
  await page.getByLabel("Características", { exact: true }).fill("Texto conservado");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await selectSection(page, "/warehouses/configuration");
  await expect(page.getByRole("button", { name: "Nuevo uso", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Ir al guardado pendiente", exact: true }).click();
  await expect(page).toHaveURL(/\/warehouses\/spaces$/);
  await expect(page.getByLabel("Características", { exact: true })).toHaveValue("Texto conservado");
  await page.reload();
  await expect(page.getByLabel("Características", { exact: true })).toHaveValue("Texto conservado");
  await expect(page.getByLabel("Características", { exact: true })).toBeDisabled();
  expect(commands).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("El guardado anterior sigue sin confirmar");
  await expect(page.getByLabel("Características", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(commands).toHaveLength(3); expect(commands[1]).toEqual(commands[0]); expect(commands[2]).toEqual(commands[0]);
  expect(fixture.unexpected).toEqual([]);
});

test("a recovered intent can be corrected after confirmed domain rejection with a fresh request identity", async ({ page }) => {
  const fixture = await configurationSession(page);
  const commands: Record<string, unknown>[] = [];
  await page.route("**/api/materials/warehouse-uses", async (route) => {
    const raw = route.request().postDataJSON(); commands.push(raw);
    const input = normalizeWarehouseAreaUseCreate(raw);
    if (commands.length === 1) return route.abort("failed");
    if (commands.length === 2) return fulfill(route, "WAREHOUSE_AREA_USE_NAME_CONFLICT", 409);
    const row = { ...USE, name: input.name };
    fixture.setConfiguration({ ...fixture.getConfiguration(), areaUses: [row] });
    return fulfill(route, row, 201);
  });
  await page.goto("/warehouses/configuration");
  await page.getByRole("button", { name: "Nuevo uso", exact: true }).click();
  await page.getByLabel("Nombre del uso", { exact: true }).fill("Nombre ocupado");
  await page.getByLabel("Destino orientativo", { exact: true }).selectOption("INTERNAL");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await page.reload();
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ya existe un uso con ese nombre");
  await expect(page.getByLabel("Nombre del uso", { exact: true })).toBeEnabled();
  await page.getByLabel("Nombre del uso", { exact: true }).fill("Nombre corregido");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByTestId("warehouse-use-row")).toContainText("Nombre corregido");
  expect(commands).toHaveLength(3); expect(commands[1]).toEqual(commands[0]);
  expect(commands[2].name).toBe("Nombre corregido"); expect(commands[2].requestId).not.toBe(commands[0].requestId);
  expect(commands[2].payloadHash).not.toBe(commands[0].payloadHash);
  expect(fixture.unexpected).toEqual([]);
});
