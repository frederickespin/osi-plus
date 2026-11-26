import { expect, test, type Page } from "@playwright/test";
import type { SchedulingWorkspace } from "../../src/survey/schedulingTypes";

const CASE_REF = "038f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CLIENT_REF = "028f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const MEMBERSHIP_REF = "048f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PRIMARY_LOCAL = "138f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PRIMARY_EXPORT = "238f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PACKING = "338f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const UNPACKING = "438f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const DEFAULT_REF = "538f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const SELECTION_REF = "638f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const CONFIGURATION_REF = "c38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const PRECEDENCE = ["CASE_OVERRIDE", "COMMERCIAL_AGREEMENT", "SERVICE_PACKAGE", "SERVICE_MODE_DEFAULT", "MANUAL_RESOLUTION"];
type Mode = "LOCAL" | "EXPORT";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" };
const catalog = (serviceRef: string, code: string, name: string, usage: string, modes: string[] = []) => ({ serviceRef, code, name, category: "Mudanzas", usage, compatibleModes: modes, status: "ACTIVE", sortOrder: 1, version: 1, usageCount: 0, allowedComplementaryRefs: [] });

async function session(page: Page, denied = false, additionalPermissions: string[] = []) {
  const permissions = denied ? ["pipeline:view"] : ["pipeline:view", "services:case:view", "services:case:update", "services:case-config:view", "services:case-config:update", ...additionalPermissions];
  const deniedPermissions = denied ? ["pipeline:view", "services:case:view"] : [];
  await page.addInitScript(({ membershipRef }) => { localStorage.setItem("osi-plus.token", "synthetic.services.token"); localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Actor sintético", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Tenant sintético", role: "A", preferred: true }] })); }, { membershipRef: MEMBERSHIP_REF });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { name: "Actor sintético", role: "A", status: "ACTIVE", permissions, deniedPermissions, membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Tenant sintético", role: "A", preferred: true }] } }) }));
}
async function crm(page: Page, mode: Mode = "LOCAL") {
  await page.route("**/api/crm/pipeline-summary", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { total: 1, assigned: 1, unassigned: 0, byStatus: { NEW_INBOX: 1, AWAITING_ICP: 0, GOVERNANCE_CONFIRMED: 0, REQUIREMENTS_CONFIRMED: 0, SURVEY_PLANNING: 0, SURVEY_SCHEDULED: 0, SURVEY_COMPLETED: 0, CRATING_ESTIMATE_PENDING: 0, PRICING_IN_PROGRESS: 0, QUOTE_DRAFT: 0, INTERNAL_REVIEW: 0, QUOTE_SENT: 0, NEGOTIATION: 0, WON: 0, LOST: 0, CHANGE_CONTROL: 0, APPROVED: 0, OPS_HANDOFF: 0 }, sla: { overdue: null, basis: "UNAVAILABLE" } } }) }));
  await page.route("**/api/crm/pipeline-cases?**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, total: 0, page: 1, pageSize: 25, data: [] }) }));
  await page.route("**/api/crm/pipeline-cases/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0001", version: 1, status: "NEW_INBOX", mode, serviceType: "PENDING_DEFINITION", customerType: "L4_PERSONAL", estimatedCbm: null, requiresSurvey: false, surveyMethod: "NO_APLICA", originLocation: "Santo Domingo", destinationLocation: "Santiago", destinationContracted: true, assetsCount: 0, quoteCount: 0, eventCount: 0, client: { clientRef: CLIENT_REF, displayName: "Cliente relacional", type: "INDIVIDUAL", status: "ACTIVE" }, owner: { displayName: "Actor sintético", isCurrentActor: true }, createdAt: "2026-09-04T12:00:00.000Z", updatedAt: "2026-09-04T12:00:00.000Z" } }) }));
  await page.route("**/api/crm/icp-v2/pipeline-cases/**", (route) => route.fulfill({ status: 409, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: false, error: "CRM_ICP_V2_DISABLED" }) }));
  await page.route(`**/api/crm/services/configurations/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: configurationWorkspace(mode) }) }));
}
function configurationWorkspace(mode: Mode, current: Record<string, unknown> | null = null) {
  return { caseRef: CASE_REF, mode, current, packages: [], materialPolicies: [], precedence: PRECEDENCE };
}
function workspace(mode: Mode = "LOCAL") {
  return {
    caseRef: CASE_REF, mode, planHistory: [],
    selection: { selectionRef: null, revision: 0, mode: null, source: null, defaultCombinationRef: null, primary: null, complementaries: [], otherServices: [], historyCount: 0 },
    primaries: [
      catalog(PRIMARY_LOCAL, "MOV_LOCAL", "Mudanza local", "PRIMARY", ["LOCAL"]),
      catalog(PRIMARY_EXPORT, "MOV_EXPORT", "Mudanza exportación", "PRIMARY", ["EXPORT"]),
    ],
    allowedComplementaries: [
      { primaryServiceRef: PRIMARY_LOCAL, service: catalog(PACKING, "PACKING", "Empaque", "COMPLEMENTARY") },
      { primaryServiceRef: PRIMARY_LOCAL, service: catalog(UNPACKING, "UNPACKING", "Desempaque", "COMPLEMENTARY") },
    ],
    defaults: [{ combinationRef: DEFAULT_REF, primaryServiceRef: PRIMARY_LOCAL, name: "Mudanza estándar", isDefault: true, version: 1, complementaryRefs: [PACKING] }],
  };
}
function savedWorkspace(mode: Mode = "LOCAL") {
  const plan = workspace(mode);
  const primary = plan.primaries.find((item) => item.compatibleModes.includes(mode))!;
  return {
    ...plan,
    selection: {
      ...plan.selection, selectionRef: SELECTION_REF, revision: 1, mode, source: "MANUAL",
      primary: { serviceRef: primary.serviceRef, code: primary.code, name: primary.name, category: primary.category, catalogVersion: 1, source: "MANUAL" },
      defaultCombinationRef: mode === "LOCAL" ? DEFAULT_REF : null,
      complementaries: mode === "LOCAL" ? [{ serviceRef: PACKING, code: "PACKING", name: "Empaque", category: "Mudanzas", catalogVersion: 1, source: "MANUAL" }] : [],
      historyCount: 1,
    },
  };
}

test("el adicional tarifado del Plan llega una sola vez al borrador nuevo", async ({ page }) => {
  await session(page, false, ["quote:view", "quote:create", "quote:override-price", "costing:view", "costing:calculate", "costing:publish"]);
  await crm(page);
  const tariff = { ruleRef: "9e8f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", version: 3, name: "Caja de madera", family: "MATERIAL",
    unit: "caja", currency: "USD", unitPrice: "31.50", classification: "EX" };
  let current: Record<string, unknown> | null = null;
  const basic = { versionRef: "448f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", version: 1, name: "Mudanza básica", currency: "USD",
    shipment: { mode: "NONE", factor: null, roundKg: 1 }, includeRouteTransport: false, needsWeight: false, minimumSale: "0", volumeTiers: [] };
  const expanded = { ...basic, versionRef: "458f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", name: "Mudanza ampliada" };
  let selected = basic;
  await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: null } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=packages`, (route) => route.fulfill({ json: { ok: true, data: {
    hasService: true, volumeM3: 18.4, packages: [basic, expanded],
  } } }));
  await page.route("**/api/costing/calculate", (route) => {
    selected = route.request().postDataJSON().packageEstimate.versionRef === basic.versionRef ? basic : expanded;
    return route.fulfill({ json: { ok: true, data: { calculationRef: CONFIGURATION_REF, result: { issues: [] } } } });
  });
  await page.route("**/api/costing/publish", (route) => route.fulfill({ json: { ok: true, data: {
    revisionRef: selected.versionRef, baseCurrency: tariff.currency, overrides: [],
    lines: [{ lineRef: CONFIGURATION_REF, sourceRef: tariff.ruleRef, sourceVersion: tariff.version, concept: tariff.name, family: tariff.family,
      unit: tariff.unit, classification: tariff.classification, quantity: "2", suggestedPrice: "63.00" }],
    packagePricing: { ...selected, pricingVersion: 1, allowEdits: true, measures: { volumeM3: 18.4 } },
  } } }));

  await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: savedWorkspace() } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=plan-addons`, (route) => route.fulfill({ json: { ok: true, data: [tariff] } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=addons&currency=USD`, (route) => route.fulfill({ json: { ok: true, data: [tariff] } }));
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: {
    caseRef: CASE_REF, caseCode: "CS-2026-0001", destinationStatus: "CONFIRMED", proposals: [],
  } } }));
  await page.route(`**/api/crm/services/configurations/${CASE_REF}`, (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { ok: true, data: configurationWorkspace("LOCAL", current) } });
    const body = route.request().postDataJSON();
    expect(body.preference.quickQuote.pricedAdditions).toEqual([{ ...tariff, quantity: "3" }]);
    current = {
      configurationRef: CONFIGURATION_REF, revision: 1, mode: "LOCAL", serviceSelectionRef: SELECTION_REF, serviceSelectionRevision: 1,
      packageRef: null, packageVersion: null, materialPolicyRef: null, materialPolicyVersion: null,
      surveyPublicationRef: null, commercialAgreementRef: null, duration: body.duration, precedence: {}, source: body.source,
      preference: body.preference, createdAt: "2026-09-04T12:00:00.000Z", items: [], conflicts: [],
    };
    return route.fulfill({ status: 201, json: { ok: true, data: { configuration: current, replayed: false } } });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Configuración", exact: true }).click();
  const plan = page.getByTestId("case-service-configuration");
  await plan.getByLabel("Volumen a cotizar (m³)").fill("18.4");
  const select = plan.getByRole("combobox", { name: "Necesidades adicionales" });
  await select.selectOption(tariff.ruleRef);
  await expect(select.locator(`option[value="${tariff.ruleRef}"]`)).toHaveCount(0);
  await plan.getByLabel("Cantidad de Caja de madera").fill("3");
  await plan.getByRole("button", { name: "Guardar configuración" }).click();
  await expect.poll(() => current).not.toBeNull();
  await page.reload();
  await page.getByRole("tab", { name: "Cotización" }).click();
  await page.getByRole("button", { name: /Nueva propuesta/ }).click();
  await expect(page.getByRole("textbox", { name: "Cantidad de Caja de madera" })).toHaveValue("3");
  await expect(page.getByLabel("Totales de la propuesta")).toContainText("94.50");
  await expect(page.getByRole("button", { name: "Quitar Caja de madera" })).toHaveCount(1);
  for (const pkg of [basic, expanded]) {
    await page.getByRole("button", { name: "Agregar " + pkg.name, exact: true }).click();
    await expect(page.getByLabel("Cantidad de Caja de madera", { exact: true })).toHaveValue("2");
    await expect(page.getByLabel("Cantidad adicional 1", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Cantidad adicional 2", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Adicional del plan · caja", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Totales de la propuesta")).toContainText("157.50");
  }
  await expect(page.getByRole("button", { name: "Guardar borrador" })).toBeEnabled();
});

test("pide resolver monedas distintas antes de cotizar y conserva el volumen exacto al aplicar el paquete", async ({ page }) => {
  await session(page, false, ["quote:view", "quote:create", "costing:view", "costing:calculate", "costing:publish"]);
  await crm(page);
  const addon = { ruleRef: PACKING, version: 1, name: "Acarreo adicional", family: "LABOR", unit: "hora",
    currency: "DOP", unitPrice: "250", classification: "PR", quantity: "2" };
  const selected = { versionRef: DEFAULT_REF, version: 1, name: "Mudanza por volumen", currency: "USD", minimumSale: "100",
    volumeTiers: [{ maxM3: 6, minimumSale: "100" }, { maxM3: null, minimumSale: "200" }],
    shipment: { mode: "NONE", factor: null, roundKg: 1 }, includeRouteTransport: false, needsWeight: false };
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: savedWorkspace() } }));
  await page.route(`**/api/crm/services/configurations/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: configurationWorkspace("LOCAL", {
    configurationRef: CONFIGURATION_REF, revision: 1, mode: "LOCAL", serviceSelectionRef: SELECTION_REF, serviceSelectionRevision: 1,
    packageRef: DEFAULT_REF, packageVersion: 1, materialPolicyRef: null, materialPolicyVersion: null, surveyPublicationRef: null,
    commercialAgreementRef: null, duration: {}, precedence: {}, source: "PACKAGE", preference: { quickQuote: { pricedAdditions: [addon] } },
    createdAt: "2026-11-10T12:00:00.000Z", items: [], conflicts: [],
  }) } }));
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: { caseRef: CASE_REF, proposals: [] } } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: null } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=addons&currency=*`, (route) => route.fulfill({ json: { ok: true, data: [] } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=packages`, (route) => route.fulfill({ json: { ok: true,
    data: { hasService: true, volumeM3: 6.00001, selectedPackageVersionRef: selected.versionRef, packages: [selected] } } }));
  let measured = "";
  await page.route("**/api/costing/calculate", (route) => {
    measured = route.request().postDataJSON().packageEstimate.volumeM3;
    return route.fulfill({ json: { ok: true, data: { result: { issues: [{ severity: "BLOCKER", status: "OPEN", message: "Datos pendientes de prueba" }] } } } });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Cotización", exact: true }).click();
  await page.getByRole("button", { name: "Nueva propuesta 1" }).click();
  const choice = page.getByRole("group", { name: "Moneda del plan" });
  await expect(choice).toContainText("Mudanza por volumen");
  await expect(choice).toContainText("USD");
  await expect(choice).toContainText("DOP");
  await expect(page.getByRole("button", { name: "Guardar borrador" })).toHaveCount(0);
  await choice.getByRole("button", { name: "Cotizar solo adicionales en DOP" }).click();
  await expect(page.getByRole("textbox", { name: "Cantidad de Acarreo adicional" })).toHaveValue("2");
  await expect(page.getByLabel("Totales de la propuesta")).toContainText("500.00");
  await page.reload();
  await page.getByRole("tab", { name: "Cotización", exact: true }).click();
  await page.getByRole("button", { name: "Nueva propuesta 1" }).click();
  await choice.getByRole("button", { name: "Preparar en USD sin adicionales" }).click();
  await expect(page.getByRole("textbox", { name: "Cantidad de Acarreo adicional" })).toHaveCount(0);
  await page.getByRole("button", { name: "Agregar Mudanza por volumen" }).click();
  await expect.poll(() => measured).toBe("6.00001");
});

test("Servicios consume modo ICP, precarga defaults y guarda un snapshot sin IDs internos", async ({ page }) => {
  await session(page); await crm(page); let writes = 0; let body: Record<string, unknown> | null = null;
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, async (route) => {
    expect(route.request().headers()["x-osi-membership-ref"]).toBe(MEMBERSHIP_REF);
    if (route.request().method() === "PATCH") { writes += 1; body = route.request().postDataJSON() as Record<string, unknown>; await route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { selection: workspace().selection, replayed: false } }) }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: workspace() }) });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Servicios" }).click();
  const panel = page.getByTestId("case-services-panel"); await expect(panel).toBeVisible();
  const mode = panel.getByLabel("Modo / Alcance"); await expect(mode).toHaveValue("LOCAL / NACIONAL"); await expect(mode).toHaveAttribute("readonly", "");
  await panel.getByLabel("Necesidad principal").selectOption(PRIMARY_LOCAL);
  const services = panel.getByRole("table", { name: "Servicios asociados al caso" });
  await expect(services.getByRole("row", { name: /Empaque/ })).toBeVisible();
  await expect(services.getByRole("row", { name: /Desempaque/ })).toHaveCount(0);
  await panel.getByLabel("Servicio asociado del catálogo").selectOption(UNPACKING);
  await panel.getByRole("button", { name: "Agregar servicio seleccionado" }).click();
  await panel.getByText("Añadir otro servicio").click();
  await panel.getByLabel("Otro servicio").fill("Permiso especializado");
  await panel.getByRole("button", { name: "Agregar pendiente" }).click();
  await panel.getByRole("button", { name: "Crear plan de servicios" }).click();
  await expect.poll(() => writes).toBe(1);
  expect(body).toMatchObject({ expectedRevision: 0, primaryServiceRef: PRIMARY_LOCAL, complementaryRefs: [PACKING, UNPACKING], defaultCombinationRef: null, otherServices: [{ description: "Permiso especializado" }] });
  expect(JSON.stringify(body)).not.toMatch(/tenantId|userId|membershipId|estimatedCbm|survey|quote|cost/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

for (const role of ["principal", "asociado"] as const) {
  test(`la capacidad del almacenaje ${role} y sus autorizaciones se consultan en Movimientos`, async ({ page }) => {
    await session(page);
    await crm(page);
    const plan = savedWorkspace();
    const storage = { code: "ALMACENAJE", category: "STORAGE", name: "Almacenaje" };
    if (role === "principal") {
      Object.assign(plan.primaries[0], storage);
      Object.assign(plan.selection.primary, storage);
    } else {
      Object.assign(plan.allowedComplementaries[0].service, storage);
      Object.assign(plan.selection.complementaries[0], storage);
    }
    await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: plan } }));
    await page.route("**/api/customer-custody/storage-requirements?**", (route) => route.fulfill({ json: { ok: true, data: {
      historyCount: 1, current: { revision: 1, storageType: "PERSONAL_EFFECTS", capacityBasis: "CUBIC_METER",
        capacityQuantity: 18, estimatedDurationMonths: 4, dataSource: "COMMERCIAL_ESTIMATE", visitDecision: "TO_CONFIRM" },
    } } }));
    await page.route("**/api/customer-custody/storage-agreements?**", (route) => route.fulfill({ json: { ok: true, data: {
      client: { name: "Cliente relacional" }, agreement: null, acceptedQuote: null,
      requirements: { storageServiceSelected: true, acceptedQuote: false, identityConfirmed: false, billingConfirmed: false, signed: false, active: false },
    } } }));
    await page.route("**/api/customer-custody/authorizations?**", (route) => route.fulfill({ json: { ok: true, data: [] } }));
    await page.route("**/api/materials/warehouses", (route) => route.fulfill({ json: { ok: true, data: [] } }));

    await page.goto(`/commercial/cases/${CASE_REF}`);
    const panel = page.getByTestId("case-services-panel");
    await expect(panel.getByRole("tab", { name: "Plan", exact: true })).toBeVisible();
    await expect(panel.getByRole("tab", { name: "Almacenaje", exact: true })).toHaveCount(0);
    await panel.getByRole("tab", { name: "Movimientos" }).click();
    await expect(panel.getByRole("heading", { name: "Entradas y salidas de almacenaje" })).toBeVisible();
    const quantity = panel.getByTestId("storage-requirement-panel").getByLabel("Cantidad aproximada");
    await expect(quantity).toBeHidden();
    await panel.getByText("Capacidad y duración del servicio", { exact: true }).click();
    await expect(quantity).toBeVisible();
    await expect(quantity).toHaveValue("18");
  });
}

test("Direcciones del plan conserva la selección de origen y destino al guardar y reabrir", async ({ page }) => {
  await session(page, false, ["pipeline:update"]);
  await crm(page);
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: savedWorkspace() } }));
  const address = (street: string) => ({ countryCode: "DO", cityMunicipality: "Santo Domingo", provinceState: "Distrito Nacional", streetAndNumber: street });
  let state = { caseRef: CASE_REF, version: 3, route: { revision: 2, origin: address("Calle actual 1"), destination: address("Calle actual 2"), destinationStatus: "CONFIRMED" },
    options: [
      { optionId: "registered", source: "REGISTERED", label: "Dirección registrada", address: address("Calle registrada 8") },
      { optionId: "recent", source: "RECENT_SERVICE", label: "Servicio reciente", address: address("Calle entrega 10") },
    ] };
  let writes = 0;
  await page.route(`**/api/crm/pipeline-cases/${CASE_REF}/route`, (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ expectedVersion: 3, expectedRouteRevision: 2, origin: { streetAndNumber: "Calle registrada 8" }, destination: { streetAndNumber: "Calle entrega 10" } });
      writes++;
      state = { ...state, version: 4, route: { revision: 3, origin: body.origin, destination: body.destination, destinationStatus: body.destinationStatus } };
    }
    return route.fulfill({ headers: privateHeaders, json: { ok: true, data: state } });
  });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  const tab = page.getByRole("tab", { name: "Direcciones", exact: true });
  const editor = page.getByRole("region", { name: "Direcciones del caso" });
  await tab.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Guardar ruta" })).toBeDisabled();
  const selectors = editor.getByRole("combobox", { name: "Seleccionar dirección" });
  await selectors.first().selectOption("registered");
  await selectors.last().selectOption("recent");
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await tab.click();
  await expect(selectors.last()).toHaveValue("recent");
  await editor.getByRole("button", { name: "Guardar ruta" }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(editor.getByLabel("Calle y número").nth(1)).toHaveValue("Calle entrega 10");
  await page.reload();
  await tab.click();
  await expect(editor.getByLabel("Calle y número").first()).toHaveValue("Calle registrada 8");
  await expect(editor.getByRole("button", { name: "Guardar ruta" })).toBeDisabled();
});

test("deny bloquea antes del lazy de Servicios y no inicia requests", async ({ page }) => {
  await session(page, true); let serviceRequests = 0; page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/crm/services")) serviceRequests += 1; });
  await page.goto(`/commercial/cases/${CASE_REF}`); await expect(page.getByTestId("hub-forbidden")).toContainText("403 · Acceso no autorizado"); await expect(page.getByTestId("case-services-panel")).toHaveCount(0); expect(serviceRequests).toBe(0);
});

test("Servicios lleva el método elegido a la solicitud y agenda del Survey", async ({ page }) => {
  await session(page, false, ["survey:assignment:view", "survey:schedule:view", "survey:schedule:manage"]);
  await crm(page);
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: savedWorkspace() } }));
  let decision: SchedulingWorkspace["decision"] = null;
  const decisions: Record<string, unknown>[] = [];
  await page.route("**/api/crm/survey/scheduling**", (route) => {
    if (route.request().method() === "POST") {
      decisions.push(route.request().postDataJSON() as Record<string, unknown>);
      decision = {
        decisionRef: "d38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", method: "VIRTUAL", state: "READY_TO_SCHEDULE",
        informationSource: "COMMERCIAL", rationaleCode: null, routeVersion: 1, version: 1, createdAt: "2026-09-04T12:00:00.000Z",
      };
      return route.fulfill({ status: 201, headers: privateHeaders, json: { ok: true, data: decision } });
    }
    expect(new URL(route.request().url()).searchParams.get("caseRef")).toBe(CASE_REF);
    const scheduling: SchedulingWorkspace = {
      caseRef: CASE_REF, caseCode: "CS-2026-0001", routeVersion: 1, decision, assignment: null, policy: null,
      operationalPolicy: null, visitReasons: [], visitLocations: [], schedulingContext: null, availability: null,
      evaluatorCandidates: [], visitFee: null, communications: [], history: [], publication: null,
    };
    return route.fulfill({ headers: privateHeaders, json: { ok: true, data: scheduling } });
  });

  await page.goto(`/commercial/cases/${CASE_REF}`);
  const panel = page.getByTestId("case-services-panel");
  await panel.getByRole("button", { name: "Agendar Survey" }).click();
  await panel.getByLabel("Tipo de Survey").selectOption("VIRTUAL");
  const calendar = panel.getByRole("button", { name: "Ver calendario" });
  const service = panel.getByLabel("Servicio asociado del catálogo");
  await service.selectOption(UNPACKING);
  await expect(calendar).toBeDisabled();
  await service.selectOption("");
  await calendar.click();

  await expect(page.getByRole("tab", { name: "Survey", exact: true })).toHaveAttribute("aria-selected", "true");
  const survey = page.getByTestId("survey-scheduling-workspace");
  await expect(survey.getByRole("combobox", { name: "Método de Survey" })).toContainText("Visita virtual");
  expect(decisions).toHaveLength(0);
  await survey.getByRole("button", { name: "Guardar pendiente" }).click();
  await expect(survey.getByRole("heading", { name: "Agenda del día" })).toBeVisible();
  await expect.poll(() => decisions.length).toBe(1);
  expect(decisions[0]).toMatchObject({ operation: "DECIDE_METHOD", method: "VIRTUAL", caseRef: CASE_REF, expectedVersion: null });
});

test("Servicios guarda datos directos de exportación y Propuestas vuelve a leerlos tras recargar", async ({ page }) => {
  await session(page, false, ["survey:assignment:view", "survey:schedule:manage", "costing:view", "quote:view"]);
  await crm(page, "EXPORT");
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: savedWorkspace("EXPORT") } }));
  await page.route(`**/api/costing/revisions/${CASE_REF}`, (route) => route.fulfill({ json: { ok: true, data: null } }));
  await page.route(`**/api/quote/cases/${CASE_REF}`, (route) => route.fulfill({
    json: { ok: true, data: { caseRef: CASE_REF, caseCode: "CS-2026-0001", destinationStatus: "CONFIRMED", proposals: [] } },
  }));
  const writes: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;
  await page.route(`**/api/crm/services/configurations/${CASE_REF}`, (route) => {
    if (route.request().method() !== "POST") {
      return route.fulfill({ json: { ok: true, data: configurationWorkspace("EXPORT", current) } });
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    writes.push(body);
    current = {
      configurationRef: CONFIGURATION_REF, revision: 1, mode: "EXPORT",
      serviceSelectionRef: body.serviceSelectionRef, serviceSelectionRevision: body.serviceSelectionRevision,
      packageRef: null, packageVersion: null, materialPolicyRef: null, materialPolicyVersion: null,
      surveyPublicationRef: null, commercialAgreementRef: null, duration: {}, precedence: {}, source: "MANUAL_RESOLUTION",
      preference: { ...(body.intake as Record<string, unknown>), directQuoteRecordedAt: "2026-09-04T12:00:00.000Z" },
      createdAt: "2026-09-04T12:00:00.000Z", items: [], conflicts: [],
    };
    return route.fulfill({ status: 201, json: { ok: true, data: { configurationRef: CONFIGURATION_REF, revision: 1, replayed: false } } });
  });

  await page.goto(`/commercial/cases/${CASE_REF}`);
  const panel = page.getByTestId("case-services-panel");
  await expect(panel.getByLabel("Modo / Alcance")).toHaveValue("EXPORTACIÓN");
  await expect(panel.getByRole("tab", { name: /Almacenaje|Movimientos/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Tomar datos y cotizar" }).click();
  await expect(panel.getByLabel("Tipo de Survey")).toHaveCount(0);
  await panel.getByLabel("Fecha prevista del servicio").fill("2026-12-03");
  await panel.getByLabel("Datos disponibles").selectOption("CLIENT_LIST");
  await panel.getByRole("textbox", { name: "Listado del cliente", exact: true }).fill("Dos mesas y seis cajas");
  await panel.getByLabel("Volumen estimado (m³)").fill("24,5");
  await panel.getByLabel("Acceso en origen").fill("Ascensor de servicio");
  await panel.getByLabel("Acceso en destino").fill("Escalera");
  await panel.getByLabel("Trabajos especiales").fill("Dos cajas de madera");
  await panel.getByRole("button", { name: "Guardar y cotizar" }).click();

  await expect(page.getByRole("tab", { name: "Cotización" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("quote-intake")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    expectedRevision: 0, serviceSelectionRef: SELECTION_REF, serviceSelectionRevision: 1,
    intake: {
      serviceStartDate: "2026-12-03",
      directQuote: {
        source: "CLIENT_LIST", clientList: "Dos mesas y seis cajas", volumeM3: 24.5,
        originAccess: "Ascensor de servicio", destinationAccess: "Escalera", specialWork: "Dos cajas de madera",
      },
    },
  });

  await page.reload();
  await page.getByRole("tab", { name: "Cotización" }).click();
  const quote = page.getByTestId("quote-intake");
  await quote.getByText("Datos para cotizar", { exact: true }).click();
  await expect(quote.getByText("Dos mesas y seis cajas", { exact: true })).toBeVisible();
  await expect(quote.getByText(/24[,.]5 m³/)).toBeVisible();
  await expect(quote.locator("time")).toHaveAttribute("datetime", "2026-12-03");
  await expect(quote.getByText("Ascensor de servicio", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
});

test("preparación rápida versiona paquete, volumen, perfil, accesos y duración sin IDs internos", async ({ page }) => {
  await session(page); await crm(page); const selectionRef = SELECTION_REF; const packageRef = "738f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"; const packageVersionRef = "838f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"; const policyRef = "938f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"; const policyVersionRef = "a38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012"; let saved: Record<string, unknown> | null = null; let configurationReads = 0;
  const surveySummary = { publicationRef: "b38f6d8f-8d11-4f39-8a2d-1b6c7e8f9013", revision: 2, routeVersion: 3, volumeM3: 22.375, contentNote: "12 artículos · 2 frágiles",
    materialsNote: "Papel de empaque (3 kg)", originAccess: "Piso 3 · Sin ascensor", destinationAccess: null };
  await page.route(`**/api/costing/revisions/${CASE_REF}?view=plan-addons`, (route) => route.fulfill({ json: { ok: true, data: [] } }));
  const selected = savedWorkspace();
  await page.route(`**/api/crm/services/cases/${CASE_REF}`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: selected }) }));
  await page.route(`**/api/crm/services/configurations/${CASE_REF}`, async (route) => { if (route.request().method() === "POST") { saved = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { replayed: false } }) }); } configurationReads += 1; return route.fulfill({ status: 200, contentType: "application/json", headers: privateHeaders, body: JSON.stringify({ ok: true, data: { caseRef: CASE_REF, mode: "LOCAL", current: null, routeRevision: 4, estimatedVolumeM3: 17, surveySummary, packages: [{ packageRef, versionRef: packageVersionRef, code: "LOC-MOVE-STD", name: "Mudanza local estándar", description: null, category: "MUDANZA", tags: [], state: "PUBLISHED", version: 1, validFrom: null, validTo: null, modes: [{ modeRef: "b38f6d8f-8d11-4f39-8a2d-1b6c7e8f9012", code: "LOCAL", name: "Local / Nacional" }], primary: { serviceRef: PRIMARY_LOCAL, code: "MOV_LOCAL", name: "Mudanza local" }, complementaries: [{ serviceRef: PACKING, code: "PACKING", name: "Empaque" }], requirements: [] }], materialPolicies: [{ policyRef, versionRef: policyVersionRef, code: "LOCAL-REUSE", name: "Materiales reutilizables", version: 1, state: "PUBLISHED", packageVersionRef, serviceRef: null, modeRef: null, preferenceCode: "REUSABLE_ALLOWED", standardCode: "STANDARD", validFrom: null, validTo: null, lines: [] }], precedence: ["CASE_OVERRIDE", "COMMERCIAL_AGREEMENT", "SERVICE_PACKAGE", "SERVICE_MODE_DEFAULT", "MANUAL_RESOLUTION"] } }) }); });
  await page.goto(`/commercial/cases/${CASE_REF}`);
  await page.getByRole("tab", { name: "Servicios" }).click();
  await page.getByRole("tab", { name: "Configuración" }).click();
  const configuration = page.getByTestId("case-service-configuration");
  const volume = configuration.getByLabel("Volumen a cotizar (m³)");
  await expect(volume).toHaveValue("22.375");
  await expect(configuration.getByText(/12 artículos · 2 frágiles/)).toBeVisible();
  await expect(configuration.getByText("Survey anterior · confirmar acceso")).toBeVisible();
  await expect(configuration.getByText(/Papel de empaque \(3 kg\)/)).toBeVisible();
  await expect(configuration.getByText(/Piso 3 · Sin ascensor/)).toBeVisible();
  await configuration.getByLabel("Paquete de referencia").selectOption(packageVersionRef);
  await volume.fill("19,45");
  await configuration.getByRole("button", { name: "Usar este volumen" }).click();
  await expect(volume).toHaveValue("22.375");
  await volume.fill("19,45");
  await configuration.getByLabel("Observación del cliente sobre acceso de destino").fill("Reservar montacargas");
  await configuration.getByLabel("Condición de acceso en origen").selectOption("STAIRS");
  await configuration.getByLabel("Condición de acceso en destino").selectOption("CRANE_OR_HOIST");
  await expect(configuration.getByLabel("Condición de acceso en destino").locator('option[value="CRANE_OR_HOIST"]')).toHaveCount(0);
  await configuration.getByLabel("Política de materiales").selectOption(policyVersionRef);
  await configuration.getByLabel("Duración prevista (h)").fill("8");
  await configuration.getByRole("button", { name: "Guardar configuración" }).click();
  await expect.poll(() => saved).not.toBeNull();
  await expect.poll(() => configurationReads).toBeGreaterThanOrEqual(2);
  expect(saved).toMatchObject({ expectedRevision: 0, serviceSelectionRef: selectionRef, packageVersionRef,
    surveyPublicationRef: surveySummary.publicationRef, materialPolicyVersionRef: policyVersionRef, duration: { hours: 8 },
    preference: { quickQuote: { schemaVersion: 2, volumeM3: 19.45, volumeSource: "MANUAL", clientDestinationAccess: "Reservar montacargas",
      clientAccessConditions: { origin: { routeRevision: 4, flags: ["STAIRS"] }, destination: { routeRevision: 4, flags: ["CRANE_OR_HOIST"] } } } },
    source: "PACKAGE", overrides: [] });
  expect(JSON.stringify(saved)).not.toMatch(/tenantId|membershipId|userId|clientId|stock|contentMix/i);
});
