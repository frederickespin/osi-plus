// The reviewed additive migration is pinned independently of its deployed ledger.
export const WAREHOUSE_CONFIGURATION_MIGRATION = "20261101010000_v17_warehouse_configuration";
export const WAREHOUSE_CONFIGURATION_MIGRATION_CHECKSUM = "4fd765d2090163512be0f58d6eda3be59ad9b35fbfaf1e7b11a679f194d080d5";
export const WAREHOUSE_CONFIGURATION_TABLES = Object.freeze([
  "warehouse_area_uses", "warehouse_location_configurations", "warehouse_location_policy_epochs",
]);
export const WAREHOUSE_CONFIGURATION_FUNCTIONS = Object.freeze([
  "v17_warehouse_configuration_identity_guard()", "v17_warehouse_location_policy_epoch_guard()",
]);
export const WAREHOUSE_CONFIGURATION_ENUMS = Object.freeze([
  "WarehouseAreaUsePurpose", "WarehouseLocationOperationalStatus", "WarehouseLocationAvailabilityRule",
]);
