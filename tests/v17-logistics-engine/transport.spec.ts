import { expect, test, type Page } from "@playwright/test";
import type { TransportCalculateInput, TransportCalculation, TransportPublication, TransportResult, TransportZone, TransportZoneInput } from "../../shared/logisticsTransport";
import type { LogisticsBase, LogisticsGeographyCommand, MetroPerimeter } from "../../src/logistics-engine/transportApi";

const CASE = "118f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP = "228f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const VISIT = "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ZONE = "448f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const VEHICLE = "cmtransporttestvehicle000001";
const permissions = ["pipeline:view", "services:case:view", "membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status", "logistics:rules:view", "logistics:rules:manage", "logistics:plan:view", "logistics:plan:calculate", "logistics:plan:publish", "costing:rules:view", "costing:rules:manage", "costing:view", "costing:calculate", "costing:publish"];
const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });

function editableZone(): TransportZone {
  return {
    ruleRef: ZONE, seriesRef: ZONE, version: 1, code: "SYNTHETIC_UI", name: "Zona de prueba", locationType: "CITY", city: "Ciudad de prueba", sector: null, baseName: "Base de prueba", baseAddress: "Dirección de prueba", referenceDistanceKm: "80", referenceDistanceSource: "Ruta de prueba", zoneType: "INTERIOR", priority: 100, vehicleType: null,
    purposes: ["VISIT"], geometry: { type: "Polygon", coordinates: [[[-70, 18], [-69, 18], [-69, 19], [-70, 18]]] }, mode: "ITEMIZED", factor: null, currency: "DOP",
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
  await page.route("https://nominatim.openstreetmap.org/search**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") || "";
    const destination = /destino|santiago/i.test(query);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        lat: destination ? "19.0" : "18.5",
        lon: destination ? "-70.7" : "-69.9",
        display_name: destination ? "Destino de prueba, Santiago, República Dominicana" : "Base de prueba, Santo Domingo, República Dominicana",
        address: { country_code: "do" },
      }]),
    });
  });
  await page.route("https://nominatim.openstreetmap.org/reverse**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const destination = Number(params.get("lat")) > 18.75;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        lat: destination ? "19.0" : "18.5",
        lon: destination ? "-70.7" : "-69.9",
        display_name: destination ? "Destino de prueba, Santiago, República Dominicana" : "Base de prueba, Santo Domingo, República Dominicana",
        address: { country_code: "do" },
      }),
    });
  });
  await page.route("https://router.project-osrm.org/route/v1/driving/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: "Ok", routes: [{ distance: 80_000, duration: 5_400 }] }),
  }));
  await page.route("**/api/logistics/rules", (route) => route.fulfill(json([])));
  await page.route("**/api/logistics/transport/geography", (route) => route.fulfill(json({ bases: [], metro: null })));
}

function result(input: TransportCalculateInput): TransportResult {
  const journey = input.journeys[0];
  const toll = journey.quantities.TOLL ?? null;
  const common = { journeyRef: journey.journeyRef, zoneRuleRef: ZONE, zoneVersion: 1, zoneCode: "SYNTHETIC_UI", zoneType: "INTERIOR" as const, currency: "DOP", costRuleRef: ZONE, costRuleVersion: 1, factor: null, distanceKm: "160.0000", distanceSource: "Ruta de prueba" };
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
  const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
  await page.route(/\/api\/crm\/pipeline-cases(?:\?.*)?$/, (route) => route.fulfill({
    status: 200, contentType: "application/json", headers: privateHeaders,
    body: JSON.stringify({ ok: true, data: [], total: 0, page: 1, pageSize: 25 }),
  }));
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({
    ...json({ total: 0, assigned: 0, unassigned: 0, byStatus: {}, sla: { overdue: null, basis: "UNAVAILABLE" } }),
    headers: privateHeaders,
  }));
  await page.route(`**/api/crm/pipeline-cases/${CASE}`, (route) => route.fulfill({
    ...json({
      caseRef: CASE, caseCode: "CASO-PRUEBA-01", version: 3, mode: "LOCAL", status: "REQUIREMENTS_CONFIRMED",
      createdAt: "2026-10-30T12:00:00.000Z", updatedAt: "2026-10-31T12:00:00.000Z",
      serviceType: "MOVING_LOCAL", customerType: "L4_PERSONAL", estimatedCbm: 10, requiresSurvey: false, surveyMethod: "NO_APLICA",
      originLocation: "Santo Domingo", destinationLocation: "Santiago", destinationContracted: true, assetsCount: 0, quoteCount: 0, eventCount: 0,
      client: { clientRef: VISIT, displayName: "Cliente de prueba", type: "INDIVIDUAL", status: "ACTIVE" },
      owner: { displayName: "Asesor de prueba", isCurrentActor: true },
      route: {
        revision: 3,
        origin: { compactAddress: "Base de prueba, Santo Domingo, DO", area: "UNAVAILABLE", areaSource: "UNAVAILABLE" },
        destination: { compactAddress: "Destino de prueba, Santiago, DO", area: "UNAVAILABLE", areaSource: "UNAVAILABLE" },
      },
    }), headers: privateHeaders,
  }));
  await page.route("**/api/costing/revisions/**", (route) => route.fulfill(json(null)));
  await page.route(`**/api/crm/pipeline-cases/${CASE}/route?travel=1`, (route) => route.fulfill({
    ...json({ revision: 3, bases: [], base: null, terminal: null, foreignOrigin: false, foreignDestination: false,
      area: { origin: null, destination: null }, distanceKm: null, estimated: false, legs: [], preparation: [] }),
    headers: privateHeaders,
  }));
  await page.route("**/api/crm/services/cases/**", (route) => route.fulfill({
    ...json({ caseRef: CASE, mode: "LOCAL", selection: { selectionRef: null, revision: 0, primary: null, complementaries: [], otherServices: [] }, primaries: [], allowedComplementaries: [], defaults: [] }),
    headers: privateHeaders,
  }));
  await page.route("**/api/logistics/transport/zones", (route) => route.fulfill(json([])));
  await page.route("**/api/logistics/transport/context?**", (route) => route.fulfill(json({ referenceBases: [{ name: "Oficina de prueba", address: "Avenida de prueba, Santo Domingo" }], cases: [{ caseRef: CASE, label: "CASO-PRUEBA-01", mode: "LOCAL" }], visits: [{ contextRef: VISIT, label: "Visita de prueba" }], vehicles: [{ vehicleRef: VEHICLE, businessCode: "VEH-PRUEBA", vehicleType: "Camión de prueba" }] })));
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
    const published: TransportPublication = { revisionRef: "668f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", revision: 1, publishedAt: "2026-10-31T12:02:00.000Z", calculationRef: calculation.calculationRef, context: calculation.result.context, routeRevision: 3, result: calculation.result, input: calculation.input };
    publications.set(`${published.context.purpose}:${published.context.contextRef || ""}`, published);
    if (options.lostPublishResponse) await route.abort("failed"); else await route.fulfill(json(published));
  });
  return { calculations, queries, publishes: () => publishes };
}

async function openCosting(page: Page) {
  await page.goto(`/commercial/cases/${CASE}`);
  const serviceRoute = page.getByRole("region", { name: "Ruta para cotizar" });
  await expect(serviceRoute).toContainText("Base de prueba, Santo Domingo, DO");
  await expect(serviceRoute).toContainText("Destino de prueba, Santiago, DO");
  await serviceRoute.getByRole("button", { name: "Ver costo de transporte" }).click();
  await expect(page.getByTestId("transport-calculation-panel")).toBeVisible();
}

async function fillJourney(page: Page) {
  const form = page.getByTestId("transport-calculation-form");
  await expect(form.locator("input[type=datetime-local]")).toHaveCount(0);
  await form.getByRole("combobox", { name: "Vehículo de flota", exact: true }).selectOption(VEHICLE);
  await expect(form.getByLabel(/Latitud|Longitud/)).toHaveCount(0);
  await form.getByRole("button", { name: "Ubicar salida en mapa", exact: true }).click();
  await expect(form.getByLabel("Buscar dirección de salida", { exact: true })).toHaveValue("Base de prueba, Santo Domingo, DO");
  await form.getByRole("button", { name: "Base de prueba, Santo Domingo, República Dominicana", exact: true }).click();
  await expect(form.getByLabel("Buscar dirección de destino", { exact: true })).toHaveValue("Destino de prueba, Santiago, DO");
  await form.getByRole("button", { name: "Destino de prueba, Santiago, República Dominicana", exact: true }).click();
  await expect(form.getByLabel("Distancia vial calculada")).toContainText("80.00 km");
  await form.getByLabel("Regreso", { exact: true }).check();
}

test("una ciudad o sector conserva perímetro real trazado y tarifas pendientes, con campos compactos", async ({ page }, testInfo) => {
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
  await page.getByRole("button", { name: "Nueva ciudad o sector", exact: true }).click();
  const dialog = page.getByTestId("transport-zone-form");
  await expect(dialog.getByRole("textbox", { name: /Código/ })).toHaveCount(0);
  await dialog.getByLabel("Nombre del perfil *", { exact: true }).fill("Perímetro de prueba local");
  await dialog.getByLabel("Ciudad *", { exact: true }).fill("Santo Domingo");
  await dialog.getByRole("button", { name: "Trazar perímetro", exact: true }).click();
  const map = dialog.getByRole("region", { name: "Mapa de la geocerca" });
  await expect(map.getByRole("button", { name: "Acercar", exact: true })).toBeVisible();
  await map.click({ position: { x: 100, y: 100 } });
  await map.click({ position: { x: 260, y: 100 } });
  await map.click({ position: { x: 190, y: 220 } });
  await dialog.getByRole("button", { name: "Terminar trazado" }).click();
  await expect(dialog.getByText("Coordenadas · 3 puntos")).toBeVisible();
  await dialog.getByRole("tab", { name: "Operación y costos" }).click();
  await dialog.getByLabel("Base operativa", { exact: true }).fill("Oficina de prueba");
  await dialog.getByLabel("Dirección de la base", { exact: true }).fill("Base principal de prueba");
  await dialog.getByText("Visitas presenciales", { exact: true }).click();
  await dialog.getByRole("button", { name: "Añadir renglón", exact: true }).click();
  await dialog.getByLabel("Concepto del renglón 1").selectOption("FUEL");
  await dialog.getByLabel("Nombre del renglón 1").fill("Combustible pendiente");
  const expectedHeight = testInfo.project.name.includes("mobile") ? 32 : 28;
  for (const control of [dialog.getByLabel("Base operativa", { exact: true }), dialog.getByLabel("Concepto del renglón 1"), dialog.getByLabel("Rendimiento km/gal")]) {
    const height = await control.evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBe(expectedHeight);
  }
  expect(await dialog.getByLabel("Rendimiento km/gal").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(110);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  if (process.env.CAPTURE_TRANSPORT_UI === "true") await page.screenshot({ animations: "disabled", path: testInfo.outputPath("transport-zone-editor.png") });
  await dialog.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(input).not.toBeNull();
  const submitted = input as unknown as TransportZoneInput;
  expect(submitted.code).toBeNull();
  expect(submitted.components[0].code).toBeNull();
  expect(submitted.geometry.coordinates[0]).toHaveLength(4);
  expect(submitted.geometry.coordinates[0][0]).toEqual(submitted.geometry.coordinates[0][3]);
  expect(submitted.components[0].unitCost).toBeNull();
  expect(submitted.kmPerGallon).toBeNull();
  await expect(page.getByText("Perímetro de prueba local", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});

test("buscar en el mapa guarda primero el perímetro y permite reutilizar una base al activarlo", async ({ page }, testInfo) => {
  await session(page);
  const base = editableZone();
  const newRef = "448f6d8f-8d11-4f39-8a2d-1b6c7e8f4015";
  const commands: TransportZoneInput[] = [];
  const geometry = { type: "Polygon" as const, coordinates: [[[-70.75, 19.08], [-70.6, 19.08], [-70.6, 19.2], [-70.75, 19.08]]] };
  let zone: TransportZone | null = null;
  let queries = 0;
  await page.route("https://photon.komoot.io/**", (route) => {
    queries += 1;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("countrycode")).toBe("DO");
    expect(params.has("lang")).toBe(false);
    return route.fulfill({ json: { features: [{ geometry: { type: "Point", coordinates: [-70.633, 19.123] }, properties: {
      osm_id: 123, osm_type: "R", type: "city", name: "Jarabacoa", state: "La Vega", countrycode: "DO",
    } }] } });
  });
  await page.route("https://geoportal.iderd.gob.do/**", (route) => route.fulfill({ json: { features: [{ properties: { municipio: "JARABACOA" }, geometry }] } }));
  await page.route("**/api/logistics/transport/zones", (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON() as TransportZoneInput;
      commands.push(input);
      zone = {
        ...input, ruleRef: newRef, seriesRef: newRef, code: "ZON_TEST",
        version: commands.length, validFrom: null, validTo: null,
        components: input.components.map((line) => ({ ...line, code: "REN_TEST", costRuleRef: newRef, costRuleVersion: 1 })),
      };
      return route.fulfill(json(zone));
    }
    return route.fulfill(json(zone ? [base, zone] : [base]));
  });
  await page.goto("/administration/logistics");
  await page.getByRole("button", { name: "Nueva ciudad o sector" }).click();
  const editor = page.getByTestId("transport-zone-form");
  await expect(page.getByTestId("transport-zones-admin")).toHaveCount(0);
  const search = editor.getByRole("textbox", { name: "Ciudad, municipio, sector o referencia" });
  await search.fill("Jarabacoa");
  expect(queries).toBe(0);
  await search.press("Enter");
  await editor.getByRole("button", { name: "Jarabacoa Ciudad / municipio · La Vega" }).click();
  await expect(editor.getByLabel("Ciudad *", { exact: true })).toHaveValue("Jarabacoa");
  await expect(editor.getByLabel("Nombre del perfil *", { exact: true })).toHaveValue("Jarabacoa");
  await expect(editor.getByLabel("Dirección de la base", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(editor.getByRole("alert")).toContainText("Confirme un contorno");
  await editor.getByRole("button", { name: "Usar contorno" }).click();
  await expect(editor.getByText("Coordenadas · 3 puntos")).toBeVisible();
  if (process.env.CAPTURE_TRANSPORT_UI === "true") await page.screenshot({ animations: "disabled", path: testInfo.outputPath("transport-map-first.png") });
  await editor.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Jarabacoa · borrador guardado.")).toBeVisible();
  expect(commands[0]).toMatchObject({ state: "DRAFT", geometry, baseName: "", baseAddress: "", purposes: [], components: [] });

  const row = page.getByRole("row").filter({ hasText: "Jarabacoa" });
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await editor.getByRole("tab", { name: "Operación y costos" }).click();
  await editor.getByLabel("Usar base registrada").selectOption({ label: "Base de prueba · Dirección de prueba" });
  await expect(editor.getByLabel("Dirección de la base", { exact: true })).toHaveValue("Dirección de prueba");
  await expect(editor.getByLabel("Km viales de referencia")).toHaveValue("");
  await editor.getByLabel("Visitas presenciales", { exact: true }).check();
  await editor.getByRole("combobox", { name: "Estado", exact: true }).selectOption("ACTIVE");
  await editor.getByRole("button", { name: "Guardar versión" }).click();
  await expect(editor.getByRole("alert")).toContainText("Añada al menos un renglón");
  await editor.getByRole("button", { name: "Añadir renglón" }).click();
  await editor.getByLabel("Tarifa del renglón 1").fill("0");
  await editor.getByRole("button", { name: "Guardar versión" }).click();
  await expect(page.getByText("Jarabacoa · versión 2 guardada.")).toBeVisible();
  expect(commands[1]).toMatchObject({ state: "ACTIVE", seriesRef: newRef, expectedVersion: 1, geometry, purposes: ["VISIT"], baseAddress: "Dirección de prueba" });
  await row.getByRole("button", { name: "Reutilizar perímetro" }).click();
  await expect(editor.getByText("Coordenadas · 3 puntos")).toBeVisible();
  await editor.getByRole("tab", { name: "Operación y costos" }).click();
  await expect(editor.getByLabel("Visitas presenciales", { exact: true })).not.toBeChecked();
  await expect(editor.getByRole("button", { name: "Guardar borrador" })).toBeVisible();
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
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByTestId("transport-zone-form");
  await dialog.getByRole("tab", { name: "Operación y costos" }).click();
  const priority = dialog.getByLabel("Prioridad", { exact: true });
  const save = dialog.getByRole("button", { name: "Guardar borrador", exact: true });
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  await dialog.getByLabel("Base operativa", { exact: true }).focus();
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
  await dialog.getByRole("tab", { name: "Ubicación", exact: true }).click();
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
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.getByTestId("transport-zone-form");
  await editor.getByRole("tab", { name: "Operación y costos" }).click();
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
  await expect(page.getByText(/por kilómetro usa la distancia total/)).toBeVisible();
  await expect(editor.getByRole("option", { name: /Dieta|Viático|Por persona/ })).toHaveCount(0);
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

test("Servicios usa la ruta del caso y Cotización aplica el transporte sin fechas ni publicación separada", async ({ page }) => {
  await session(page);
  const backend = await calculator(page);
  await openCosting(page);
  await fillJourney(page);
  await expect(page.getByTestId("transport-calculation-form").getByLabel(/Personal|Días fuera/)).toHaveCount(0);
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await expect(page.getByTestId("transport-calculation-result").getByText("Datos pendientes", { exact: true })).toBeVisible();
  expect(backend.publishes()).toBe(0);
  await page.getByLabel("Peaje de prueba del recorrido 1").fill("2");
  await expect(page.getByText("Cambios por calcular", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await expect(page.getByTestId("transport-calculation-result").getByText("Completo", { exact: true })).toBeVisible();
  await expect(page.getByText("Transporte aplicado a la cotización · revisión 1.", { exact: true })).toBeVisible();
  expect(backend.calculations).toHaveLength(2);
  expect(backend.calculations[1].input).toMatchObject({ caseRef: CASE, purpose: "QUOTE", contextRef: null, intervalStart: null, intervalEnd: null, routeRevision: 3, journeys: [{ vehicleRef: VEHICLE, vehicleType: "Camión de prueba", distanceKm: "80.00", distanceSource: "OSRM / OpenStreetMap · ruta vial automática", returnToOrigin: true, trips: 1, people: null, days: null, quantities: { TOLL: "2" } }] });
  expect(backend.publishes()).toBe(1);
  expect(backend.queries.some((query) => query.get("purpose") === "QUOTE" && query.get("contextRef") === null)).toBe(true);
  await expect(page.getByTestId("transport-publication")).toContainText("Cotizaciones");
});

test("el caso muestra los kilómetros diarios y los tramos se cargan en cotización por jornada", async ({ page }) => {
  await session(page);
  const seen = await calculator(page);
  const base = { baseRef: "a294b93b-10d5-4d7d-af33-119a2b935fd7", name: "Oficina de prueba", address: "Avenida de prueba 1" };
  const origin = { label: "Origen", address: "Calle de prueba 2" };
  const destination = { label: "Destino", address: "Calle de prueba 3" };
  const leg = (from: typeof origin, to: typeof destination, distanceKm: number, returnToBase = false) => ({
    from, to, origin: [-69.9, 18.5], destination: [-69.8, 18.6], distanceKm, source: "Ruta sintética", estimated: false, returnToBase,
  });
  const office = { label: base.name, address: base.address };
  await page.route(`**/api/crm/pipeline-cases/${CASE}/route?travel=1`, (route) => route.fulfill({
    ...json({ revision: 3, bases: [base], base, terminal: null, foreignOrigin: false, foreignDestination: false,
      area: { origin: "METRO", destination: "INTERIOR" }, metroVersion: 1, distanceKm: 45, estimated: false,
      legs: [leg(office, origin, 12), leg(origin, destination, 18), leg(destination, office, 15, true)],
      preparation: [leg(office, origin, 12), leg(origin, office, 13, true)] }),
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" },
  }));
  await page.goto(`/commercial/cases/${CASE}`);
  const plan = page.getByRole("region", { name: "Recorrido diario del caso" });
  await expect(plan).toContainText("45 km/día");
  await expect(plan).toContainText("Total pendiente");
  await plan.getByLabel("Días de ruta completa").fill("3");
  await expect(plan).toContainText("135 km en total");
  await plan.getByLabel("Días solo en origen").fill("1");
  await expect(plan).toContainText("160 km en total");
  await page.getByRole("button", { name: "Ver costo de transporte" }).click();
  await expect(page.getByLabel("Cobertura del caso")).toContainText("Origen · Zona metro");
  await expect(page.getByLabel("Cobertura del caso")).toContainText("Destino · Fuera de zona metro");
  const form = page.getByTestId("transport-calculation-form");
  await form.getByRole("combobox", { name: "Vehículo de flota" }).selectOption(VEHICLE);
  await form.getByRole("button", { name: "Cargar tramos del caso" }).click();
  await expect(form.getByLabel("Distancia vial calculada")).toHaveCount(5);
  await form.getByRole("button", { name: "Calcular transporte" }).click();
  await expect.poll(() => seen.calculations.length).toBe(1);
  expect(seen.calculations[0].input.journeys.map(({ distanceKm, trips }) => [distanceKm, trips])).toEqual([
    ["12", 3], ["18", 3], ["15", 3], ["12", 1], ["13", 1],
  ]);
});

test("una salida por sede usa la referencia configurada y conserva el destino del caso", async ({ page }) => {
  await session(page);
  const backend = await calculator(page);
  await openCosting(page);
  const form = page.getByTestId("transport-calculation-form");
  await form.getByRole("combobox", { name: "Vehículo de flota", exact: true }).selectOption(VEHICLE);
  await form.getByRole("button", { name: "Ubicar salida en mapa", exact: true }).click();
  await form.getByLabel("Distancia de referencia desde una sede").selectOption("Avenida de prueba, Santo Domingo");
  await expect(form.getByLabel("Buscar dirección de destino")).toHaveValue("Destino de prueba, Santiago, DO");
  await form.getByRole("button", { name: "Destino de prueba, Santiago, República Dominicana", exact: true }).click();
  await form.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await expect(form.getByLabel("Peaje de prueba del recorrido 1")).toBeVisible();
  expect(backend.calculations[0].input.journeys[0]).toMatchObject({
    origin: null, destination: [-70.7, 19], referenceBaseAddress: "Avenida de prueba, Santo Domingo",
    distanceKm: null,
  });
});

test("Administración configura zonas sin abrir planes ni consultar casos", async ({ page }) => {
  await session(page);
  let caseQueries = 0;
  await page.route("**/api/logistics/transport/context?**", (route) => {
    caseQueries += 1;
    return route.fulfill(json({ cases: [], visits: [], vehicles: [] }));
  });
  await page.route("**/api/logistics/transport/zones", (route) => route.fulfill(json([])));
  await page.goto("/administration/logistics");
  await expect(page.getByRole("tab", { name: "Ciudades y sectores" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Calcular transporte" })).toHaveCount(0);
  await expect(page.locator("input[type=datetime-local]")).toHaveCount(0);
  expect(caseQueries).toBe(0);
});

test("Sedes y Zona metro se pueden configurar con el mapa y sin permiso de tarifas", async ({ page }) => {
  await session(page, permissions.filter((permission) => !permission.startsWith("costing:")));
  let base: LogisticsBase | null = null;
  let metro: MetroPerimeter | null = null;
  const writes: LogisticsGeographyCommand[] = [];
  const point = [-69.9, 18.5];
  const ring = [[-69.9, 18.5], [-69.8, 18.5], [-69.8, 18.6], [-69.9, 18.5]];
  await page.route("https://photon.komoot.io/**", (route) => {
    const area = new URL(route.request().url()).searchParams.get("q") === "Municipio de ejemplo";
    return route.fulfill({ json: { features: [area ? {
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { name: "Municipio de ejemplo", countrycode: "DO", type: "city" },
    } : {
      geometry: { type: "Point", coordinates: point },
      properties: { name: "Entrada de camiones", street: "Avenida Principal", housenumber: "12", city: "Santo Domingo", countrycode: "DO" },
    }] } });
  });
  await page.route("**/api/logistics/transport/geography", (route) => {
    if (route.request().method() === "GET") return route.fulfill(json({ bases: base ? [base] : [], metro }));
    const command = route.request().postDataJSON() as LogisticsGeographyCommand;
    writes.push(command);
    if (command.operation === "SAVE_BASE") {
      const { name, address, kind, active, point, expectedVersion } = command;
      base = { baseRef: ZONE, code: "BASE-12345678901234567890", name, address, kind, active, point, version: expectedVersion + 1 };
      return route.fulfill(json(base));
    }
    const { expectedVersion, name, geometry, localities } = command;
    metro = { code: "METRO", version: expectedVersion + 1, name, geometry, localities };
    return route.fulfill(json(metro));
  });
  await page.goto("/administration/logistics");
  await page.getByRole("tab", { name: "Sedes", exact: true }).click();
  await page.getByRole("button", { name: "Nueva sede", exact: true }).click();
  await page.getByLabel("Nombre de la sede", { exact: true }).fill("Almacén de ejemplo");
  await page.getByLabel("Tipo de sede", { exact: true }).selectOption("WAREHOUSE");
  const search = page.getByRole("search", { name: "Buscar en el mapa" });
  await search.getByRole("textbox").fill("Entrada de camiones");
  await search.getByRole("button").click();
  await page.getByRole("button", { name: /Entrada de camiones/ }).click();
  await expect(page.getByLabel("Dirección de la sede")).toHaveValue("Avenida Principal 12, Santo Domingo");
  await expect(page.getByLabel(/Latitud|Longitud/)).toHaveCount(0);
  await page.getByRole("button", { name: "Guardar sede" }).click();
  await expect(page.getByRole("table", { name: "Sedes registradas" })).toContainText("Almacén de ejemplo");
  await page.getByRole("button", { name: "Editar sede Almacén de ejemplo" }).click();
  await page.getByLabel("Nombre de la sede", { exact: true }).fill("Almacén principal");
  await page.getByRole("button", { name: "Guardar sede" }).click();
  await expect(page.getByRole("table", { name: "Sedes registradas" })).toContainText("Almacén principal");
  expect(writes[0]).toMatchObject({ operation: "SAVE_BASE", baseRef: null, expectedVersion: 0, kind: "WAREHOUSE", point });
  expect(writes[1]).toMatchObject({ operation: "SAVE_BASE", baseRef: ZONE, expectedVersion: 1, name: "Almacén principal", point });

  await page.getByRole("tab", { name: "Zona metro", exact: true }).click();
  await page.getByRole("button", { name: "Configurar zona metro" }).click();
  await search.getByRole("textbox").fill("Municipio de ejemplo");
  await search.getByRole("button").click();
  await page.getByRole("button", { name: /Municipio de ejemplo/ }).click();
  await page.getByRole("button", { name: "Usar contorno sugerido" }).click();
  await page.getByRole("button", { name: "Añadir ciudad o sector" }).click();
  await page.getByRole("textbox", { name: "Ciudad o municipio 1" }).fill("Municipio de ejemplo");
  await page.getByRole("textbox", { name: "Sector 1" }).fill("Sector de ejemplo");
  await page.getByRole("combobox", { name: "Clasificación 1" }).selectOption("INTERIOR");
  await page.getByRole("button", { name: "Guardar zona metro" }).click();
  await expect(page.getByRole("table", { name: "Ciudades y sectores de cobertura" })).toContainText("Fuera de zona metro");
  expect(writes[2]).toMatchObject({
    operation: "SAVE_METRO", expectedVersion: 0, geometry: ring.slice(0, -1),
    localities: [{ city: "Municipio de ejemplo", sector: "Sector de ejemplo", classification: "INTERIOR" }],
  });
});

test("publicación con respuesta perdida se consulta sin repetir el envío", async ({ page }) => {
  await session(page);
  const backend = await calculator(page, { lostPublishResponse: true });
  await openCosting(page);
  await fillJourney(page);
  await expect(page.getByTestId("transport-calculation-form").getByLabel(/Personal|Días fuera/)).toHaveCount(0);
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await page.getByLabel("Peaje de prueba del recorrido 1").fill("0");
  await page.getByRole("button", { name: "Calcular transporte", exact: true }).click();
  await expect(page.getByText(/No se confirmó el guardado del costo/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar costo de transporte" })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmar estado", exact: true }).click();
  await expect(page.getByText("Transporte confirmado · revisión 1.", { exact: true })).toBeVisible();
  expect(backend.publishes()).toBe(1);
});

test("una publicación de otro contexto no se muestra ni habilita cálculos", async ({ page }) => {
  await session(page);
  await calculator(page, { mismatchedPublication: true });
  await openCosting(page);
  await expect(page.getByTestId("transport-calculation-panel").getByRole("alert")).toContainText("no corresponde a este caso");
  await expect(page.getByTestId("transport-publication")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calcular transporte", exact: true })).toBeDisabled();
});

test("los permisos monetarios denegados impiden cargar zonas y cálculos", async ({ page }) => {
  await session(page, permissions, ["costing:rules:view", "costing:view"]);
  let requests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/logistics/transport/")) requests += 1; });
  await page.goto("/administration/logistics");
  await expect(page.getByTestId("logistics-rules-admin")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ciudades y sectores", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Calcular transporte", exact: true })).toHaveCount(0);
  expect(requests).toBe(0);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /TransportZoneMap|TransportZonesAdmin|TransportCalculationPanel|leaflet/.test(entry.name)))).toBe(false);
});

test("el acceso de consulta no concede cálculo ni publicación", async ({ page }) => {
  await session(page, permissions.filter((permission) => !["costing:calculate", "costing:publish", "logistics:plan:calculate", "logistics:plan:publish"].includes(permission)));
  const backend = await calculator(page);
  await openCosting(page);
  await expect(page.getByText("Sin costo de transporte aplicado.", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByTestId("transport-zone-form");
  await dialog.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(dialog.getByText(/Quedó pendiente confirmar el guardado/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Guardar borrador", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Volver a ciudades y sectores", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nueva ciudad o sector", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Actualizar ubicaciones", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nueva ciudad o sector", exact: true })).toBeEnabled();
  await expect(page.getByRole("cell", { name: "v2", exact: true })).toBeVisible();
  expect(posts).toBe(1);
});
