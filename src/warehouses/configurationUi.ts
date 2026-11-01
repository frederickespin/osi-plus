import type { WarehouseLocationRow, WarehouseRow } from "@/materials-inventory/api";
import type { WarehouseChange } from "./api";
import { isWarehouseAreaUseChange } from "./api";
import type { WarehouseLocationConfiguration } from "./configurationTypes";

export const WAREHOUSE_BUTTON = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";
export const WAREHOUSE_PRIMARY_BUTTON = `${WAREHOUSE_BUTTON} border-[#003366] bg-[#003366] text-white hover:bg-[#00264d]`;
export const WAREHOUSE_TEXTAREA = "min-h-[64px] w-full resize-y rounded border border-slate-300 bg-white px-2 py-1.5 text-xs leading-5 text-slate-900 focus:border-[#0070a8] focus:outline-none focus:ring-1 focus:ring-[#0070a8] disabled:bg-slate-50 disabled:text-slate-500";

export function pendingWarehouseRoute(change: WarehouseChange) {
  return isWarehouseAreaUseChange(change) ? "/warehouses/configuration" : "/warehouses/spaces";
}

export function findConfiguredLocation(warehouses: readonly WarehouseRow[], locationRef: string): { warehouse: WarehouseRow; location: WarehouseLocationRow } | null {
  for (const warehouse of warehouses) {
    const location = warehouse.locations.find((row) => row.locationRef === locationRef);
    if (location) return { warehouse, location };
  }
  return null;
}

export function locationConfigurationOrDefault(warehouse: WarehouseRow, location: WarehouseLocationRow, configurations: readonly WarehouseLocationConfiguration[]): WarehouseLocationConfiguration {
  const existing = configurations.find((row) => row.locationRef === location.locationRef);
  if (existing) return existing;
  // Callers only use a complete successful configuration GET. Missing rows never imply operational permission.
  return { locationRef: location.locationRef, warehouseRef: warehouse.warehouseRef, configRef: null, version: 0, areaUseRef: null, characteristics: null, notes: null, operationalStatus: "ACTIVE", availabilityRule: "CONDITION_BASED", lastControlReason: null, effective: { operationalStatus: "OUT_OF_SERVICE", availabilityRule: "BLOCKED", canReceive: false, canDispatch: false, inherited: false, blockedBy: [{ warehouseRef: warehouse.warehouseRef, locationRef: location.locationRef, kind: "HIERARCHY_INVALID", value: "UNKNOWN", reason: null }] } };
}
