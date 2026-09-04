BEGIN;
SET LOCAL search_path = osi, public;

DROP TABLE "external_resource_reservations";
DROP TABLE "external_resource_offers";
DROP TABLE "asset_history_events";
DROP TABLE "asset_maintenance_orders";
DROP TABLE "asset_maintenance_rules";
DROP TABLE "asset_incidents";
DROP TABLE "asset_inspections";
DROP TABLE "asset_assignments";
DROP TABLE "asset_reservations";
DROP TABLE "asset_mutation_commands";
DROP TABLE "asset_cost_versions";
DROP TABLE "asset_instances";
DROP TABLE "asset_code_counters";
DROP TABLE "asset_models";

DROP FUNCTION "asset_reject_append_only_change"();
DROP FUNCTION "asset_reject_immutable_change"();
DROP FUNCTION "asset_lock_and_assert_maintenance_interval"();
DROP FUNCTION "asset_lock_and_assert_reservation_interval"();
DROP FUNCTION "asset_assert_serial_policy"();

DROP TYPE "ExternalResourceReservationStatus";
DROP TYPE "ExternalAvailabilityStatus";
DROP TYPE "AssetMaintenanceStatus";
DROP TYPE "AssetMaintenanceType";
DROP TYPE "AssetMaintenanceTrigger";
DROP TYPE "AssetIncidentStatus";
DROP TYPE "AssetIncidentSeverity";
DROP TYPE "AssetIncidentType";
DROP TYPE "AssetInspectionType";
DROP TYPE "AssetAssignmentStatus";
DROP TYPE "AssetReservationStatus";
DROP TYPE "AssetCostType";
DROP TYPE "AssetPhysicalCondition";
DROP TYPE "AssetOperationalStatus";
DROP TYPE "AssetRecordStatus";
DROP TYPE "AssetSerialPolicy";
DROP TYPE "AssetResourceType";

DROP EXTENSION IF EXISTS btree_gist;
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260907010000_v17_tools_equipment';

COMMIT;
