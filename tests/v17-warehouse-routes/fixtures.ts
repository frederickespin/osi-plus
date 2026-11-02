import { randomUUID } from "node:crypto";
import { expect, type Page, type Route } from "@playwright/test";
import { normalizeWarehouseSheetSave } from "../../api/_lib/warehouseSheetContract.js";
import { normalizeWarehouseAreaUseCreate } from "../../api/_lib/warehouseConfigurationContract.js";
import { allocateWarehouseAddressOrdinal, formatWarehouseAddress, warehouseAddressOrdinal, warehouseAddressSegments, warehouseAddressIdentifier, warehouseAddressSegmentsFromIdentifier } from "../../shared/warehouseSheetAddress.js";
import type { WarehouseSheet, WarehouseSheetLocation, WarehouseSheetSaved } from "../../src/warehouses/sheetTypes";
import type { WarehouseAreaUse, WarehouseConfiguration } from "../../src/warehouses/configurationTypes";
import { session } from "../v17-warehouses/fixtures";
import { BIN_REF, ROOT_REF, USE, USE_REF, WAREHOUSE, WAREHOUSE_REF, ZONE_REF, fulfill } from "../v17-warehouse-configuration/fixtures";

export { BIN_REF, ROOT_REF, USE, USE_REF, WAREHOUSE_REF, ZONE_REF, fulfill };
export { nonAuth, selectSection } from "../v17-warehouses/fixtures";
export const STOCK = ["inventory:stock:view"];
export const MANAGER = [...STOCK, "inventory:catalog:manage"];
export const MANAGER_REF = "89999999-9999-4999-8999-999999999999";
export const PERSON = { membershipRef: MANAGER_REF, displayName: "Encargada sintética" };
const initialRoot = warehouseAddressSegments(null, "WAREHOUSE_ROOT", 1);
const initialZone = warehouseAddressSegmentsFromIdentifier(initialRoot, "ZONE", "TRD");
const initialRack = warehouseAddressSegmentsFromIdentifier(initialZone, "RACK", "AA");
export const SHEET: WarehouseSheet = { ...WAREHOUSE, name: "Almacén 1", profileVersion: 1, warehouseNumber: 1, warehouseLabel: "ALM-01", manager: null, rootLocationRef: ROOT_REF, rootAreaUseRef: null, rootConfigurationVersion: 0,
  locations: [{ ...WAREHOUSE.locations[0], name: "Almacén 1", areaUseRef: null, configurationVersion: 0, address: { ...initialRoot, label: formatWarehouseAddress(initialRoot) } }] };
export const POPULATED_SHEET: WarehouseSheet = { ...SHEET, locations: [...SHEET.locations,
  { ...WAREHOUSE.locations[1], name: "Zona TRD", areaUseRef: USE_REF, configurationVersion: 1, address: { ...initialZone, label: formatWarehouseAddress(initialZone) } },
  { ...WAREHOUSE.locations[2], name: "Estantería AA", kind: "RACK", areaUseRef: USE_REF, configurationVersion: 1, address: { ...initialRack, label: formatWarehouseAddress(initialRack) } },
] };


type RawCommand = Record<string, unknown>;
type Behavior = (route: Route, raw: RawCommand, confirm: () => WarehouseSheetSaved) => Promise<unknown>;
type Options = { sheets?: readonly WarehouseSheet[]; uses?: readonly WarehouseAreaUse[]; permissions?: readonly string[]; denied?: readonly string[]; readError?: string };
const clone = <T,>(value: T): T => structuredClone(value);

// Only intercepted synthetic API responses. No database, deployment or external
// identity endpoint is contacted by this browser fixture.
export async function sheetSession(page: Page, options: Options = {}) {
  const permissions = options.permissions ?? MANAGER, denied = options.denied ?? [];
  let sheets = clone(options.sheets ?? [SHEET]); let uses = clone(options.uses ?? [USE]);
  const base = await session(page, permissions, denied, sheets);
  const commands: RawCommand[] = []; const receipts = new Map<string, { hash: string; result: WarehouseSheetSaved }>();
  let behavior: Behavior | null = null; let readError = options.readError;
  const browserErrors: string[] = []; page.on("pageerror", (error) => browserErrors.push(error.message));
  const canRead = permissions.includes("inventory:stock:view") && !denied.includes("inventory:stock:view");
  const canWrite = canRead && permissions.includes("inventory:catalog:manage") && !denied.includes("inventory:catalog:manage");
  function configuration(): WarehouseConfiguration {
    return { areaUses: uses, locations: sheets.flatMap((warehouse) => warehouse.locations.map((location) => ({
      locationRef: location.locationRef, warehouseRef: warehouse.warehouseRef, configRef: location.configurationVersion ? randomUUID() : null,
      version: location.configurationVersion, areaUseRef: location.areaUseRef, characteristics: null, notes: null,
      operationalStatus: "ACTIVE" as const, availabilityRule: "CONDITION_BASED" as const, lastControlReason: null,
      effective: { operationalStatus: "ACTIVE" as const, availabilityRule: "CONDITION_BASED" as const, canReceive: true, canDispatch: true, inherited: false, blockedBy: [] },
    }))) };
  }
  function confirm(raw: RawCommand): WarehouseSheetSaved {
    const input = normalizeWarehouseSheetSave(raw);
    const receipt = receipts.get(input.requestId);
    if (receipt) { expect(receipt.hash).toBe(input.payloadHash); return clone(receipt.result); }
    const current = input.warehouseRef ? sheets.find((sheet) => sheet.warehouseRef === input.warehouseRef) : null;
    if (input.warehouseRef) expect(current).toBeTruthy();
    const warehouseRef = current?.warehouseRef ?? randomUUID();
    const warehouseNumber = current?.warehouseNumber ?? allocateWarehouseAddressOrdinal("WAREHOUSE_ROOT", sheets.map((sheet) => sheet.warehouseNumber).filter((value): value is number => value !== null));
    const warehouseCode = current?.code ?? `ALM-${input.requestId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const rootRef = current?.rootLocationRef ?? randomUUID();
    const rootAddress = warehouseAddressSegments(null, "WAREHOUSE_ROOT", warehouseNumber);
    const locations: WarehouseSheetLocation[] = current ? clone([...current.locations]) : [{ locationRef: rootRef, parentLocationRef: null, code: warehouseCode, name: input.name, kind: "WAREHOUSE_ROOT", depth: 0, path: warehouseCode, status: "ACTIVE", version: 1, configurationVersion: 0, areaUseRef: null, address: { ...rootAddress, label: formatWarehouseAddress(rootAddress) } }];
    const locate = (ref: string) => locations.find((row) => row.locationRef === ref)!;
    const replace = (next: WarehouseSheetLocation) => { locations[locations.findIndex((row) => row.locationRef === next.locationRef)] = next; };
    const root = locate(rootRef); expect(root).toBeTruthy();
    replace({ ...root, name: input.name, version: root.version + (root.name !== input.name ? 1 : 0), areaUseRef: input.rootAreaUseRef, configurationVersion: root.configurationVersion + (root.areaUseRef !== input.rootAreaUseRef ? 1 : 0), address: root.address ?? { ...rootAddress, label: formatWarehouseAddress(rootAddress) } });
    const byRow = new Map<string, string>();
    const fields = { ZONE: "zoneNumber", AISLE: "aisleNumber", RACK: "rackCode", LEVEL: "levelNumber", BIN: "positionNumber" } as const;
    const ensureAddress = (location: WarehouseSheetLocation): WarehouseSheetLocation => {
      if (location.address || !location.parentLocationRef || !(location.kind in fields)) return location;
      const parent = ensureAddress(locate(location.parentLocationRef));
      if (!parent.address) return location;
      const kind = location.kind as keyof typeof fields;
      const used = locations.filter((row) => row.parentLocationRef === parent.locationRef && row.kind === kind && row.address && !(kind === "ZONE" && row.address.zoneCode)).map((row) => kind === "RACK" ? warehouseAddressOrdinal(kind, row.address!.rackCode!) : row.address![fields[kind]] as number);
      for (const explicit of input.rows) {
        if (explicit.action !== "CREATE" || explicit.kind !== kind || explicit.identifier === undefined || kind === "ZONE" && /[A-Z]/.test(explicit.identifier)) continue;
        const explicitParent = explicit.parentRowId ? byRow.get(explicit.parentRowId) : explicit.parentLocationRef ?? rootRef;
        if (explicitParent === parent.locationRef) used.push(warehouseAddressOrdinal(kind, explicit.identifier));
      }
      const segments = warehouseAddressSegments(parent.address, kind, allocateWarehouseAddressOrdinal(kind, used));
      const next = { ...location, address: { ...segments, label: formatWarehouseAddress(segments) } }; replace(next); return next;
    };
    for (const row of input.rows.filter((entry) => entry.action === "UPDATE")) {
      const location = locate(row.locationRef); expect(location).toBeTruthy();
      const updated = { ...location, name: row.name, areaUseRef: row.areaUseRef, version: location.version + (location.name !== row.name ? 1 : 0), configurationVersion: location.configurationVersion + (location.areaUseRef !== row.areaUseRef ? 1 : 0) };
      replace(updated); ensureAddress(updated); byRow.set(row.rowId, row.locationRef);
    }
    const pending = input.rows.filter((entry) => entry.action === "CREATE");
    while (pending.length) {
      const index = pending.findIndex((row) => !row.parentRowId || byRow.has(row.parentRowId)); expect(index).toBeGreaterThanOrEqual(0);
      const [row] = pending.splice(index, 1); const parent = ensureAddress(locate(row.parentRowId ? byRow.get(row.parentRowId)! : row.parentLocationRef ?? rootRef));
      const reused = row.identifier === undefined ? null : locations.find((location) => location.parentLocationRef === parent.locationRef && location.kind === row.kind && location.address && warehouseAddressIdentifier(row.kind, location.address) === row.identifier);
      if (reused) { expect(reused.name).toBe(row.name); expect(reused.areaUseRef).toBe(row.areaUseRef); byRow.set(row.rowId, reused.locationRef); continue; }
      const explicitAddress = row.identifier === undefined ? null : warehouseAddressSegmentsFromIdentifier(parent.address!, row.kind, row.identifier);
      const code = `UBI-${row.rowId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
      const location: WarehouseSheetLocation = { locationRef: randomUUID(), parentLocationRef: parent.locationRef, code, name: row.name, kind: row.kind, depth: parent.depth + 1, path: `${parent.path}/${code}`, status: "ACTIVE", version: 1, configurationVersion: row.areaUseRef ? 1 : 0, areaUseRef: row.areaUseRef, address: explicitAddress ? { ...explicitAddress, label: formatWarehouseAddress(explicitAddress) } : null };
      locations.push(location); ensureAddress(location); byRow.set(row.rowId, location.locationRef);
    }
    const saved: WarehouseSheet = { warehouseRef, code: warehouseCode, name: input.name, status: current?.status ?? "ACTIVE", version: current ? current.version + 1 : 1, profileVersion: (current?.profileVersion ?? 0) + 1, warehouseNumber, warehouseLabel: `ALM-${String(warehouseNumber).padStart(2, "0")}`,
      manager: input.managerMembershipRef ? { membershipRef: input.managerMembershipRef, displayName: PERSON.displayName, eligible: true } : null,
      rootLocationRef: rootRef, rootAreaUseRef: input.rootAreaUseRef, rootConfigurationVersion: locate(rootRef).configurationVersion, locations };
    sheets = current ? sheets.map((sheet) => sheet.warehouseRef === warehouseRef ? saved : sheet) : [...sheets, saved]; base.setWarehouses(sheets);
    const result = { warehouse: saved, rowResults: input.rows.map((row) => ({ rowId: row.rowId, locationRef: byRow.get(row.rowId)! })) };
    receipts.set(input.requestId, { hash: input.payloadHash, result: clone(result) }); return clone(result);
  }
  await page.route("**/api/materials/warehouse-configuration", async (route) => fulfill(route, configuration()));
  await page.route("**/api/materials/warehouse-sheets/manager-options**", async (route) => {
    expect(route.request().method()).toBe("GET"); expect(canWrite).toBe(true);
    expect(route.request().headers().authorization).toBe("Bearer synthetic.warehouses.test.token");
    const query = new URL(route.request().url()).searchParams; const q = query.get("q")?.toLowerCase();
    const data = !q || PERSON.displayName.toLowerCase().includes(q) ? [PERSON] : [];
    return fulfill(route, { data, total: data.length, page: Number(query.get("page") ?? 1), pageSize: Number(query.get("pageSize") ?? 25) });
  });
  await page.route("**/api/materials/warehouse-sheets", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer synthetic.warehouses.test.token");
    if (route.request().method() === "GET") {
      expect(canRead).toBe(true); if (readError) return fulfill(route, readError, 409); return fulfill(route, { warehouses: sheets });
    }
    expect(route.request().method()).toBe("POST"); expect(canWrite).toBe(true);
    const raw = route.request().postDataJSON() as RawCommand; normalizeWarehouseSheetSave(raw); commands.push(clone(raw));
    for (const key of ["operation", "tenantId", "code", "warehouseNumber", "label"]) expect(raw).not.toHaveProperty(key);
    return behavior ? behavior(route, raw, () => confirm(raw)) : fulfill(route, confirm(raw));
  });
  await page.route("**/api/materials/warehouse-uses", async (route) => {
    expect(route.request().method()).toBe("POST"); expect(canWrite).toBe(true);
    const input = normalizeWarehouseAreaUseCreate(route.request().postDataJSON());
    const next = { ...USE, useRef: randomUUID(), code: `USO-${String(uses.length + 1).padStart(4, "0")}`, name: input.name, description: input.description, purpose: input.purpose };
    uses = [...uses, next]; return fulfill(route, next, 201);
  });
  return { ...base, commands, browserErrors, getSheets: () => clone(sheets), getUses: () => clone(uses), getConfiguration: configuration,
    setPostBehavior(next: Behavior) { behavior = next; }, setReadError(next?: string) { readError = next; },
    setSheets(next: readonly WarehouseSheet[]) { sheets = clone(next); base.setWarehouses(sheets); },
  };
}

export async function openNewSheet(page: Page, name = "Nuevo almacén sintético") {
  await page.goto("/warehouses/spaces"); await page.getByRole("button", { name: "Nuevo almacén", exact: true }).click();
  await expect(page.getByTestId("warehouse-sheet")).toBeVisible(); await page.getByLabel("Nombre del almacén", { exact: true }).fill(name);
}
