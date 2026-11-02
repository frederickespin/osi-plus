export type WarehouseAddressKind = "WAREHOUSE_ROOT" | "ZONE" | "AISLE" | "RACK" | "LEVEL" | "BIN";
export type WarehouseStructuralKind = Exclude<WarehouseAddressKind, "WAREHOUSE_ROOT">;
export type WarehouseAddressSegments = Readonly<{
  warehouseNumber: number;
  zoneNumber: number;
  zoneCode?: string | null;
  aisleNumber: number;
  rackCode: string | null;
  levelNumber: number;
  positionNumber: number;
}>;

export const WAREHOUSE_ADDRESS_KINDS: readonly ["WAREHOUSE_ROOT", "ZONE", "AISLE", "RACK", "LEVEL", "BIN"];
export const WAREHOUSE_ADDRESS_LIMITS: Readonly<Record<WarehouseAddressKind, number>>;
export function warehouseAddressToken(kind: WarehouseAddressKind, ordinal: number): string;
export function warehouseAddressOrdinal(kind: WarehouseAddressKind, token: string): number;
export function normalizeWarehouseAddressIdentifier(kind: WarehouseAddressKind, raw: string, options?: { allowDisabled?: boolean }): string;
export function warehouseAddressIdentifier(kind: WarehouseAddressKind, address: WarehouseAddressSegments): string;
export function allocateWarehouseAddressOrdinal(kind: WarehouseAddressKind, usedOrdinals: Iterable<number>): number;
export function canPlaceWarehouseAddressKind(kind: string, ancestorKinds: readonly string[]): kind is WarehouseAddressKind;
export function warehouseAddressSegments(parentAddress: WarehouseAddressSegments | null, kind: WarehouseAddressKind, ordinal: number): WarehouseAddressSegments;
export function warehouseAddressSegmentsFromIdentifier(parentAddress: WarehouseAddressSegments | null, kind: WarehouseAddressKind, identifier: string): WarehouseAddressSegments;
export function formatWarehouseAddress(segments: WarehouseAddressSegments): string;
