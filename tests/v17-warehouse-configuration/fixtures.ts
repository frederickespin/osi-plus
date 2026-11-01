import { expect, type Page, type Route } from "@playwright/test";
import type { WarehouseLocationRow, WarehouseRow } from "../../src/materials-inventory/api";
import type { WarehouseAreaUse, WarehouseConfiguration, WarehouseLocationConfiguration } from "../../src/warehouses/configurationTypes";
import { session } from "../v17-warehouses/fixtures";

export { nonAuth, selectSection } from "../v17-warehouses/fixtures";
export const STOCK = ["inventory:stock:view"];
export const MANAGER = [...STOCK, "inventory:catalog:manage"];
export const WAREHOUSE_REF = "81111111-1111-4111-8111-111111111111";
export const ROOT_REF = "83333333-3333-4333-8333-333333333333";
export const ZONE_REF = "84444444-4444-4444-8444-444444444444";
export const BIN_REF = "85555555-5555-4555-8555-555555555555";
export const USE_REF = "86666666-6666-4666-8666-666666666666";
export const CONFIG_REF = "87777777-7777-4777-8777-777777777777";
export const USE: WarehouseAreaUse = { useRef: USE_REF, code: "USO-0001", name: "Uso sintético", description: null, purpose: "INTERNAL", status: "ACTIVE", version: 1, assignedLocationCount: 0 };
const location = (locationRef: string, parentLocationRef: string | null, name: string, code: string, kind: string, depth: number): WarehouseLocationRow => ({ locationRef, parentLocationRef, name, code, kind, depth, path: code, status: "ACTIVE", version: 1 });
export const WAREHOUSE: WarehouseRow = { warehouseRef: WAREHOUSE_REF, code: "ALM-0001", name: "Almacén sintético", status: "ACTIVE", version: 1, locations: [
  location(ROOT_REF, null, "Almacén sintético", "ALM-0001", "WAREHOUSE_ROOT", 0),
  location(ZONE_REF, ROOT_REF, "Zona sintética", "ALM-0001-Z01", "ZONE", 1),
  location(BIN_REF, ZONE_REF, "Posición sintética", "ALM-0001-Z01-P01", "BIN", 2),
] };
export function configuration(locationRef: string, overrides: Partial<WarehouseLocationConfiguration> = {}): WarehouseLocationConfiguration {
  return { locationRef, warehouseRef: WAREHOUSE_REF, configRef: null, version: 0, areaUseRef: null, characteristics: null, notes: null, operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED", lastControlReason: null, effective: { operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED", canReceive: true, canDispatch: true, inherited: false, blockedBy: [] }, ...overrides };
}
export function emptyConfiguration(): WarehouseConfiguration { return { areaUses: [], locations: [configuration(ROOT_REF), configuration(ZONE_REF), configuration(BIN_REF)] }; }
export function fulfill(route: Route, data: unknown, status = 200) { return route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Origin" }, body: JSON.stringify(status >= 400 ? { ok: false, error: data } : { ok: true, data }) }); }

export async function configurationSession(page: Page, permissions: readonly string[] = MANAGER, initial = emptyConfiguration(), denied: readonly string[] = []) {
  const base = await session(page, permissions, denied, [WAREHOUSE]);
  let data = initial;
  await page.route("**/api/materials/warehouse-configuration", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe("Bearer synthetic.warehouses.test.token");
    if (!permissions.includes("inventory:stock:view") || denied.includes("inventory:stock:view")) {
      base.unexpected.push("FORBIDDEN GET /api/materials/warehouse-configuration");
      return fulfill(route, "WAREHOUSE_CONFIGURATION_FORBIDDEN", 403);
    }
    return fulfill(route, data);
  });
  return { ...base, getConfiguration: () => data, setConfiguration(next: WarehouseConfiguration) { data = next; } };
}
