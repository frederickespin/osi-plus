import { formatWarehouseAddress } from "./warehouseSheetAddress.js";

/** Locality belongs to the warehouse profile, independently of inventory identity. */
export function isWarehouseLocalityNumber(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 999;
}

/** A derived display label never replaces the immutable historical address label. */
export function formatWarehouseDisplayAddress(localityNumber, address) {
  if (localityNumber !== null && !isWarehouseLocalityNumber(localityNumber)) {
    const error = new Error("LOCALITY_INPUT_INVALID");
    error.name = "WarehouseAddressError";
    error.code = "LOCALITY_INPUT_INVALID";
    throw error;
  }
  const [, warehouse, zone, aisle, rack, level, position] = formatWarehouseAddress(address).split("-");
  if (localityNumber === null) return null;
  return `S${localityNumber}-ALM${Number(warehouse)}-${zone}-${aisle}-${rack}-${level.padStart(2, "0")}-${position}`;
}
