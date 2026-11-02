// Reviewed forward-only 20D extension; the applied 20C migration remains unchanged.
export const WAREHOUSE_ROUTES_MIGRATION = "20261102010000_v17_warehouse_routes";
export const WAREHOUSE_ROUTES_MIGRATION_CHECKSUM = "12e651c831b5e761a59ce5381258b2b538d853367c2fee834587f0fa3d7175a1";
export const WAREHOUSE_ROUTES_TABLES = Object.freeze(["warehouse_location_addresses"]);
export const WAREHOUSE_ROUTES_FUNCTIONS = Object.freeze(["v17_warehouse_location_address_guard()"]);
export const WAREHOUSE_ROUTES_CHECKS = Object.freeze(["warehouse_location_addresses_zone_code_check"]);
export const WAREHOUSE_ROUTES_ENUMS = Object.freeze([]);
