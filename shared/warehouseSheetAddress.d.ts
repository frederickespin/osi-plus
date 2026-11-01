export type WarehouseAddressKind = "WAREHOUSE_ROOT" | "ZONE" | "AISLE" | "RACK" | "LEVEL" | "BIN";
export type WarehouseStructuralKind = Exclude<WarehouseAddressKind, "WAREHOUSE_ROOT">;
export type WarehouseAddressSegments = Readonly<{
  warehouseNumber: number;
  zoneNumber: number;
  aisleNumber: number;
  rackCode: string | null;
  levelNumber: number;
  positionNumber: number;
}>;

export const WAREHOUSE_ADDRESS_KINDS: readonly ["WAREHOUSE_ROOT", "ZONE", "AISLE", "RACK", "LEVEL", "BIN"];
export const WAREHOUSE_ADDRESS_LIMITS: Readonly<Record<WarehouseAddressKind, number>>;
export function warehouseAddressToken(kind: WarehouseAddressKind, ordinal: number): string;
export function warehouseAddressOrdinal(kind: WarehouseAddressKind, token: string): number;
export function allocateWarehouseAddressOrdinal(kind: WarehouseAddressKind, usedOrdinals: Iterable<number>): number;
export function canPlaceWarehouseAddressKind(kind: string, ancestorKinds: readonly string[]): kind is WarehouseAddressKind;
export function warehouseAddressSegments(parentAddress: WarehouseAddressSegments | null, kind: WarehouseAddressKind, ordinal: number): WarehouseAddressSegments;
export function formatWarehouseAddress(segments: WarehouseAddressSegments): string;
