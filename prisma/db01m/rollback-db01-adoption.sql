-- DB-01M: rollback de adopción antes de habilitar nuevas funcionalidades.
-- Requiere que las tablas funcionales DB-01 permanezcan vacías.
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtext('DB-01M:ROLLBACK'));

DO $$
DECLARE feature_rows bigint;
BEGIN
  IF to_regclass('osi._prisma_migrations') IS NULL
     OR to_regclass('db01_legacy.public_prisma_migrations_pre_db01') IS NULL
     OR to_regclass('db01_legacy.osi_prisma_migrations_pre_db01') IS NULL THEN
    RAISE EXCEPTION 'DB01M_ROLLBACK_HISTORY_STATE_INVALID';
  END IF;
  SELECT
    (SELECT count(*) FROM osi.approval_requests) +
    (SELECT count(*) FROM osi.commercial_audit_logs) +
    (SELECT count(*) FROM osi.crate_calculation_snapshots) +
    (SELECT count(*) FROM osi.crate_settings_versions) +
    (SELECT count(*) FROM osi.logistic_override_approvals) +
    (SELECT count(*) FROM osi.logistics_configuration_versions) +
    (SELECT count(*) FROM osi.osi_geo_region_aliases) +
    (SELECT count(*) FROM osi.osi_geo_regions) +
    (SELECT count(*) FROM osi.osi_transport_zone_rules) +
    (SELECT count(*) FROM osi.osi_vehicle_engine_settings) +
    (SELECT count(*) FROM osi.osi_vehicles) +
    (SELECT count(*) FROM osi.osi_zone_rules) +
    (SELECT count(*) FROM osi.quote_change_order_commands) +
    (SELECT count(*) FROM osi.quote_change_order_items) +
    (SELECT count(*) FROM osi.quote_change_order_policies) +
    (SELECT count(*) FROM osi.quote_change_order_sequences) +
    (SELECT count(*) FROM osi.quote_change_order_subjects) +
    (SELECT count(*) FROM osi.quote_change_orders) +
    (SELECT count(*) FROM osi.risk_engine_rules) +
    (SELECT count(*) FROM osi.risk_engine_settings) +
    (SELECT count(*) FROM osi.risk_evaluation_rules) +
    (SELECT count(*) FROM osi.risk_evaluations) +
    (SELECT count(*) FROM osi.vehicle_import_batches) +
    (SELECT count(*) FROM osi.vehicle_import_items)
  INTO feature_rows;
  IF feature_rows <> 0 THEN
    RAISE EXCEPTION 'DB01M_ROLLBACK_FEATURE_TABLES_NOT_EMPTY: %', feature_rows;
  END IF;
END $$;

DROP TABLE osi.approval_requests CASCADE;
DROP TABLE osi.commercial_audit_logs CASCADE;
DROP TABLE osi.crate_calculation_snapshots CASCADE;
DROP TABLE osi.crate_settings_versions CASCADE;
DROP TABLE osi.logistic_override_approvals CASCADE;
DROP TABLE osi.logistics_configuration_versions CASCADE;
DROP TABLE osi.osi_geo_region_aliases CASCADE;
DROP TABLE osi.osi_geo_regions CASCADE;
DROP TABLE osi.osi_transport_zone_rules CASCADE;
DROP TABLE osi.osi_vehicle_engine_settings CASCADE;
DROP TABLE osi.osi_vehicles CASCADE;
DROP TABLE osi.osi_zone_rules CASCADE;
DROP TABLE osi.quote_change_order_commands CASCADE;
DROP TABLE osi.quote_change_order_items CASCADE;
DROP TABLE osi.quote_change_order_policies CASCADE;
DROP TABLE osi.quote_change_order_sequences CASCADE;
DROP TABLE osi.quote_change_order_subjects CASCADE;
DROP TABLE osi.quote_change_orders CASCADE;
DROP TABLE osi.risk_engine_rules CASCADE;
DROP TABLE osi.risk_engine_settings CASCADE;
DROP TABLE osi.risk_evaluation_rules CASCADE;
DROP TABLE osi.risk_evaluations CASCADE;
DROP TABLE osi.tenant_memberships CASCADE;
DROP TABLE osi.tenants CASCADE;
DROP TABLE osi.vehicle_import_batches CASCADE;
DROP TABLE osi.vehicle_import_items CASCADE;

ALTER TABLE osi.osi_pipeline_case_quotes
  DROP CONSTRAINT IF EXISTS osi_pipeline_case_quotes_case_id_id_key;

DROP FUNCTION IF EXISTS osi.approval_requests_guard_transition() CASCADE;
DROP FUNCTION IF EXISTS osi.commercial_audit_logs_reject_mutation() CASCADE;
DROP FUNCTION IF EXISTS osi.db01h_append_only_guard() CASCADE;
DROP FUNCTION IF EXISTS osi.db01h_configuration_guard() CASCADE;
DROP FUNCTION IF EXISTS osi.db01h_region_guard() CASCADE;
DROP FUNCTION IF EXISTS osi.db01h_transport_rule_guard() CASCADE;
DROP FUNCTION IF EXISTS osi.db01h_zone_rule_guard() CASCADE;
DROP FUNCTION IF EXISTS osi.db01i_forbid_vehicle_delete() CASCADE;
DROP FUNCTION IF EXISTS osi.db01i_vehicle_settings_immutable() CASCADE;
DROP FUNCTION IF EXISTS osi.db01j_crate_settings_immutable() CASCADE;
DROP FUNCTION IF EXISTS osi.db01j_forbid_crate_settings_delete() CASCADE;
DROP FUNCTION IF EXISTS osi.db01j_forbid_crate_snapshot_change() CASCADE;
DROP FUNCTION IF EXISTS osi.db01j_transport_rate_metadata_immutable() CASCADE;
DROP FUNCTION IF EXISTS osi.db01j_zone_rate_metadata_immutable() CASCADE;
DROP FUNCTION IF EXISTS osi.protect_logistic_override() CASCADE;
DROP FUNCTION IF EXISTS osi.protect_risk_rule_version() CASCADE;
DROP FUNCTION IF EXISTS osi.quote_change_order_append_only_guard() CASCADE;
DROP FUNCTION IF EXISTS osi.quote_change_order_guard() CASCADE;
DROP FUNCTION IF EXISTS osi.reject_risk_evaluation_mutation() CASCADE;

DROP TYPE IF EXISTS osi."ApprovalRequestStatus" CASCADE;
DROP TYPE IF EXISTS osi."GeoRegionAliasKind" CASCADE;
DROP TYPE IF EXISTS osi."LogisticsConfigState" CASCADE;
DROP TYPE IF EXISTS osi."LogisticsOperationMode" CASCADE;
DROP TYPE IF EXISTS osi."QuoteChangeOrderItemChange" CASCADE;
DROP TYPE IF EXISTS osi."QuoteChangeOrderPolicyStatus" CASCADE;
DROP TYPE IF EXISTS osi."QuoteChangeOrderStatus" CASCADE;
DROP TYPE IF EXISTS osi."RiskDecisionResult" CASCADE;
DROP TYPE IF EXISTS osi."RiskEngineOperationMode" CASCADE;
DROP TYPE IF EXISTS osi."RiskEvaluationMode" CASCADE;
DROP TYPE IF EXISTS osi."RiskRuleConditionType" CASCADE;
DROP TYPE IF EXISTS osi."RiskRuleState" CASCADE;
DROP TYPE IF EXISTS osi."TenantMembershipRole" CASCADE;
DROP TYPE IF EXISTS osi."TenantMembershipStatus" CASCADE;
DROP TYPE IF EXISTS osi."TenantProvisioningSource" CASCADE;
DROP TYPE IF EXISTS osi."TenantStatus" CASCADE;
DROP TYPE IF EXISTS osi."TransportRuleScope" CASCADE;
DROP TYPE IF EXISTS osi."VehicleImportBatchStatus" CASCADE;
DROP TYPE IF EXISTS osi."VehicleImportItemStatus" CASCADE;
DROP TYPE IF EXISTS osi."VehicleOperationalStatus" CASCADE;
DROP TYPE IF EXISTS osi."ZoneRuleKind" CASCADE;

DROP TABLE osi._prisma_migrations;
ALTER TABLE db01_legacy.public_prisma_migrations_pre_db01 SET SCHEMA public;
ALTER TABLE public.public_prisma_migrations_pre_db01 RENAME TO _prisma_migrations;
ALTER TABLE public._prisma_migrations
  RENAME CONSTRAINT public_prisma_migrations_pre_db01_pkey TO _prisma_migrations_pkey;
COMMENT ON TABLE public._prisma_migrations IS NULL;

ALTER TABLE db01_legacy.osi_prisma_migrations_pre_db01 SET SCHEMA osi;
ALTER TABLE osi.osi_prisma_migrations_pre_db01 RENAME TO _prisma_migrations;
ALTER TABLE osi._prisma_migrations
  RENAME CONSTRAINT osi_prisma_migrations_pre_db01_pkey TO _prisma_migrations_pkey;
COMMENT ON TABLE osi._prisma_migrations IS NULL;
DROP SCHEMA db01_legacy;
COMMIT;
