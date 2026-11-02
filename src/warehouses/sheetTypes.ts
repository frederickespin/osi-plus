import type { WarehouseLocationRow } from "@/materials-inventory/api";

export type WarehouseSheetKind = "ZONE" | "AISLE" | "RACK" | "LEVEL" | "BIN";
export type WarehouseAddress = Readonly<{ label: string; warehouseNumber: number; zoneNumber: number; zoneCode?: string | null; aisleNumber: number; rackCode: string | null; levelNumber: number; positionNumber: number }>;
export type WarehouseSheetLocation = WarehouseLocationRow & Readonly<{ configurationVersion: number; areaUseRef: string | null; address: WarehouseAddress | null }>;
export type WarehouseSheet = Readonly<{
  warehouseRef: string; code: string; name: string; status: string; version: number; profileVersion: number;
  warehouseNumber: number | null; warehouseLabel: string | null;
  manager: Readonly<{ membershipRef: string; displayName: string; eligible: boolean }> | null;
  rootLocationRef: string | null; rootAreaUseRef: string | null; rootConfigurationVersion: number;
  locations: readonly WarehouseSheetLocation[];
}>;
export type WarehouseSheetCreateRow = Readonly<{ action: "CREATE"; rowId: string; parentRowId: string | null; parentLocationRef: string | null; kind: WarehouseSheetKind; name: string; areaUseRef: string | null; identifier?: string }>;
export type WarehouseSheetUpdateRow = Readonly<{ action: "UPDATE"; rowId: string; locationRef: string; expectedVersion: number; expectedConfigurationVersion: number; name: string; areaUseRef: string | null }>;
export type WarehouseSheetRowChange = WarehouseSheetCreateRow | WarehouseSheetUpdateRow;
export type WarehouseSheetChange = Readonly<{
  operation: "WAREHOUSE_SHEET_SAVE"; warehouseRef: string | null;
  expectedWarehouseVersion: number; expectedProfileVersion: number; expectedRootConfigurationVersion: number;
  name: string; managerMembershipRef: string | null; rootAreaUseRef: string | null;
  rows: readonly WarehouseSheetRowChange[];
}>;
export type WarehouseSheetSaved = Readonly<{ warehouse: WarehouseSheet; rowResults: readonly Readonly<{ rowId: string; locationRef: string }>[] }>;
export type WarehouseManagerOptions = Readonly<{ data: readonly Readonly<{ membershipRef: string; displayName: string }>[]; total: number; page: number; pageSize: number }>;
