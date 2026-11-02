import type { WarehouseAddressSegments } from "./warehouseSheetAddress.js";

export function isWarehouseLocalityNumber(value: unknown): value is number;
export function formatWarehouseDisplayAddress(localityNumber: number | null, address: WarehouseAddressSegments): string | null;
