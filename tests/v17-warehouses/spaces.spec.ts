import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { WarehouseLocationRow, WarehouseRow } from "../../src/materials-inventory/api";
import { selectSection, session } from "./fixtures";

const EDIT = ["inventory:stock:view", "inventory:catalog:manage"];
const WAREHOUSE = "348f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ROOT = "448f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const ZONE = "548f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
const BIN = "648f6d8f-8d11-4f39-8a2d-1b6c7e8f9012";
function fixture(): WarehouseRow {
  return {
    warehouseRef: WAREHOUSE, code: "ALM-EXISTENTE", name: "Almacén central", status: "ACTIVE", version: 3,
    locations: [
      { locationRef: ROOT, parentLocationRef: null, code: "CENTRAL", name: "Almacén central", kind: "WAREHOUSE_ROOT", depth: 0, path: "CENTRAL", status: "ACTIVE", version: 2 },
      { locationRef: ZONE, parentLocationRef: ROOT, code: "ZONA-01", name: "Embalaje", kind: "ZONE", depth: 1, path: "CENTRAL/ZONA-01", status: "ACTIVE", version: 4 },
      { locationRef: BIN, parentLocationRef: ZONE, code: "POS-01", name: "Posición superior", kind: "BIN", depth: 2, path: "CENTRAL/ZONA-01/POS-01", status: "ACTIVE", version: 1 },
    ],
  };
}

async function warehouseApi(page: Page, initial: WarehouseRow[] = [], options: { dropFirstWrite?: boolean; dropBeforeWrite?: boolean; conflict?: boolean; failFirstRead?: boolean; forbidFirstRetry?: boolean } = {}) {
  let rows = initial;
  let dropped = false;
  let failingRead = Boolean(options.failFirstRead);
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const receipts = new Map<string, WarehouseRow | WarehouseLocationRow>();
  await page.route("**/api/materials/warehouses**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
    if (request.method() === "GET") {
      if (failingRead) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "MATERIALS_DATABASE_UNAVAILABLE" }) });
      return fulfill(rows);
    }
    expect(request.headers().authorization).toBe("Bearer synthetic.warehouses.test.token");
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ method: request.method(), path, body });
    expect(body).not.toHaveProperty("code");
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("locations");
    expect(body.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    if (options.dropBeforeWrite && writes.length === 1) return route.abort("connectionreset");
    if (options.forbidFirstRetry && writes.length === 2) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, error: "MATERIALS_FORBIDDEN" }) });
    if (options.conflict) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: "MATERIALS_VERSION_CONFLICT" }) });
    const id = String(body.requestId);
    if (receipts.has(id)) return fulfill(receipts.get(id), request.method() === "POST" ? 201 : 200);
    let saved: WarehouseRow | WarehouseLocationRow;
    if (request.method() === "POST" && path === "/api/materials/warehouses") {
      expect(Object.keys(body).sort()).toEqual(["name", "payloadHash", "requestId"]);
      const code = "ALM-A1B2C3D4E5F60001";
      const root: WarehouseLocationRow = { locationRef: randomUUID(), parentLocationRef: null, code, name: String(body.name), kind: "WAREHOUSE_ROOT", depth: 0, path: code, status: "ACTIVE", version: 1 };
      saved = { warehouseRef: randomUUID(), code, name: String(body.name), status: "ACTIVE", version: 1, locations: [root] };
      rows = [...rows, saved];
    } else if (request.method() === "POST") {
      expect(path).toBe("/api/materials/warehouses/locations");
      const warehouse = rows.find((row) => row.warehouseRef === body.warehouseRef)!;
      const parent = warehouse.locations.find((location) => location.locationRef === body.parentLocationRef)!;
      expect(parent).toBeTruthy();
      const code = "UBI-A1B2C3D4E5F60002";
      saved = { locationRef: randomUUID(), parentLocationRef: parent.locationRef, code, name: String(body.name), kind: String(body.kind), depth: parent.depth + 1, path: `${parent.path}/${code}`, status: "ACTIVE", version: 1 };
      rows = rows.map((row) => row.warehouseRef === warehouse.warehouseRef ? { ...row, locations: [...row.locations, saved as WarehouseLocationRow] } : row);
    } else if (path.includes("/locations/")) {
      const locationRef = path.split("/").at(-1);
      const warehouse = rows.find((row) => row.locations.some((location) => location.locationRef === locationRef))!;
      const location = warehouse.locations.find((row) => row.locationRef === locationRef)!;
      expect(body.expectedVersion).toBe(location.version);
      saved = { ...location, name: String(body.name), version: location.version + 1 };
      rows = rows.map((row) => row.warehouseRef === warehouse.warehouseRef ? { ...row, locations: row.locations.map((location) => location.locationRef === locationRef ? saved as WarehouseLocationRow : location) } : row);
    } else {
      const warehouseRef = path.split("/").at(-1);
      const warehouse = rows.find((row) => row.warehouseRef === warehouseRef)!;
      expect(body.expectedVersion).toBe(warehouse.version);
      saved = { ...warehouse, name: String(body.name), version: warehouse.version + 1, locations: warehouse.locations.map((location) => location.parentLocationRef === null ? { ...location, name: String(body.name), version: location.version + 1 } : location) };
      rows = rows.map((row) => row.warehouseRef === warehouseRef ? saved as WarehouseRow : row);
    }
    receipts.set(id, saved);
    if (options.dropFirstWrite && !dropped) { dropped = true; return route.abort("connectionreset"); }
    return fulfill(saved, request.method() === "POST" ? 201 : 200);
  });
  return { writes, rows: () => rows, recoverReads: () => { failingRead = false; } };
}

test("alta de almacén sin código manual ni ubicaciones inventadas, con campos compactos", async ({ page }, info) => {
  const seen = await session(page, EDIT); const api = await warehouseApi(page);
  await page.goto("/warehouses/spaces");
  await expect(page.getByText("Todavía no hay almacenes registrados.")).toBeVisible();
  await page.getByRole("button", { name: "Nuevo almacén", exact: true }).click();
  const panel = page.getByRole("region", { name: "Nuevo almacén", exact: true });
  await expect(panel.getByText("Código automático al guardar.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(panel.getByRole("textbox")).toHaveCount(1);
  const name = panel.getByLabel("Nombre del almacén", { exact: true });
  await expect(name).toBeFocused();
  await expect.poll(async () => Math.round((await name.boundingBox())!.height)).toBe(info.project.name.endsWith("mobile") ? 32 : 28);
  await name.fill("Almacén norte");
  await page.screenshot({ path: `/tmp/osi-warehouses-20a-create-${info.project.name}.png`, fullPage: true });
  await panel.getByRole("button", { name: "Guardar almacén" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(1);
  await expect(page.getByTestId("warehouse-space-row").getByText("Almacén norte", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1); expect(api.rows()[0].locations).toHaveLength(1);
  expect(api.rows()[0].locations[0].parentLocationRef).toBeNull();
  expect(seen.unexpected).toEqual([]);
});

test("ubicación explícita bajo un padre, búsqueda con antecesores y árbol plegable", async ({ page }, info) => {
  await session(page, EDIT); const api = await warehouseApi(page, [fixture()]);
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Agregar ubicación en Embalaje", exact: true }).click();
  const panel = page.getByRole("region", { name: "Nueva ubicación", exact: true });
  await panel.getByLabel("Nombre de la ubicación", { exact: true }).fill("Estante lateral");
  await expect(panel.getByLabel("Dentro de", { exact: true })).toHaveValue(ZONE);
  await panel.getByLabel("Tipo de ubicación", { exact: true }).selectOption("RACK");
  await panel.getByRole("button", { name: "Guardar ubicación" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(4);
  expect(api.writes[0].body).toMatchObject({ warehouseRef: WAREHOUSE, parentLocationRef: ZONE, kind: "RACK", name: "Estante lateral" });
  await page.getByRole("button", { name: "Contraer Embalaje", exact: true }).click();
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(2);
  await page.getByLabel("Buscar almacenes y ubicaciones").fill("Estante lateral");
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(3);
  await expect(page.getByTestId("warehouse-space-row").getByText("Almacén central", { exact: true })).toBeVisible();
  await expect(page.getByTestId("warehouse-space-row").getByText("Embalaje", { exact: true })).toBeVisible();
  await page.getByLabel("Buscar almacenes y ubicaciones").fill("");
  await page.getByRole("button", { name: "Expandir Embalaje", exact: true }).click();
  await page.screenshot({ path: `/tmp/osi-warehouses-20a-tree-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("editar nombres conserva códigos y referencias y envía la versión visible", async ({ page }) => {
  await session(page, EDIT); const api = await warehouseApi(page, [fixture()]);
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Cambiar nombre de Almacén central", exact: true }).click();
  await page.getByLabel("Nombre del almacén", { exact: true }).fill("Almacén principal");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
  await expect(page.getByTitle("Almacén principal", { exact: true })).toBeVisible();
  expect(api.writes[0]).toMatchObject({ method: "PATCH", path: `/api/materials/warehouses/${WAREHOUSE}`, body: { expectedVersion: 3, name: "Almacén principal" } });
  await page.getByRole("button", { name: "Cambiar nombre de Embalaje", exact: true }).click();
  await page.getByLabel("Nombre de la ubicación", { exact: true }).fill("Embalaje seco");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
  await expect(page.getByTestId("warehouse-space-row").getByText("Embalaje seco", { exact: true })).toBeVisible();
  expect(api.writes[1]).toMatchObject({ method: "PATCH", path: `/api/materials/warehouses/locations/${ZONE}`, body: { expectedVersion: 4 } });
  expect(api.rows()[0].code).toBe("ALM-EXISTENTE");
  expect(api.rows()[0].locations.map(({ locationRef, code, parentLocationRef }) => ({ locationRef, code, parentLocationRef }))).toEqual(fixture().locations.map(({ locationRef, code, parentLocationRef }) => ({ locationRef, code, parentLocationRef })));
});

test("una respuesta perdida conserva el intento al cerrar y reabrir, sin duplicar el alta", async ({ page }) => {
  await session(page, EDIT); const api = await warehouseApi(page, [], { dropFirstWrite: true });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Nuevo almacén", exact: true }).click();
  await page.getByLabel("Nombre del almacén", { exact: true }).fill("Almacén de recepción");
  await page.getByRole("button", { name: "Guardar almacén" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await expect(page.getByLabel("Nombre del almacén", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reabrir guardado" }).click();
  await page.getByRole("button", { name: "Reintentar guardado" }).click();
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(1);
  expect(api.writes).toHaveLength(2);
  expect(api.writes[1].body).toEqual(api.writes[0].body);
  expect(api.rows()).toHaveLength(1);
});

test("el conflicto de versión exige recargar sin mostrar un nombre no guardado", async ({ page }) => {
  await session(page, EDIT); const api = await warehouseApi(page, [fixture()], { conflict: true });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Cambiar nombre de Embalaje", exact: true }).click();
  await page.getByLabel("Nombre de la ubicación", { exact: true }).fill("Cambio pendiente");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByRole("alert")).toContainText("Otra persona modificó este registro");
  await expect(page.getByRole("button", { name: "Guardar nombre" })).toHaveCount(0);
  await page.getByRole("button", { name: "Actualizar listado" }).click();
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
  await expect(page.getByTestId("warehouse-space-row").getByText("Embalaje", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
});

test("el intento pendiente sobrevive a navegación, recarga y un rechazo previo al comprobante", async ({ page }) => {
  await session(page, [...EDIT, "inventory:catalog:view"]);
  const api = await warehouseApi(page, [], { dropFirstWrite: true, forbidFirstRetry: true });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Nuevo almacén", exact: true }).click();
  await page.getByLabel("Nombre del almacén", { exact: true }).fill("Almacén de prueba recuperable");
  await page.getByRole("button", { name: "Guardar almacén" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await selectSection(page, "/warehouses/materials");
  await expect(page.getByRole("heading", { name: "Materiales e Inventario", exact: true })).toBeVisible();
  await selectSection(page, "/warehouses/spaces");
  await expect(page.getByLabel("Nombre del almacén", { exact: true })).toHaveValue("Almacén de prueba recuperable");
  await page.reload();
  await expect(page.getByLabel("Nombre del almacén", { exact: true })).toBeDisabled();
  expect(api.writes).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar guardado" }).click();
  await expect(page.getByRole("alert")).toContainText("El guardado anterior sigue sin confirmar");
  await page.reload();
  await expect(page.getByLabel("Nombre del almacén", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reintentar guardado" }).click();
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
  expect(api.writes).toHaveLength(3);
  for (const write of api.writes) expect(write.body).toEqual(api.writes[0].body);
  expect(api.rows()).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(1);
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
});

test("un fallo de consulta ofrece reintento y no aparenta un almacén vacío", async ({ page }) => {
  await session(page, EDIT); const api = await warehouseApi(page, [fixture()], { failFirstRead: true });
  await page.goto("/warehouses/spaces");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Todavía no hay almacenes registrados.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toBeDisabled();
  api.recoverReads();
  await page.getByRole("button", { name: "Reintentar consulta" }).click();
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("un conflicto de versión confirmado después de una pérdida de respuesta permite recargar", async ({ page }) => {
  await session(page, EDIT); const api = await warehouseApi(page, [fixture()], { dropBeforeWrite: true, conflict: true });
  await page.goto("/warehouses/spaces");
  await page.getByRole("button", { name: "Cambiar nombre de Embalaje", exact: true }).click();
  await page.getByLabel("Nombre de la ubicación", { exact: true }).fill("Nombre pendiente");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  await page.getByRole("button", { name: "Reintentar guardado" }).click();
  await expect(page.getByRole("alert")).toContainText("Otra persona modificó este registro");
  await page.getByRole("button", { name: "Actualizar listado" }).click();
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nuevo almacén", exact: true })).toBeEnabled();
  expect(api.writes).toHaveLength(2); expect(api.writes[1].body).toEqual(api.writes[0].body);
  await page.reload();
  await expect(page.getByTestId("warehouse-space-row")).toHaveCount(3);
  await expect(page.getByTestId("warehouse-inline-editor")).toHaveCount(0);
});

test("antecesores inactivos no permiten crear ubicaciones y la ayuda restaura el foco", async ({ page }) => {
  const warehouse = fixture();
  const inactive = { ...warehouse, locations: warehouse.locations.map((location) => location.locationRef === ZONE ? { ...location, status: "INACTIVE" } : location) };
  await session(page, EDIT); await warehouseApi(page, [inactive]);
  await page.goto("/warehouses/spaces");
  await expect(page.getByRole("button", { name: "Agregar ubicación en Embalaje", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Agregar ubicación en Posición superior", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Agregar ubicación en Almacén central", exact: true }).click();
  await expect(page.getByLabel("Dentro de", { exact: true }).getByRole("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Ayuda de Espacios y ubicaciones", exact: true }).click();
  await expect(page.getByText(/cada alta crea una sola ubicación/)).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ayuda" }).click();
  await expect(page.getByRole("button", { name: "Ayuda de Espacios y ubicaciones", exact: true })).toBeFocused();
});
