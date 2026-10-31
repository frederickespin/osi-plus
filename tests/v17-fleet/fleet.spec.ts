import { expect, test, type Page } from "@playwright/test";
import type { FleetVehicle, VehicleValues } from "../../src/admin-fleet/types";

const MEMBERSHIP = "11111111-1111-4111-8111-111111111111";
const BASE = "/api/admin/fleet/vehicles";
export const vehicleFixture = (index = 1): FleetVehicle => ({
  vehicleRef: `synthetic-vehicle-${index}`, businessCode: `IP-${String(index).padStart(3, "0")}`,
  plate: `L${String(index).padStart(6, "0")}`, vin: `VIN${String(index).padStart(5, "0")}`, vehicleType: index === 2 ? "Furgón" : "Camión",
  brand: "Marca de prueba", model: "Modelo sintético", modelYear: 2025,
  capacityWeight: 4500, capacityVolume: 28, usableLength: 6, usableWidth: 2.4, usableHeight: 2.6,
  weightUnit: "KG", volumeUnit: "CBM", dimensionUnit: "M", operationalStatus: "AVAILABLE", availableForCalculation: true,
  effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveTo: null, hubCode: "METRO", rowVersion: 1,
  updatedAt: "2026-10-31T12:00:00.000Z", retiredAt: null, calculationLocked: false,
});

async function fixture(page: Page, options: { count?: number; permissions?: string[]; denied?: string[]; role?: string; locked?: boolean; listFailure?: boolean } = {}) {
  let rows = Array.from({ length: options.count || 2 }, (_, index) => ({ ...vehicleFixture(index + 1), calculationLocked: Boolean(options.locked) }));
  let nextPatch: { code: string; status: number } | null = null;
  let listFailure = Boolean(options.listFailure);
  let malformedDetail = false;
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  const reads: URL[] = [];
  const unexpected: string[] = [];
  await page.addInitScript(({ membership, role }) => {
    localStorage.setItem("osi-plus.token", "synthetic.fleet.token");
    localStorage.setItem("osi-plus.session", JSON.stringify({ name: "Administradora de prueba", role, membershipRef: membership,
      memberships: [{ membershipRef: membership, tenantName: "Empresa sintética", role, preferred: true }] }));
  }, { membership: MEMBERSHIP, role: options.role || "A" });
  await page.route("**/api/**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store" }, body: JSON.stringify(body) });
    if (url.pathname === "/api/auth/me") return json({ ok: true, user: { name: "Administradora de prueba", role: options.role || "A", status: "ACTIVE", permissions: options.permissions || ["fleet:view", "fleet:edit"], deniedPermissions: options.denied || [],
      membership: { membershipRef: MEMBERSHIP, tenantName: "Empresa sintética", role: options.role || "A" }, memberships: [{ membershipRef: MEMBERSHIP, tenantName: "Empresa sintética", role: options.role || "A", preferred: true }] } });
    expect(request.headers().authorization).toBe("Bearer synthetic.fleet.token");
    expect(request.headers()["x-osi-membership-ref"]).toBe(MEMBERSHIP);
    if (url.pathname === BASE && request.method() === "GET") {
      reads.push(url);
      if (listFailure) return json({ ok: false, error: "ADMIN_FLEET_UNAVAILABLE" }, 503);
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const type = url.searchParams.get("vehicleType");
      const status = url.searchParams.get("operationalStatus");
      const filtered = rows.filter((row) => (!search || `${row.businessCode} ${row.plate} ${row.brand}`.toLowerCase().includes(search)) && (!type || row.vehicleType.toLowerCase().includes(type.toLowerCase())) && (!status || row.operationalStatus === status));
      const pageNumber = Number(url.searchParams.get("page")); const pageSize = Number(url.searchParams.get("pageSize"));
      return json({ ok: true, data: filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: filtered.length, page: pageNumber, pageSize });
    }
    if (url.pathname === BASE && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>; writes.push({ method: "POST", body });
      const values = { ...body }; delete values.requestId;
      const vehicle = { ...vehicleFixture(100), ...values, plate: values.plate ? String(values.plate).toUpperCase() : null } as FleetVehicle;
      rows = [...rows, vehicle]; return json({ ok: true, vehicle, created: true, idempotent: false }, 201);
    }
    const vehicle = rows.find((row) => url.pathname === `${BASE}/${row.vehicleRef}`);
    if (vehicle && request.method() === "GET") {
      if (malformedDetail) return json({ ok: true, vehicle: { ...vehicle, capacityWeight: "4500" } });
      return json({ ok: true, vehicle });
    }
    if (vehicle && request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>; writes.push({ method: "PATCH", body });
      if (nextPatch) {
        const error = nextPatch; nextPatch = null;
        if (error.code === "ADMIN_FLEET_VERSION_CONFLICT") rows = rows.map((row) => row.vehicleRef === vehicle.vehicleRef ? { ...row, model: "Modelo actualizado por otro usuario", rowVersion: 2 } : row);
        return json({ ok: false, error: error.code }, error.status);
      }
      const changes = { ...body.changes as Partial<VehicleValues> };
      if (typeof changes.plate === "string") changes.plate = changes.plate.toUpperCase();
      if (typeof changes.vin === "string") changes.vin = changes.vin.toUpperCase();
      if (Object.entries(changes).every(([key, value]) => vehicle[key as keyof VehicleValues] === value)) return json({ ok: true, vehicle });
      const updated: FleetVehicle = { ...vehicle, ...changes, rowVersion: vehicle.rowVersion + 1,
        ...(changes.operationalStatus === "RETIRED" ? { availableForCalculation: false, retiredAt: "2026-10-31T13:00:00.000Z" } : {}), updatedAt: "2026-10-31T13:00:00.000Z" };
      rows = rows.map((row) => row.vehicleRef === updated.vehicleRef ? updated : row);
      return json({ ok: true, vehicle: updated });
    }
    unexpected.push(`${request.method()} ${url.pathname}`); return json({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }, 405);
  });
  return { writes, reads, unexpected, rows: () => rows,
    failNextPatch(code: string, status = 409) { nextPatch = { code, status }; },
    recoverList() { listFailure = false; }, malformedDetail() { malformedDetail = true; } };
}

async function openFleet(page: Page) {
  await page.goto("/administration/fleet");
  await expect(page.getByRole("heading", { name: "Flota vehicular", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "IP-001", exact: true })).toBeVisible();
}
async function openVehicle(page: Page) {
  await openFleet(page);
  await page.getByRole("button", { name: "IP-001", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ficha de vehículo", exact: true });
  await expect(dialog.getByLabel("Código *", { exact: true })).toHaveValue("IP-001");
  return dialog;
}

test("tabla persistente muestra unidades, filtra y pagina; Hub conserva navegación", async ({ page }) => {
  const seen = await fixture(page, { count: 23 });
  await openFleet(page);
  await expect(page.getByRole("cell", { name: "28 m³", exact: true })).toHaveCount(20);
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(page.getByRole("button", { name: "IP-021", exact: true })).toBeVisible();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await page.getByLabel("Buscar vehículos", { exact: true }).fill("IP-002");
  await expect(page.getByRole("button", { name: "IP-002", exact: true })).toBeVisible();
  await expect(page.getByText("Página 1 de 1")).toBeVisible();
  await page.getByLabel("Filtrar por estado").selectOption("RETIRED");
  await expect(page.getByText("No hay vehículos que coincidan con estos filtros.")).toBeVisible();
  await page.getByLabel("Filtrar por estado").selectOption("");
  await page.getByLabel("Filtrar por tipo").fill("Furgón");
  await expect(page.getByRole("button", { name: "IP-002", exact: true })).toBeVisible();
  expect(seen.reads.some((url) => url.searchParams.get("vehicleType") === "Furgón" && url.searchParams.get("page") === "1")).toBe(true);
  await page.getByRole("link", { name: "Volver al Hub", exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await page.getByRole("button", { name: /Administración.*Disponible|Disponible.*Administración/ }).click();
  await expect(page.getByRole("heading", { name: "Flota vehicular", exact: true })).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/hub$/);
  expect(seen.writes).toEqual([]); expect(seen.unexpected).toEqual([]);
});

test("alta incluye unidades elegidas y edición envía sólo campos cambiados", async ({ page }, info) => {
  const seen = await fixture(page);
  await openFleet(page);
  await page.getByRole("button", { name: "Nuevo vehículo", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Nuevo vehículo", exact: true });
  await dialog.getByLabel("Código *", { exact: true }).fill("IP-100");
  await dialog.getByLabel("Tipo de vehículo *", { exact: true }).fill("Furgón");
  await dialog.getByLabel("Matrícula", { exact: true }).fill("l555555");
  await dialog.getByLabel("Unidad de peso").selectOption("LB");
  await dialog.getByLabel("Capacidad de peso (lb)", { exact: true }).fill("8000");
  await dialog.getByLabel("Unidad de volumen").selectOption("CFT");
  await dialog.getByLabel("Capacidad de volumen (pie³)", { exact: true }).fill("1500");
  await dialog.getByLabel("Unidad de dimensiones").selectOption("FT");
  await dialog.getByLabel("Largo útil (pie)", { exact: true }).fill("20");
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Ficha de vehículo", exact: true });
  await expect(dialog.getByText("Vehículo guardado.", { exact: true })).toBeVisible();
  expect(seen.writes[0]).toMatchObject({ method: "POST", body: { requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), businessCode: "IP-100", vehicleType: "Furgón", capacityWeight: 8000, weightUnit: "LB", capacityVolume: 1500, volumeUnit: "CFT", usableLength: 20, dimensionUnit: "FT", availableForCalculation: true } });
  await expect(dialog.getByLabel("Matrícula", { exact: true })).toHaveValue("L555555");
  await dialog.getByLabel("Modelo", { exact: true }).fill("Nuevo modelo");
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  await expect(dialog.getByText("Vehículo guardado.", { exact: true })).toBeVisible();
  expect(seen.writes[1]).toEqual({ method: "PATCH", body: { requestId: expect.any(String), expectedVersion: 1, changes: { model: "Nuevo modelo" } } });
  const lastField = dialog.getByLabel("Vigencia hasta", { exact: true });
  await lastField.scrollIntoViewIfNeeded();
  await expect.poll(() => dialog.evaluate((element) => {
    const footer = element.querySelector('[data-testid="fleet-editor-footer"]')!.getBoundingClientRect();
    const field = element.querySelector('[aria-label="Vigencia hasta"]')!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return { clear: field.bottom <= footer.top + 1, footerInside: footer.bottom <= box.bottom + 1, viewport: box.bottom <= innerHeight + 1 && box.top >= 0 };
  })).toEqual({ clear: true, footerInside: true, viewport: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByLabel("Código *", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/osi-fleet-19d-${info.project.name}.png`, fullPage: true, animations: "disabled" });
  expect(seen.unexpected).toEqual([]);
});

test("conflicto conserva borrador y exige lectura explícita antes de otro guardado", async ({ page }) => {
  const seen = await fixture(page);
  const dialog = await openVehicle(page);
  seen.failNextPatch("ADMIN_FLEET_VERSION_CONFLICT");
  await dialog.getByLabel("Modelo", { exact: true }).fill("Mi borrador");
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("La ficha cambió");
  await expect(dialog.getByLabel("Modelo", { exact: true })).toHaveValue("Mi borrador");
  await expect(dialog.getByRole("button", { name: "Guardar vehículo", exact: true })).toBeDisabled();
  expect(seen.writes).toHaveLength(1);
  await dialog.getByRole("button", { name: "Recargar ficha", exact: true }).click();
  await expect(dialog.getByLabel("Modelo", { exact: true })).toHaveValue("Modelo actualizado por otro usuario");
  await dialog.getByLabel("Marca", { exact: true }).fill("Marca revisada");
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  await expect(dialog.getByText("Vehículo guardado.", { exact: true })).toBeVisible();
  expect(seen.writes[1].body).toEqual({ requestId: expect.any(String), expectedVersion: 2, changes: { brand: "Marca revisada" } });
});

test("matrícula y VIN normalizados sin cambios aceptan la misma versión del servidor", async ({ page }) => {
  const seen = await fixture(page);
  const dialog = await openVehicle(page);
  await dialog.getByLabel("Matrícula", { exact: true }).fill("l000001");
  await dialog.getByLabel("VIN / chasis", { exact: true }).fill("vin00001");
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  await expect(dialog.getByText("Vehículo guardado.", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Matrícula", { exact: true })).toHaveValue("L000001");
  await expect(dialog.getByLabel("VIN / chasis", { exact: true })).toHaveValue("VIN00001");
  await expect(dialog.getByText("IP-001 · versión 1", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Guardar vehículo", exact: true })).toBeDisabled();
  expect(seen.writes).toHaveLength(1);
});

test("características usadas se bloquean; estado y retiro preservan el vehículo", async ({ page }) => {
  const seen = await fixture(page, { locked: true });
  const dialog = await openVehicle(page);
  await expect(dialog.getByLabel("Capacidad de peso (kg)", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Tipo de vehículo *", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Unidad de volumen")).toBeDisabled();
  await dialog.getByLabel("Estado operativo").selectOption("UNAVAILABLE");
  await expect(dialog.getByLabel("Disponible para cálculos")).not.toBeChecked();
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  await expect(dialog.getByText("Vehículo guardado.", { exact: true })).toBeVisible();
  expect(seen.writes[0].body).toMatchObject({ expectedVersion: 1, changes: { operationalStatus: "UNAVAILABLE", availableForCalculation: false } });
  await dialog.getByRole("button", { name: "Retirar vehículo", exact: true }).click();
  expect(seen.writes).toHaveLength(1);
  await dialog.getByRole("button", { name: "Confirmar retiro", exact: true }).click();
  await expect(dialog.getByText("Retiro guardado. La ficha permanece disponible.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Guardar vehículo", exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Estado operativo")).toBeDisabled();
  expect(seen.rows()).toHaveLength(2);
  expect(seen.writes[1].body).toMatchObject({ expectedVersion: 2, changes: { operationalStatus: "RETIRED", availableForCalculation: false } });
});

test("consulta sin edición y denegaciones explícitas no emiten escrituras", async ({ page }) => {
  const seen = await fixture(page, { denied: ["fleet:edit"] });
  const dialog = await openVehicle(page);
  await expect(page.getByRole("button", { name: "Nuevo vehículo", exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Código *", { exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Guardar vehículo", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Retirar vehículo", exact: true })).toHaveCount(0);
  expect(seen.writes).toEqual([]);
});

for (const scenario of [{ role: "K" }, { denied: ["fleet:view"] }, { permissions: ["fleet:edit"] }]) {
  test(`acceso cerrado sin rol y permiso de consulta: ${JSON.stringify(scenario)}`, async ({ page }) => {
    const seen = await fixture(page, scenario);
    await page.goto("/administration/fleet");
    await expect(page.getByTestId("hub-forbidden")).toBeVisible();
    expect(seen.reads).toEqual([]); expect(seen.writes).toEqual([]);
  });
}

test("error de lista no se presenta como lista vacía y recuperación sólo consulta", async ({ page }) => {
  const seen = await fixture(page, { listFailure: true });
  await page.goto("/administration/fleet");
  await expect(page.getByRole("alert")).toContainText("No fue posible");
  await expect(page.getByText("Todavía no hay vehículos registrados.")).toHaveCount(0);
  seen.recoverList();
  await page.getByRole("button", { name: "Reintentar consulta", exact: true }).click();
  await expect(page.getByRole("button", { name: "IP-001", exact: true })).toBeVisible();
  seen.malformedDetail();
  await page.getByRole("button", { name: "IP-001", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ficha de vehículo", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("La respuesta no permitió verificar");
  await expect(dialog.getByRole("button", { name: "Guardar vehículo", exact: true })).toBeDisabled();
  expect(seen.writes).toEqual([]);
});

test("fallo de guardado incierto no se reintenta y obliga a comprobar el registro", async ({ page }) => {
  const seen = await fixture(page);
  const dialog = await openVehicle(page);
  seen.failNextPatch("ADMIN_FLEET_UNAVAILABLE", 503);
  await dialog.getByLabel("Marca", { exact: true }).fill("Mi marca");
  await dialog.getByRole("button", { name: "Guardar vehículo", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Guardar vehículo", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Marca", { exact: true })).toHaveValue("Mi marca");
  expect(seen.writes).toHaveLength(1);
});
