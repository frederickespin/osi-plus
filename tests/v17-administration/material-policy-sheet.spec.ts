import { expect, test, type Page } from "@playwright/test";

const MEMBERSHIP = "92000000-0000-4000-8000-000000000001";
const MODE = "92000000-0000-4000-8000-000000000002";
const MATERIAL = "92000000-0000-4000-8000-000000000003";
const ASSET = "92000000-0000-4000-8000-000000000004";
const POLICY = "92000000-0000-4000-8000-000000000005";
const VERSION = "92000000-0000-4000-8000-000000000006";
const LINE = "92000000-0000-4000-8000-000000000007";
const RESOURCES = [
  { kind: "MATERIAL", resourceRef: MATERIAL, code: "MAT-SYN", name: "Cartón sintético", family: "PACKING" },
  { kind: "ASSET", resourceRef: ASSET, code: "AST-SYN", name: "Manta sintética", family: "REUSABLE" },
];
const MODE_ROW = { modeRef: MODE, code: "LOCAL", name: "Local", description: null, state: "PUBLISHED", version: 1 };
const RULES = { preparationRule: { applicable: true }, maintenanceRule: { frequency: "AFTER_USE" }, deteriorationRule: { chargeable: true }, replacementRule: { approved: false }, conditions: { nested: { keep: ["original"] } } };
const existingPolicy = () => ({
  policyRef: POLICY, versionRef: VERSION, code: "POL-LEGACY", name: "Política sintética existente", version: 3, state: "PUBLISHED",
  packageVersionRef: null, serviceRef: null, modeRef: MODE, preferenceCode: "REUSABLE_ALLOWED", standardCode: "SPECIAL",
  validFrom: "2026-10-01T00:00:00.000Z", validTo: "2027-01-01T00:00:00.000Z",
  lines: [{ lineRef: LINE, materialRef: MATERIAL, assetModelRef: null, materialClass: "NEW", disposition: "CONSUMED", proportion: 1, chargeType: "SALE", ...RULES }],
});
type PolicyFixture = ReturnType<typeof existingPolicy>;
type Payload = Record<string, unknown>;

// Local browser fixtures only. No deployment, inventory or database is accessed.
async function fixture(page: Page, options: { policies?: PolicyFixture[]; manage?: boolean; secondPageFails?: boolean; abortFirstSave?: boolean; resources?: typeof RESOURCES } = {}) {
  let policies: unknown[] = options.policies || [];
  let failSecondPage = Boolean(options.secondPageFails);
  let abortFirstSave = Boolean(options.abortFirstSave);
  const requests: string[] = [];
  const saves: Payload[] = [];
  const unexpected: string[] = [];
  const committed = new Map<string, unknown>();
  const committedHashes = new Map<string, string>();
  const permissions = ["services:materials:view", "services:packages:view", ...(options.manage === false ? [] : ["services:materials:manage"])];
  const resources = options.resources || RESOURCES;
  await page.addInitScript(({ membershipRef }) => {
    localStorage.setItem("osi-plus.token", "synthetic.material.sheet.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Administradora sintética", role: "A", membershipRef, memberships: [{ membershipRef, tenantName: "Empresa sintética", role: "A", preferred: true }] }));
  }, { membershipRef: MEMBERSHIP });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}${url.search}`);
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store" }, body: JSON.stringify(body) });
    if (url.pathname === "/api/auth/me") return fulfill({ ok: true, user: { name: "Administradora sintética", role: "A", status: "ACTIVE", permissions, deniedPermissions: [], membership: { membershipRef: MEMBERSHIP, tenantName: "Empresa sintética", role: "A" }, memberships: [{ membershipRef: MEMBERSHIP, tenantName: "Empresa sintética", role: "A", preferred: true }] } });
    expect(request.headers().authorization).toBe("Bearer synthetic.material.sheet.token");
    expect(request.headers()["x-osi-membership-ref"]).toBe(MEMBERSHIP);
    if (url.pathname === "/api/crm/services/modes" && request.method() === "GET") return fulfill({ ok: true, data: [MODE_ROW] });
    if (url.pathname === "/api/crm/services/packages" && request.method() === "GET") return fulfill({ ok: true, data: [] });
    if (url.pathname === "/api/crm/services/material-policies" && request.method() === "GET") {
      if (url.searchParams.get("view") === "resources") {
        if (options.manage === false) throw new Error("Read-only session must not request resources");
        if (!url.searchParams.get("cursor")) return fulfill({ ok: true, data: { items: resources.slice(0, 1), nextCursor: resources.length > 1 ? "synthetic-page-two" : null } });
        if (failSecondPage) return fulfill({ ok: false, error: "SERVICE_PACKAGES_DATABASE_UNAVAILABLE" }, 503);
        return fulfill({ ok: true, data: { items: resources.slice(1), nextCursor: null } });
      }
      return fulfill({ ok: true, data: policies });
    }
    if (url.pathname === "/api/crm/services/material-policies" && request.method() === "POST") {
      const payload = request.postDataJSON() as Payload;
      saves.push(payload);
      let saved = committed.get(String(payload.requestId));
      if (saved && committedHashes.get(String(payload.requestId)) !== payload.payloadHash) return fulfill({ ok: false, error: "SERVICE_PACKAGES_IDEMPOTENCY_CONFLICT" }, 409);
      if (!saved) {
        const data = Object.fromEntries(Object.entries(payload).filter(([key]) => !["requestId", "payloadHash"].includes(key)));
        saved = { ...data, policyRef: payload.policyRef || POLICY, versionRef: VERSION, code: payload.code || "POL_AUTO_SYNTHETIC", version: payload.expectedVersion ? Number(payload.expectedVersion) + 1 : 1, lines: (payload.lines as Payload[]).map((line) => ({ ...line, lineRef: LINE })) };
        committed.set(String(payload.requestId), saved);
        committedHashes.set(String(payload.requestId), String(payload.payloadHash));
        policies = [saved];
      }
      if (abortFirstSave) { abortFirstSave = false; return route.abort("failed"); }
      return fulfill({ ok: true, data: { policy: saved, replayed: saves.length > 1 } }, 201);
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return fulfill({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }, 404);
  });
  return { requests, saves, unexpected, committed, allowSecondPage: () => { failSecondPage = false; } };
}

async function openPolicies(page: Page) {
  await page.goto("/administration/services");
  await page.getByRole("button", { name: "Políticas de materiales", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Políticas de materiales", exact: true })).toBeVisible();
}

async function newPolicy(page: Page) {
  await openPolicies(page);
  await page.getByRole("button", { name: "Nueva política", exact: true }).click();
  return page.getByTestId("material-policy-sheet");
}

async function fillValidPolicy(page: Page) {
  const sheet = page.getByTestId("material-policy-sheet");
  await sheet.getByLabel("Nombre de la política", { exact: true }).fill("Composición sintética");
  await sheet.getByLabel("Modalidad", { exact: true }).selectOption(MODE);
  await sheet.getByLabel("Material o recurso, fila 1", { exact: true }).selectOption(MATERIAL);
  await sheet.getByLabel("Clase, fila 1", { exact: true }).fill("NEW");
  await sheet.getByLabel("Porcentaje, fila 1", { exact: true }).fill("100");
  return sheet;
}

test("crea la política en una sola hoja, con nombres y porcentajes, sin permisos de inventario", async ({ page }, testInfo) => {
  const seen = await fixture(page);
  const sheet = await newPolicy(page);
  await fillValidPolicy(page);
  const percentage = sheet.getByLabel("Porcentaje, fila 1", { exact: true });
  await expect(percentage).toHaveAttribute("type", "text");
  const percentageBounds = await percentage.boundingBox();
  expect(percentageBounds!.width).toBeLessThanOrEqual(80);
  expect(percentageBounds!.height).toBe(testInfo.project.name === "chromium-mobile" ? 32 : 28);
  await sheet.getByLabel("Clase, fila 1", { exact: true }).click();
  await percentage.click();
  expect(await percentage.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 3]);
  await page.keyboard.type("70,5");
  await percentage.press("ArrowUp");
  await percentage.press("ArrowDown");
  await expect(percentage).toHaveValue("70,5");
  expect(await percentage.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
  await sheet.getByRole("button", { name: "Agregar fila", exact: true }).click();
  await sheet.getByLabel("Tipo, fila 2", { exact: true }).selectOption("ASSET");
  await sheet.getByLabel("Material o recurso, fila 2", { exact: true }).selectOption(ASSET);
  await sheet.getByLabel("Clase, fila 2", { exact: true }).fill("REUSABLE");
  await sheet.getByLabel("Porcentaje, fila 2", { exact: true }).fill("29,5");
  await sheet.getByLabel("Uso, fila 2", { exact: true }).selectOption("RETURNABLE");
  await sheet.getByLabel("Cargo, fila 2", { exact: true }).selectOption("USAGE");
  await expect(sheet.getByText("Total: 100 %", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(sheet.getByLabel("Código", { exact: true })).toHaveCount(0);
  await expect(sheet.getByLabel("Referencia del catálogo", { exact: true })).toHaveCount(0);
  expect(new Set(seen.requests.filter((path) => path.includes("view=resources"))).size).toBe(2);
  expect(seen.requests.some((path) => /\/api\/(materials|assets)\//.test(path))).toBe(false);
  await sheet.getByTestId("material-policy-table-scroll").evaluate((element) => { element.scrollLeft = 0; });
  await page.screenshot({ path: testInfo.outputPath("material-policy-sheet.png"), fullPage: true, animations: "disabled" });
  const viewport = page.viewportSize()!;
  const bounds = await sheet.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(seen.saves).toHaveLength(1);
  expect(seen.saves[0]).toMatchObject({ code: null, modeRef: MODE, state: "DRAFT", lines: [{ materialRef: MATERIAL, assetModelRef: null, proportion: 0.705, materialClass: "NEW" }, { materialRef: null, assetModelRef: ASSET, proportion: 0.295, materialClass: "REUSABLE", disposition: "RETURNABLE", chargeType: "USAGE" }] });
  expect(seen.unexpected).toEqual([]);
});

test("edita, duplica y elimina filas conservando condiciones y código históricos", async ({ page }) => {
  const original = existingPolicy();
  const seen = await fixture(page, { policies: [original] });
  await openPolicies(page);
  await page.getByRole("button", { name: /POL-LEGACY Política sintética existente/ }).click();
  const sheet = page.getByTestId("material-policy-sheet");
  await expect(sheet.getByLabel("Porcentaje, fila 1", { exact: true })).toHaveValue("100");
  await sheet.getByRole("button", { name: "Duplicar fila 1", exact: true }).click();
  await expect(sheet.getByLabel("Clase, fila 2", { exact: true })).toHaveValue("NEW");
  await sheet.getByRole("button", { name: "Eliminar fila 2", exact: true }).click();
  await expect(sheet.getByLabel("Clase, fila 2", { exact: true })).toHaveCount(0);
  await sheet.getByLabel("Nombre de la política", { exact: true }).fill("Nombre actualizado");
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(seen.saves).toHaveLength(1);
  expect(seen.saves[0]).toMatchObject({ policyRef: POLICY, expectedVersion: 3, code: "POL-LEGACY", validFrom: original.validFrom, validTo: original.validTo, standardCode: "SPECIAL", preferenceCode: "REUSABLE_ALLOWED", lines: [{ proportion: 1, ...RULES }] });
  expect(seen.unexpected).toEqual([]);
});

test("muestra el error en la fila y bloquea porcentajes inválidos o un total incompleto", async ({ page }) => {
  const seen = await fixture(page);
  const sheet = await newPolicy(page);
  await fillValidPolicy(page);
  await sheet.getByLabel("Porcentaje, fila 1", { exact: true }).fill("101");
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet.getByText(/Fila 1: Use un porcentaje entre 0 y 100/)).toBeVisible();
  expect(seen.saves).toHaveLength(0);
  await sheet.getByLabel("Porcentaje, fila 1", { exact: true }).fill("70");
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet.getByText("Las proporciones declaradas deben sumar 100 %.", { exact: true })).toBeVisible();
  expect(seen.saves).toHaveLength(0);
  await sheet.getByLabel("Porcentaje, fila 1", { exact: true }).fill("100");
  await sheet.getByLabel("Clase, fila 1", { exact: true }).fill("");
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet.getByText(/Fila 1: Indique la clase/)).toBeVisible();
  expect(seen.saves).toHaveLength(0);
  expect(seen.unexpected).toEqual([]);
});

test("un fallo en la segunda página conserva el borrador y no usa un catálogo parcial", async ({ page }) => {
  const seen = await fixture(page, { secondPageFails: true });
  const sheet = await newPolicy(page);
  await sheet.getByLabel("Nombre de la política", { exact: true }).fill("Borrador conservado");
  await expect(sheet.getByText(/No fue posible cargar el catálogo/)).toBeVisible();
  await expect(sheet.getByLabel("Material o recurso, fila 1", { exact: true })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Guardar política", exact: true })).toBeDisabled();
  expect(await sheet.getByLabel("Material o recurso, fila 1", { exact: true }).locator("option").count()).toBe(1);
  seen.allowSecondPage();
  await sheet.getByRole("button", { name: "Actualizar catálogo de materiales y recursos", exact: true }).click();
  await expect(sheet.getByLabel("Material o recurso, fila 1", { exact: true })).toBeEnabled();
  await expect(sheet.getByLabel("Nombre de la política", { exact: true })).toHaveValue("Borrador conservado");
  await sheet.getByLabel("Tipo, fila 1", { exact: true }).selectOption("ASSET");
  await expect(sheet.getByLabel("Material o recurso, fila 1", { exact: true }).getByRole("option", { name: /Manta sintética/ })).toHaveCount(1);
  expect(seen.saves).toHaveLength(0);
  expect(seen.unexpected).toEqual([]);
});

test("reintenta un guardado incierto con la misma solicitud y sin duplicar política", async ({ page }) => {
  const seen = await fixture(page, { abortFirstSave: true });
  const sheet = await newPolicy(page);
  await fillValidPolicy(page);
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet.getByText(/No se pudo confirmar el guardado/)).toBeVisible();
  await expect(sheet.getByLabel("Nombre de la política", { exact: true })).toHaveValue("Composición sintética");
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(seen.saves).toHaveLength(2);
  expect(seen.saves[0].requestId).toBe(seen.saves[1].requestId);
  expect(seen.saves[0].payloadHash).toBe(seen.saves[1].payloadHash);
  expect(seen.committed.size).toBe(1);
  expect(seen.unexpected).toEqual([]);
});

test("un recurso histórico ausente queda visible y exige elegir uno activo", async ({ page }) => {
  const seen = await fixture(page, { policies: [existingPolicy()], resources: RESOURCES.slice(1) });
  await openPolicies(page);
  await page.getByRole("button", { name: /POL-LEGACY Política sintética existente/ }).click();
  const sheet = page.getByTestId("material-policy-sheet");
  await expect(sheet.getByText(/Este recurso ya no está disponible/)).toBeVisible();
  await expect(sheet.getByLabel("Material o recurso, fila 1", { exact: true })).toHaveValue(MATERIAL);
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  expect(seen.saves).toHaveLength(0);
  await expect(sheet.getByLabel("Clase, fila 1", { exact: true })).toHaveValue("NEW");
  expect(seen.unexpected).toEqual([]);
});

test("editar después de una respuesta perdida no crea otra política", async ({ page }) => {
  const seen = await fixture(page, { abortFirstSave: true });
  const sheet = await newPolicy(page);
  await fillValidPolicy(page);
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet.getByText(/No se pudo confirmar el guardado/)).toBeVisible();
  await sheet.getByLabel("Nombre de la política", { exact: true }).fill("Nombre corregido después del intento");
  await sheet.getByRole("button", { name: "Guardar política", exact: true }).click();
  await expect(sheet.getByText(/Ya se confirmó un guardado anterior/)).toBeVisible();
  expect(seen.saves).toHaveLength(2);
  expect(seen.saves[0].requestId).toBe(seen.saves[1].requestId);
  expect(seen.saves[0].payloadHash).not.toBe(seen.saves[1].payloadHash);
  expect(seen.committed.size).toBe(1);
  expect(seen.unexpected).toEqual([]);
});

test("la consulta sin gestión no abre la hoja ni solicita el catálogo de recursos", async ({ page }) => {
  const seen = await fixture(page, { manage: false, policies: [existingPolicy()] });
  await openPolicies(page);
  await expect(page.getByRole("button", { name: "Nueva política", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /POL-LEGACY Política sintética existente/ })).toBeDisabled();
  await expect(page.getByTestId("material-policy-sheet")).toHaveCount(0);
  expect(seen.requests.some((path) => path.includes("view=resources"))).toBe(false);
  expect(seen.saves).toHaveLength(0);
  expect(seen.unexpected).toEqual([]);
});
