import { expect, test, type Page } from "@playwright/test";
import type { TransportCalculateInput, TransportCalculation, TransportPublication, TransportPurpose, TransportResult, TransportZone, TransportZoneInput } from "../../shared/logisticsTransport";

const CASE = "118f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP = "228f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const VISIT = "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ZONE = "448f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const VEHICLE = "cmtransporttestvehicle000001";
const permissions = ["pipeline:view", "membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status", "logistics:rules:view", "logistics:rules:manage", "logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "costing:rules:view", "costing:rules:manage", "costing:view", "costing:calculate", "costing:publish"];
const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });

function editableZone(): TransportZone {
  return {
    ruleRef: ZONE, seriesRef: ZONE, version: 1, code: "SYNTHETIC_UI", name: "Zona de prueba", zoneType: "INTERIOR", priority: 100, vehicleType: null,
    purposes: ["QUOTE"], geometry: { type: "Polygon", coordinates: [[[-70, 18], [-69, 18], [-69, 19], [-70, 18]]] }, mode: "ITEMIZED", factor: null, currency: "DOP",
    kmPerGallon: null, gallonUnit: "US", fuelType: null, includedConcepts: [], state: "DRAFT", validFrom: null, validTo: null,
    components: [{ code: "BASE", label: "Base de prueba", kind: "BASE", basis: "TRIP", unitCost: "1000", classification: "PR", minimumMarginBps: 2000, recommendedMarginBps: 2500, includedConcepts: [], costRuleRef: ZONE, costRuleVersion: 1 }],
  };
}

async function session(page: Page, grants = permissions, denied: string[] = []) {
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.transport.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Prueba transporte", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Empresa de prueba", role: "A", preferred: true }] }));
  }, { membershipRef: MEMBERSHIP });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { name: "Prueba transporte", role: "A", status: "ACTIVE", permissions: grants, deniedPermissions: denied, membership: { membershipRef: MEMBERSHIP, tenantName: "Empresa de prueba", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP, tenantName: "Empresa de prueba", role: "A", preferred: true }] } }) }));
  await page.route("**/api/admin/memberships**", (route) => route.fulfill({ ...json([]), body: JSON.stringify({ ok: true, data: [], total: 0, page: 1, pageSize: 20 }) }));
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==", "base64") }));
  await page.route("**/api/logistics/rules", (route) => route.fulfill(json([])));
}

function result(input: TransportCalculateInput): TransportResult {
  const journey = input.journeys[0];
  const toll = journey.quantities.TOLL ?? null;
  const common = { journeyRef: journey.journeyRef, zoneRuleRef: ZONE, zoneVersion: 1, zoneCode: "SYNTHETIC_UI", zoneType: "INTERIOR" as const, currency: "DOP", costRuleRef: ZONE, costRuleVersion: 1, factor: null, distanceKm: "160.0000" };
  return {
    context: { contract: "V17_TRANSPORT_ZONES_V1", purpose: input.purpose, contextRef: input.contextRef },
    lines: [
      { ...common, componentCode: "FUEL", concept: "Combustible de prueba", kind: "FUEL", basis: "GALLON", quantity: "20.0000", unit: "GALLON", unitCost: "100", baseUnitCost: "100", totalCost: "2000", kmPerGallon: "8", gallonUnit: "US", fuelType: "Diésel de prueba" },
      { ...common, componentCode: "TOLL", concept: "Peaje de prueba", kind: "TOLL", basis: "PASS", quantity: toll, unit: "PASS", unitCost: "60", baseUnitCost: "60", totalCost: toll === null ? null : String(Number(toll) * 60), kmPerGallon: null, gallonUnit: null, fuelType: null },
    ],
    issues: toll === null ? [{ code: "TRANSPORT_QUANTITY_PENDING", message: "Complete los pasos de peaje.", journeyRef: journey.journeyRef, severity: "BLOCKER" }] : [],
    totals: [{ currency: "DOP", amount: toll === null ? null : String(2000 + Number(toll) * 60) }], complete: toll !== null,
  };
}

async function calculator(page: Page, options: { lostPublishResponse?: boolean; mismatchedPublication?: boolean } = {}) {
  const calculations: TransportCalculation[] = [];
  const publications = new Map<string, TransportPublication>();
  const queries: URLSearchParams[] = [];
  let publishes = 0;
  await page.route("**/api/logistics/transport/zones", (route) => route.fulfill(json([])));
  await page.route("**/api/logistics/transport/context?**", (route) => route.fulfill(json({ cases: [{ caseRef: CASE, label: "CASO-PRUEBA-01", mode: "LOCAL" }], visits: [{ contextRef: VISIT, label: "Visita de prueba" }], vehicles: [{ vehicleRef: VEHICLE, businessCode: "VEH-PRUEBA", vehicleType: "Camión de prueba" }] })));
  await page.route("**/api/logistics/transport/plans?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const published = publications.get(`${query.get("purpose")}:${query.get("contextRef") || ""}`) || null;
    if (options.mismatchedPublication) return route.fulfill(json({ context: { contract: "V17_TRANSPORT_ZONES_V1", purpose: "VISIT", contextRef: VISIT }, input: { caseRef: CASE, purpose: "VISIT", contextRef: VISIT } }));
    return route.fulfill(json(published));
  });
  await page.route("**/api/logistics/transport/calculate", async (route) => {
    const command = route.request().postDataJSON();
    expect(route.request().headers()["x-osi-membership-ref"]).toBe(MEMBERSHIP);
    expect(command.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(command.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    const input = Object.fromEntries(Object.entries(command).filter(([key]) => key !== "requestId" && key !== "payloadHash")) as TransportCalculateInput;
    const calculation: TransportCalculation = { calculationRef: `558f6d8f-8d11-4f39-8a2d-1b6c7e8f90${String(calculations.length + 1).padStart(2, "0")}`, status: "CALCULATED", inputHash: "a".repeat(64), resultHash: "b".repeat(64), calculatedAt: "2026-10-31T12:00:00.000Z", input, result: result(input) };
    calculations.push(calculation);
    await route.fulfill(json(calculation));
  });
  await page.route("**/api/logistics/transport/publish", async (route) => {
    publishes += 1;
    const calculation = calculations.find((row) => row.calculationRef === route.request().postDataJSON().calculationRef)!;
    const published: TransportPublication = { revisionRef: "668f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", revision: 1, publishedAt: "2026-10-31T12:02:00.000Z", calculationRef: calculation.calculationRef, context: calculation.result.context, result: calculation.result, input: calculation.input };
    publications.set(`${published.context.purpose}:${published.context.contextRef || ""}`, published);
    if (options.lostPublishResponse) await route.abort("failed"); else await route.fulfill(json(published));
  });
  return { calculations, queries, publishes: () => publishes };
}

async function selectContext(page: Page, purpose: TransportPurpose) {
  await page.goto("/administration/logistics");
  await page.getByRole("tab", { name: "Calcular transporte", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Caso", exact: true })).toBeEnabled();
  await page.getByRole("combobox", { name: "Caso", exact: true }).selectOption(CASE);
  await page.getByRole("combobox", { name: "Uso del cálculo", exact: true }).selectOption(purpose);
  if (purpose === "VISIT") {
    await expect(page.getByRole("combobox", { name: "Visita presencial", exact: true })).toBeEnabled();
    await page.getByRole("combobox", { name: "Visita presencial", exact: true }).selectOption(VISIT);
  }
}

async function fillJourney(page: Page) {
  const form = page.getByTestId("transport-calculation-form");
  await expect(form.getByLabel("Inicio del desplazamiento *")).toBeEnabled();
  await form.getByLabel("Inicio del desplazamiento *").fill("2026-11-10T08:00");
  await form.getByLabel("Fin del desplazamiento *").fill("2026-11-10T17:00");
  await form.getByRole("combobox", { name: "Vehículo de flota", exact: true }).selectOption(VEHICLE);
  await form.getByLabel("Latitud de salida del recorrido 1", { exact: true }).fill("18.5");
  await form.getByLabel("Longitud de salida del recorrido 1", { exact: true }).fill("-69.9");
  await form.getByLabel("Latitud de destino del recorrido 1", { exact: true }).fill("19.0");
  await form.getByLabel("Longitud de destino del recorrido 1", { exact: true }).fill("-70.7");
  await form.getByLabel("Km viales", { exact: true }).fill("80");
  await form.getByLabel("Fuente del recorrido vial").fill("Fuente sintética del escenario UI");
  await form.getByLabel("Añadir regreso").check();
}

test("una zona conserva perímetro real trazado y tarifas pendientes, con campos compactos", async ({ page }, testInfo) => {
  await session(page);
  const saved: TransportZone[] = [];
  let input: TransportZoneInput | null = null;
  await page.route("**/api/logistics/transport/zones", async (route) => {
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON();
      input = Object.fromEntries(Object.entries(command).filter(([key]) => key !== "requestId" && key !== "payloadHash")) as TransportZoneInput;
      const zone: TransportZone = { ...input, code: "SYNTHETIC_UI", ruleRef: ZONE, seriesRef: ZONE, version: 1, validFrom: null, validTo: null, components: input.components.map((row, index) => ({ ...row, code: `SYNTHETIC_ROW_${index + 1}`, costRuleRef: ZONE, costRuleVersion: 1 })) };
      saved.push(zone);
      return route.fulfill(json(zone));
    }
    return route.fulfill(json(saved));
  });
  await page.goto("/administration/logistics");
  await page.getByRole("button", { name: "Nueva zona", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: /Código/ })).toHaveCount(0);
  await dialog.getByLabel("Nombre *", { exact: true }).fill("Perímetro de prueba local");
  await dialog.getByRole("button", { name: "Trazar perímetro", exact: true }).click();
  const map = dialog.getByRole("region", { name: "Mapa de la geocerca" });
  await expect(map.getByRole("button", { name: "Acercar", exact: true })).toBeVisible();
  await map.click({ position: { x: 100, y: 100 } });
  await map.click({ position: { x: 260, y: 100 } });
  await map.click({ position: { x: 190, y: 220 } });
  await dialog.getByRole("button", { name: "Terminar trazado" }).click();
  await expect(dialog.getByText("Coordenadas · 3 puntos")).toBeVisible();
  await dialog.getByRole("button", { name: "Añadir renglón", exact: true }).click();
  await dialog.getByLabel("Concepto del renglón 1").selectOption("FUEL");
  await dialog.getByLabel("Nombre del renglón 1").fill("Combustible pendiente");
  const expectedHeight = testInfo.project.name.includes("mobile") ? 32 : 28;
  for (const control of [dialog.getByLabel("Nombre *", { exact: true }), dialog.getByLabel("Concepto del renglón 1"), dialog.getByLabel("Rendimiento km/gal")]) {
    const height = await control.evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBe(expectedHeight);
  }
  expect(await dialog.getByLabel("Rendimiento km/gal").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(110);
  expect(await dialog.getByTestId("transport-zone-scroll").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  if (process.env.CAPTURE_TRANSPORT_UI === "true") await page.screenshot({ animations: "disabled", path: testInfo.outputPath("transport-zone-editor.png") });
  await dialog.getByRole("button", { name: "Guardar zona", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(input).not.toBeNull();
  const submitted = input as unknown as TransportZoneInput;
  expect(submitted.code).toBeNull();
  expect(submitted.components[0].code).toBeNull();
  expect(submitted.geometry.coordinates[0]).toHaveLength(4);
  expect(submitted.geometry.coordinates[0][0]).toEqual(submitted.geometry.coordinates[0][3]);
  expect(submitted.components[0].unitCost).toBeNull();
  expect(submitted.kmPerGallon).toBeNull();
  await expect(page.getByRole("cell", { name: "Perímetro de prueba local SYNTHETIC_UI" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});

test("los números se reemplazan completos sin flechas y conservan límites antes de guardar", async ({ page }) => {
  await session(page);
  const original = editableZone();
  const commands: TransportZoneInput[] = [];
  await page.route("**/api/logistics/transport/zones", async (route) => {
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON() as TransportZoneInput;
      commands.push(command);
      return route.fulfill(json({ ...original, ...command, version: 2 }));
    }
    return route.fulfill(json([original]));
  });
  await page.goto("/administration/logistics");
  await page.getByRole("button", { name: "Editar zona", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const priority = dialog.getByLabel("Prioridad", { exact: true });
  const save = dialog.getByRole("button", { name: "Guardar nueva versión", exact: true });
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  await dialog.getByLabel("Nombre *", { exact: true }).focus();
  await priority.click();
  expect(await priority.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 3]);
  await priority.pressSequentially("125");
  await expect(priority).toHaveValue("125");
  await priority.press("ArrowUp");
  await priority.press("ArrowDown");
  await priority.hover();
  await page.mouse.wheel(0, 300);
  await expect(priority).toHaveValue("125");
  await priority.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(priority).toBeFocused();
  expect(await priority.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 3]);

  for (const value of ["", "10000", "100.5", "abc"]) {
    await priority.fill(value);
    await save.click();
    await expect(priority).toBeFocused();
    expect(await priority.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);
    expect(commands).toHaveLength(0);
  }
  await priority.fill("125");
  const rate = dialog.getByLabel("Tarifa del renglón 1");
  for (const value of ["-1", "0.0000001"]) {
    await rate.fill(value);
    expect(await rate.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);
    await save.click();
    expect(commands).toHaveLength(0);
  }
  await rate.fill("0");
  expect(await rate.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  await rate.fill("");
  expect(await rate.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  const margin = dialog.getByLabel("Margen recomendado del renglón 1");
  await margin.fill("100");
  expect(await margin.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);
  await save.click();
  expect(commands).toHaveLength(0);
  await margin.fill("25");
  await dialog.getByText("Coordenadas · 3 puntos", { exact: true }).click();
  const longitude = dialog.getByLabel("Longitud del punto 1", { exact: true });
  await longitude.fill("-70.5");
  expect(await longitude.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ code: "SYNTHETIC_UI", priority: 125, components: [{ code: "BASE", unitCost: null }] });
  expect(commands[0].geometry.coordinates[0][0][0]).toBe(-70.5);
});

test("las ayudas comparan parámetros con ejemplos sin cargar tarifas ni cambiar la ficha", async ({ page }, testInfo) => {
  await session(page);
  let writes = 0;
  await page.route("**/api/logistics/transport/zones", (route) => {
    if (route.request().method() !== "GET") writes += 1;
    return route.fulfill(json([editableZone()]));
  });
  await page.goto("/administration/logistics");
  await page.getByRole("button", { name: "Editar zona", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Nueva versión de zona", exact: true });
  const closeHelp = async (title: string) => {
    const help = page.getByRole("dialog", { name: title, exact: true });
    await help.getByRole("button", { name: "Cerrar ayuda", exact: true }).click();
    await expect(help).toHaveCount(0);
  };
  await editor.getByRole("button", { name: "Ayuda de Prioridad de la zona", exact: true }).click();
  await expect(page.getByText(/Cambiar de 100 a 101 no aumenta el costo de transporte/)).toBeVisible();
  await closeHelp("Prioridad de la zona");
  await editor.getByRole("combobox", { name: "Forma de cálculo", exact: true }).selectOption("FACTOR");
  await editor.getByRole("button", { name: "Ayuda de Factor de la zona", exact: true }).click();
  await expect(page.getByText(/factor 1.25 cuesta 1,250/)).toBeVisible();
  await closeHelp("Factor de la zona");
  await expect(editor.getByLabel("Factor", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Tarifa del renglón 1")).toHaveValue("1000");
  await editor.getByRole("button", { name: "Añadir renglón", exact: true }).click();
  await editor.getByLabel("Concepto del renglón 2").selectOption("FUEL");
  await expect(editor.getByLabel("Nombre del renglón 2")).toHaveValue("Combustible");
  await editor.getByLabel("Nombre del renglón 2").fill("Combustible personalizado");
  await editor.getByLabel("Concepto del renglón 2").selectOption("OTHER");
  await expect(editor.getByLabel("Nombre del renglón 2")).toHaveValue("Combustible personalizado");
  await editor.getByLabel("Concepto del renglón 2").selectOption("FUEL");
  await editor.getByRole("button", { name: "Ayuda de Rendimiento de combustible", exact: true }).click();
  await expect(page.getByText(/160 km.*8 km\/gal.*20 galones.*10 km\/gal.*16/)).toBeVisible();
  await expect(page.getByText(/costo baja de 5,000 a 4,000/)).toBeVisible();
  await closeHelp("Rendimiento de combustible");
  await expect(editor.getByLabel("Rendimiento km/gal", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Tarifa del renglón 2")).toHaveValue("");
  await editor.getByRole("button", { name: "Ayuda de Base del renglón", exact: true }).click();
  await expect(page.getByText(/2 personas × 3 días = 6 unidades/)).toBeVisible();
  await closeHelp("Base del renglón");
  await editor.getByRole("button", { name: "Ayuda de Tarifa del renglón", exact: true }).click();
  await expect(page.getByText(/2 pasos × 100 = 200/)).toBeVisible();
  await closeHelp("Tarifa del renglón");
  await editor.getByRole("button", { name: "Ayuda de Márgenes del renglón", exact: true }).click();
  await expect(page.getByText(/al subir a 25 % propone 1,333.33.*El costo sigue siendo 1,000/)).toBeVisible();
  await expect(page.getByText(/vender a 1,200 deja 16.67 % y requiere autorización/)).toBeVisible();
  if (process.env.CAPTURE_TRANSPORT_UI === "true") await page.screenshot({ animations: "disabled", path: testInfo.outputPath("transport-cost-help.png") });
  await closeHelp("Márgenes del renglón");
  expect(writes).toBe(0);
});

for (const purpose of ["QUOTE", "SERVICE", "VISIT"] as const) test(`${purpose}: calcula pendientes y publica exclusivamente el contexto elegido`, async ({ page }) => {
  await session(page);
  const backend = await calculator(page);
  await selectContext(page, purpose);
  await fillJourney(page);
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await expect(page.getByTestId("transport-calculation-result").getByText("Datos pendientes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar costo de transporte" })).toBeDisabled();
  await page.getByLabel("Peaje de prueba del recorrido 1").fill("2");
  await expect(page.getByText("Cambios por calcular", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await expect(page.getByTestId("transport-calculation-result").getByText("Completo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publicar costo de transporte" }).click();
  await expect(page.getByRole("button", { name: "Publicado", exact: true })).toBeDisabled();
  expect(backend.calculations).toHaveLength(2);
  expect(backend.calculations[1].input).toMatchObject({ caseRef: CASE, purpose, contextRef: purpose === "VISIT" ? VISIT : null, journeys: [{ vehicleRef: VEHICLE, vehicleType: "Camión de prueba", distanceKm: "80", returnToOrigin: true, trips: 1, quantities: { TOLL: "2" } }] });
  expect(backend.publishes()).toBe(1);
  expect(backend.queries.some((query) => query.get("purpose") === purpose && query.get("contextRef") === (purpose === "VISIT" ? VISIT : null))).toBe(true);
  await expect(page.getByTestId("transport-publication")).toContainText(PURPOSE_LABEL[purpose]);
});
const PURPOSE_LABEL = { QUOTE: "Cotización", SERVICE: "Servicio", VISIT: "Visita presencial" };

test("publicación con respuesta perdida se consulta sin repetir el envío", async ({ page }) => {
  await session(page);
  const backend = await calculator(page, { lostPublishResponse: true });
  await selectContext(page, "QUOTE");
  await fillJourney(page);
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await page.getByLabel("Peaje de prueba del recorrido 1").fill("0");
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await page.getByRole("button", { name: "Publicar costo de transporte" }).click();
  await expect(page.getByText(/No se confirmó la publicación/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar costo de transporte" })).toBeDisabled();
  await page.getByRole("button", { name: "Consultar publicación", exact: true }).click();
  await expect(page.getByText("Publicación confirmada · revisión 1.", { exact: true })).toBeVisible();
  expect(backend.publishes()).toBe(1);
});

test("una publicación de otro contexto no se muestra ni habilita cálculos", async ({ page }) => {
  await session(page);
  await calculator(page, { mismatchedPublication: true });
  await selectContext(page, "QUOTE");
  await expect(page.getByRole("alert")).toContainText("no corresponde a este caso");
  await expect(page.getByTestId("transport-publication")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calcular transporte", exact: true })).toBeDisabled();
});

test("los permisos monetarios denegados impiden cargar zonas y cálculos", async ({ page }) => {
  await session(page, permissions, ["costing:rules:view", "costing:view"]);
  let requests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/logistics/transport/")) requests += 1; });
  await page.goto("/administration/logistics");
  await expect(page.getByTestId("logistics-rules-admin")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Zonas y costos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Calcular transporte", exact: true })).toHaveCount(0);
  expect(requests).toBe(0);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /TransportZoneMap|TransportZonesAdmin|TransportCalculationPanel|leaflet/.test(entry.name)))).toBe(false);
});

test("el acceso de consulta no concede cálculo ni publicación", async ({ page }) => {
  await session(page, permissions.filter((permission) => !["costing:calculate", "costing:publish", "logistics:plan:calculate", "logistics:plan:publish"].includes(permission)));
  const backend = await calculator(page);
  await selectContext(page, "SERVICE");
  await expect(page.getByText("Este contexto todavía no tiene un costo de transporte publicado.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("transport-calculation-form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calcular transporte", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publicar costo de transporte" })).toHaveCount(0);
  expect(backend.calculations).toHaveLength(0);
  expect(backend.publishes()).toBe(0);
});

test("el guardado incierto de zona bloquea nuevas escrituras hasta consultar el listado", async ({ page }) => {
  await session(page);
  let posts = 0;
  let zone: TransportZone = editableZone();
  await page.route("**/api/logistics/transport/zones", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      zone = { ...zone, version: 2 };
      return route.abort("failed");
    }
    return route.fulfill(json([zone]));
  });
  await page.goto("/administration/logistics");
  await page.getByRole("button", { name: "Editar zona", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Guardar nueva versión", exact: true }).click();
  await expect(dialog.getByText(/No se confirmó el guardado/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Guardar nueva versión", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cerrar zona", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nueva zona", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Actualizar zonas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nueva zona", exact: true })).toBeEnabled();
  await expect(page.getByRole("cell", { name: "v2", exact: true })).toBeVisible();
  expect(posts).toBe(1);
});
