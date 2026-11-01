import { expect, test, type Page } from "@playwright/test";

const MEMBERSHIP_REF = "22222222-2222-4222-8222-222222222222";
const SERVICE_REF = "33333333-3333-4333-8333-333333333333";
const MODE_REF = "44444444-4444-4444-8444-444444444444";
const NEW_MODE_REF = "55555555-5555-4555-8555-555555555555";
const permissions = ["services:catalog:view", "services:catalog:manage", "services:packages:view", "services:packages:manage"];
const primary = { serviceRef: SERVICE_REF, code: "LEGACY_LOCAL", name: "Mudanza local", category: null, usage: "PRIMARY", compatibleModes: ["LOCAL"], status: "ACTIVE", sortOrder: 0, version: 1, usageCount: 0, allowedComplementaryRefs: [] };
const localMode = { modeRef: MODE_REF, code: "LOCAL", name: "Local / Nacional", description: null, state: "PUBLISHED", version: 1 };
type Json = Record<string, unknown>;

async function setup(page: Page, withPrimary = false, uncertainCreate = false) {
  const writes: { path: string; body: Json }[] = [];
  const unexpected: string[] = [];
  const catalog = withPrimary ? [{ ...primary }] : [];
  const modes = [{ ...localMode }];
  let createCount = 0;
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.service.creation.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Configuración sintética", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Empresa sintética", role: "A", preferred: true }] }));
  }, { membershipRef: MEMBERSHIP_REF });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" }, body: JSON.stringify({ ok: true, data }) });
    if (path === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { name: "Configuración sintética", role: "A", status: "ACTIVE", permissions, deniedPermissions: [], membership: { membershipRef: MEMBERSHIP_REF, tenantName: "Empresa sintética", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP_REF, tenantName: "Empresa sintética", role: "A", preferred: true }] } }) });
    expect(route.request().headers()["x-osi-membership-ref"]).toBe(MEMBERSHIP_REF);
    if (method === "GET") {
      if (path === "/api/crm/services/catalog") return fulfill(catalog);
      if (path === "/api/crm/services/modes") return fulfill(modes);
      if (["/api/crm/services/catalog-modes", "/api/crm/services/packages", "/api/crm/services/defaults"].includes(path)) return fulfill([]);
    }
    if (method === "POST" || method === "PATCH") {
      const body = route.request().postDataJSON() as Json;
      writes.push({ path, body });
      if (path === "/api/crm/services/catalog" && method === "POST") {
        createCount += 1;
        if (createCount === 1) catalog.push({ ...primary, code: "SER_0123456789ABCDEF", name: String(body.name) });
        if (uncertainCreate && createCount === 1) return route.abort("failed");
        if (uncertainCreate && body.requestId === writes[0].body.requestId && body.payloadHash !== writes[0].body.payloadHash) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: "CRM_SERVICES_IDEMPOTENCY_CONFLICT" }) });
        return fulfill({ service: catalog[0], replayed: createCount > 1 });
      }
      if (path === `/api/crm/services/catalog/${SERVICE_REF}` && method === "PATCH") {
        Object.assign(catalog[0], { name: String(body.name), version: 2 });
        return fulfill({ service: catalog[0], replayed: false });
      }
      if (path === "/api/crm/services/modes") {
        if (body.modeRef) Object.assign(modes[0], { name: String(body.name), version: 2 });
        else modes.push({ ...localMode, modeRef: NEW_MODE_REF, code: String(body.scope), name: String(body.name), state: "DRAFT" });
        return fulfill({ replayed: false });
      }
      if (["/api/crm/services/packages", "/api/crm/services/defaults"].includes(path)) return fulfill({ replayed: false });
    }
    unexpected.push(`${method} ${path}`);
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }) });
  });
  await page.goto("/administration/services");
  await expect(page.getByTestId("service-catalog-admin")).toBeVisible();
  return { writes, unexpected };
}

test("crear un servicio asigna código automático y reintentar conserva la solicitud", async ({ page }) => {
  const seen = await setup(page, false, true);
  const sectionLabel = page.getByLabel("Sección de Administración", { exact: true });
  if (await sectionLabel.isVisible()) await expect(sectionLabel.locator('option[value="/administration/services"]')).toHaveText("Servicios y combinaciones");
  else await expect(page.getByRole("link", { name: "Servicios y combinaciones", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo servicio", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Crear servicio", exact: true });
  await expect(editor.getByLabel("Código", { exact: true })).toHaveCount(0);
  await expect(editor.getByText(/El código se asigna automáticamente/)).toBeVisible();
  await editor.getByLabel("Servicio", { exact: true }).fill("Servicio automático");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => seen.writes.length).toBe(1);
  await expect(page.getByRole("alert")).toContainText("No fue posible guardar el servicio");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(seen.writes).toHaveLength(2);
  expect(seen.writes[0].body).toEqual(seen.writes[1].body);
  expect(seen.writes[0].body.code).toBeNull();
  await expect(page.getByText("SER_0123456789ABCDEF", { exact: true })).toBeVisible();
  await page.getByTestId("service-catalog-admin").getByRole("button", { name: "Editar", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Editar servicio", exact: true });
  await expect(edit.getByLabel("Código", { exact: true })).toHaveValue("SER_0123456789ABCDEF");
  await expect(edit.getByLabel("Código", { exact: true })).toHaveAttribute("readonly", "");
  await edit.getByLabel("Servicio", { exact: true }).fill("Servicio actualizado");
  await edit.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect(seen.writes[2].body).not.toHaveProperty("code");
  expect(seen.unexpected).toEqual([]);
});


test("editar el nombre tras una respuesta incierta mantiene el intento y evita otra alta", async ({ page }) => {
  const seen = await setup(page, false, true);
  await page.getByRole("button", { name: "Nuevo servicio", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Crear servicio", exact: true });
  await editor.getByLabel("Servicio", { exact: true }).fill("Servicio guardado");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No fue posible guardar el servicio");
  await editor.getByLabel("Servicio", { exact: true }).fill("Nombre corregido");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("El guardado anterior ya fue registrado");
  expect(seen.writes).toHaveLength(2);
  expect(seen.writes[1].body.requestId).toBe(seen.writes[0].body.requestId);
  expect(seen.writes[1].body.payloadHash).not.toBe(seen.writes[0].body.payloadHash);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("service-catalog-admin").getByText("Servicio guardado", { exact: true })).toBeVisible();
  await expect(page.getByText("SER_0123456789ABCDEF", { exact: true })).toHaveCount(1);
  expect(seen.unexpected).toEqual([]);
});

test("modalidades asignan código según alcance y LOCAL conserva su identidad", async ({ page }) => {
  const seen = await setup(page);
  await page.getByRole("button", { name: "Nuevo modo", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Nuevo modo", exact: true });
  await expect(editor.getByText("Automático al guardar", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("Código", { exact: true })).toHaveCount(0);
  await editor.getByLabel("Alcance", { exact: true }).selectOption("EXPORT");
  await editor.getByLabel("Nombre", { exact: true }).fill("Exportaciones especiales");
  await editor.getByRole("button", { name: "Guardar modo", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(seen.writes[0].body).toMatchObject({ code: null, scope: "EXPORT", modeRef: null, name: "Exportaciones especiales" });
  await page.getByRole("button", { name: /Local \/ Nacional/ }).click();
  const edit = page.getByRole("dialog", { name: "Versionar modo", exact: true });
  await expect(edit.getByText("LOCAL", { exact: true })).toBeVisible();
  await edit.getByLabel("Nombre", { exact: true }).fill("Local y nacional");
  await edit.getByRole("button", { name: "Guardar modo", exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect(seen.writes[1].body).toMatchObject({ modeRef: MODE_REF, code: "LOCAL", expectedVersion: 1 });
  expect(seen.unexpected).toEqual([]);
});

test("combinaciones y sus requerimientos se crean sin códigos escritos por el usuario", async ({ page }, testInfo) => {
  const seen = await setup(page, true);
  await page.getByTestId("service-catalog-admin").getByRole("button", { name: "Combinar", exact: true }).click();
  const defaults = page.getByRole("dialog", { name: "Combinación predeterminada", exact: true });
  await defaults.getByRole("button", { name: "Guardar combinación", exact: true }).click();
  await expect(defaults).toHaveCount(0);
  expect(seen.writes[0].body.code).toBeNull();
  await page.getByRole("navigation", { name: "Configuración de Servicios", exact: true }).getByRole("button", { name: "Combinaciones", exact: true }).click();
  await page.getByRole("button", { name: "Nueva combinación", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Editor compacto de combinación", exact: true });
  await expect(editor.getByLabel("Código", { exact: true })).toHaveCount(0);
  await editor.getByLabel("Nombre", { exact: true }).fill("Combinación con duración");
  await editor.getByRole("checkbox", { name: "Local / Nacional", exact: true }).check();
  await editor.getByLabel("Principal", { exact: true }).selectOption(SERVICE_REF);
  await editor.getByRole("button", { name: "Agregar", exact: true }).click();
  const requirement = page.getByRole("dialog", { name: "Requerimiento", exact: true });
  await expect(requirement.getByLabel("Código", { exact: true })).toHaveCount(0);
  for (const label of ["Cantidad", "Horas", "Días"]) {
    const input = requirement.getByLabel(label, { exact: true });
    await expect(input).toHaveAttribute("type", "text");
    const bounds = await input.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(96);
    await expect(input).toHaveCSS("height", testInfo.project.name === "chromium-mobile" ? "32px" : "28px");
  }
  const hours = requirement.getByLabel("Horas", { exact: true });
  await hours.fill("7.5");
  expect(await hours.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
  await requirement.getByLabel("Nombre", { exact: true }).click();
  await hours.click();
  expect(await hours.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 3]);
  await page.keyboard.type("8");
  await hours.press("ArrowUp");
  await hours.press("ArrowDown");
  await expect(hours).toHaveValue("8");
  const quantity = requirement.getByLabel("Cantidad", { exact: true });
  await quantity.fill("abc");
  await requirement.getByRole("button", { name: "Agregar requerimiento", exact: true }).click();
  await expect(requirement).toBeVisible();
  expect(await quantity.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
  await quantity.fill("-1");
  await requirement.getByRole("button", { name: "Agregar requerimiento", exact: true }).click();
  await expect(requirement).toBeVisible();
  expect(await quantity.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
  await quantity.fill("");
  await page.screenshot({ path: testInfo.outputPath("combination-numeric-fields.png"), fullPage: true, animations: "disabled" });
  await requirement.getByRole("button", { name: "Agregar requerimiento", exact: true }).click();
  await editor.getByRole("button", { name: "Guardar versión", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(seen.writes[1].body).toMatchObject({ code: null, name: "Combinación con duración", primaryServiceRef: SERVICE_REF, requirements: [{ kind: "DURATION", code: null, quantity: null, hours: 8, days: null }] });
  expect(seen.unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("editar una combinación conserva vigencia, etiquetas y reglas de sus requerimientos", async ({ page }) => {
  const seen = await setup(page, true);
  const packageRef = "66666666-6666-4666-8666-666666666666";
  const versionRef = "77777777-7777-4777-8777-777777777777";
  const original = {
    packageRef, versionRef, code: "LEGACY_COMBINATION", name: "Combinación histórica", description: "Condiciones conservadas", category: "MUDANZA", tags: ["FRAGILE"], state: "PUBLISHED", version: 2,
    validFrom: "2026-01-01T00:00:00.000Z", validTo: "2027-01-01T00:00:00.000Z",
    modes: [{ modeRef: MODE_REF, code: "LOCAL", name: "Local / Nacional" }],
    primary: { serviceRef: SERVICE_REF, code: primary.code, name: primary.name }, complementaries: [],
    requirements: [{ requirementRef: "88888888-8888-4888-8888-888888888888", kind: "DURATION", code: "LEGACY_DURATION", name: "Duración histórica", quantity: null, unitCode: null, hours: 8, days: 1, phaseCode: "MOVE", materialRef: null, assetModelRef: null, capabilityRef: null, disposition: null, chargeType: "INCLUDED", configuration: { bufferHours: 2 }, position: 0 }],
  };
  let saved: Json | null = null;
  await page.route("**/api/crm/services/packages", async (route) => {
    if (route.request().method() === "POST") saved = route.request().postDataJSON() as Json;
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" }, body: JSON.stringify({ ok: true, data: route.request().method() === "GET" ? [original] : { replayed: false } }) });
  });
  await page.getByRole("navigation", { name: "Configuración de Servicios", exact: true }).getByRole("button", { name: "Combinaciones", exact: true }).click();
  await page.getByRole("button", { name: /Combinación histórica/ }).click();
  const editor = page.getByRole("dialog", { name: "Editor compacto de combinación", exact: true });
  await expect(editor.getByText("LEGACY_COMBINATION", { exact: true })).toBeVisible();
  await editor.getByLabel("Nombre", { exact: true }).fill("Combinación revisada");
  await editor.getByRole("button", { name: "Guardar versión", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(saved).toMatchObject({ packageRef, expectedVersion: 2, code: "LEGACY_COMBINATION", name: "Combinación revisada", tags: ["FRAGILE"], validFrom: original.validFrom, validTo: original.validTo, requirements: [{ code: "LEGACY_DURATION", phaseCode: "MOVE", configuration: { bufferHours: 2 } }] });
  expect(seen.unexpected).toEqual([]);
});
