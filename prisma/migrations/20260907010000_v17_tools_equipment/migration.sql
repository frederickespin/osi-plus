-- CreateEnum
CREATE TYPE "AssetResourceType" AS ENUM ('TOOL', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "AssetSerialPolicy" AS ENUM ('REQUIRED', 'OPTIONAL', 'NONE');

-- CreateEnum
CREATE TYPE "AssetRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssetOperationalStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_USE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetPhysicalCondition" AS ENUM ('GOOD', 'FAIR', 'DAMAGED', 'UNSAFE');

-- CreateEnum
CREATE TYPE "AssetCostType" AS ENUM ('ACQUISITION', 'REPLACEMENT', 'INTERNAL_RATE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AssetReservationStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssetAssignmentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetInspectionType" AS ENUM ('PRE_HANDOUT', 'RETURN', 'PERIODIC', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AssetIncidentType" AS ENUM ('DAMAGE', 'LOSS', 'FAILURE', 'MISUSE', 'ACCIDENT', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "AssetIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssetIncidentStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssetMaintenanceTrigger" AS ENUM ('CALENDAR', 'USAGE_HOURS', 'ODOMETER', 'CYCLES');

-- CreateEnum
CREATE TYPE "AssetMaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'REPAIR');

-- CreateEnum
CREATE TYPE "AssetMaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExternalAvailabilityStatus" AS ENUM ('UNCONFIRMED', 'AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ExternalResourceReservationStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "asset_models" (
    "id" TEXT NOT NULL,
    "model_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "family" VARCHAR(80) NOT NULL,
    "resource_type" "AssetResourceType" NOT NULL,
    "serial_policy" "AssetSerialPolicy" NOT NULL DEFAULT 'OPTIONAL',
    "identification_policy" JSONB NOT NULL DEFAULT '{}',
    "capacity" JSONB NOT NULL DEFAULT '{}',
    "status" "AssetRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_code_counters" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "prefix" VARCHAR(24) NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_code_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_instances" (
    "id" TEXT NOT NULL,
    "asset_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_model_id" TEXT NOT NULL,
    "current_location_id" TEXT,
    "internal_code" VARCHAR(64) NOT NULL,
    "serial_number" VARCHAR(160),
    "barcode" VARCHAR(160),
    "operational_status" "AssetOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
    "physical_condition" "AssetPhysicalCondition" NOT NULL DEFAULT 'GOOD',
    "acquired_at" DATE,
    "acquisition_cost" DECIMAL(18,4),
    "replacement_cost" DECIMAL(18,4),
    "currency" CHAR(3),
    "usage_hours" DECIMAL(14,2),
    "usage_cycles" BIGINT,
    "odometer_km" DECIMAL(14,2),
    "version" INTEGER NOT NULL DEFAULT 1,
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_cost_versions" (
    "id" TEXT NOT NULL,
    "cost_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_model_id" TEXT,
    "asset_instance_id" TEXT,
    "cost_type" "AssetCostType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "temporal_unit" VARCHAR(24),
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_cost_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_mutation_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "target_ref" VARCHAR(191) NOT NULL,
    "result_json" JSONB NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_mutation_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_reservations" (
    "id" TEXT NOT NULL,
    "reservation_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_instance_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT,
    "operational_reference" VARCHAR(191),
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "AssetReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "assignment_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_instance_id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "pipeline_case_id" TEXT,
    "assignee_membership_id" TEXT,
    "assignee_user_id" TEXT,
    "custodian_membership_id" TEXT,
    "custodian_user_id" TEXT,
    "operational_reference" VARCHAR(191),
    "status" "AssetAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "origin_location_id" TEXT,
    "destination_location_id" TEXT,
    "handout_condition" "AssetPhysicalCondition",
    "return_condition" "AssetPhysicalCondition",
    "handed_out_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_inspections" (
    "id" TEXT NOT NULL,
    "inspection_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_instance_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "location_id" TEXT,
    "inspection_type" "AssetInspectionType" NOT NULL,
    "physical_condition" "AssetPhysicalCondition" NOT NULL,
    "safe_to_use" BOOLEAN NOT NULL,
    "notes" VARCHAR(2000),
    "evidence_refs" UUID[] DEFAULT ARRAY[]::UUID[],
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "inspected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_incidents" (
    "id" TEXT NOT NULL,
    "incident_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_instance_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "inspection_id" TEXT,
    "incident_type" "AssetIncidentType" NOT NULL,
    "severity" "AssetIncidentSeverity" NOT NULL,
    "status" "AssetIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resulting_condition" "AssetPhysicalCondition",
    "description" VARCHAR(2000) NOT NULL,
    "evidence_refs" UUID[] DEFAULT ARRAY[]::UUID[],
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance_rules" (
    "id" TEXT NOT NULL,
    "rule_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_model_id" TEXT NOT NULL,
    "rule_type" "AssetMaintenanceTrigger" NOT NULL,
    "interval_days" INTEGER,
    "interval_usage_hours" DECIMAL(14,2),
    "interval_odometer_km" DECIMAL(14,2),
    "interval_cycles" BIGINT,
    "status" "AssetRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_maintenance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance_orders" (
    "id" TEXT NOT NULL,
    "maintenance_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_instance_id" TEXT NOT NULL,
    "incident_id" TEXT,
    "maintenance_type" "AssetMaintenanceType" NOT NULL,
    "status" "AssetMaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" VARCHAR(240) NOT NULL,
    "notes" VARCHAR(2000),
    "scheduled_start" TIMESTAMPTZ(6) NOT NULL,
    "scheduled_end" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cost_amount" DECIMAL(18,4),
    "currency" CHAR(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_history_events" (
    "id" TEXT NOT NULL,
    "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_instance_id" TEXT NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "previous_state" JSONB,
    "resulting_state" JSONB NOT NULL,
    "reference_type" VARCHAR(80),
    "reference_ref" UUID,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_resource_offers" (
    "id" TEXT NOT NULL,
    "offer_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "asset_model_id" TEXT,
    "provider_reference" VARCHAR(191) NOT NULL,
    "provider_name_snapshot" VARCHAR(160) NOT NULL,
    "resource_description" VARCHAR(500) NOT NULL,
    "capacity" JSONB NOT NULL DEFAULT '{}',
    "rate_amount" DECIMAL(18,4),
    "currency" CHAR(3),
    "temporal_unit" VARCHAR(24),
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "availability_status" "ExternalAvailabilityStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "terms_snapshot" JSONB NOT NULL DEFAULT '{}',
    "contractual_reference" VARCHAR(191),
    "status" "AssetRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_resource_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_resource_reservations" (
    "id" TEXT NOT NULL,
    "reservation_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "agreed_amount" DECIMAL(18,4),
    "currency" CHAR(3),
    "status" "ExternalResourceReservationStatus" NOT NULL DEFAULT 'REQUESTED',
    "operational_reference" VARCHAR(191),
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_resource_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_models_catalog_idx" ON "asset_models"("tenant_id", "status", "resource_type", "family");

-- CreateIndex
CREATE UNIQUE INDEX "asset_models_tenant_id_key" ON "asset_models"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_models_tenant_ref_key" ON "asset_models"("tenant_id", "model_ref");

-- CreateIndex
CREATE UNIQUE INDEX "asset_models_tenant_code_key" ON "asset_models"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_code_counters_tenant_prefix_key" ON "asset_code_counters"("tenant_id", "prefix");

-- CreateIndex
CREATE INDEX "asset_instances_availability_idx" ON "asset_instances"("tenant_id", "operational_status", "physical_condition", "current_location_id");

-- CreateIndex
CREATE INDEX "asset_instances_model_status_idx" ON "asset_instances"("tenant_id", "asset_model_id", "operational_status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_instances_tenant_id_key" ON "asset_instances"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_instances_tenant_ref_key" ON "asset_instances"("tenant_id", "asset_ref");

-- CreateIndex
CREATE UNIQUE INDEX "asset_instances_tenant_code_key" ON "asset_instances"("tenant_id", "internal_code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_instances_tenant_barcode_key" ON "asset_instances"("tenant_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "asset_instances_tenant_model_serial_key" ON "asset_instances"("tenant_id", "asset_model_id", "serial_number");

-- CreateIndex
CREATE INDEX "asset_cost_versions_model_idx" ON "asset_cost_versions"("tenant_id", "asset_model_id", "cost_type", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "asset_cost_versions_instance_idx" ON "asset_cost_versions"("tenant_id", "asset_instance_id", "cost_type", "valid_from" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "asset_cost_versions_tenant_ref_key" ON "asset_cost_versions"("tenant_id", "cost_ref");

-- CreateIndex
CREATE UNIQUE INDEX "asset_cost_versions_scope_version_key" ON "asset_cost_versions"("tenant_id", "asset_model_id", "asset_instance_id", "cost_type", "version");

-- CreateIndex
CREATE INDEX "asset_mutation_commands_target_idx" ON "asset_mutation_commands"("tenant_id", "target_ref", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "asset_mutation_commands_tenant_request_key" ON "asset_mutation_commands"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "asset_reservations_interval_idx" ON "asset_reservations"("tenant_id", "asset_instance_id", "status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "asset_reservations_case_idx" ON "asset_reservations"("tenant_id", "pipeline_case_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_reservations_tenant_id_key" ON "asset_reservations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_reservations_tenant_ref_key" ON "asset_reservations"("tenant_id", "reservation_ref");

-- CreateIndex
CREATE INDEX "asset_assignments_instance_status_idx" ON "asset_assignments"("tenant_id", "asset_instance_id", "status");

-- CreateIndex
CREATE INDEX "asset_assignments_custodian_idx" ON "asset_assignments"("tenant_id", "custodian_membership_id", "custodian_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_assignments_tenant_id_key" ON "asset_assignments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_assignments_tenant_ref_key" ON "asset_assignments"("tenant_id", "assignment_ref");

-- CreateIndex
CREATE INDEX "asset_inspections_history_idx" ON "asset_inspections"("tenant_id", "asset_instance_id", "inspected_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "asset_inspections_tenant_id_key" ON "asset_inspections"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_inspections_tenant_ref_key" ON "asset_inspections"("tenant_id", "inspection_ref");

-- CreateIndex
CREATE INDEX "asset_incidents_asset_idx" ON "asset_incidents"("tenant_id", "asset_instance_id", "status", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "asset_incidents_tenant_id_key" ON "asset_incidents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_incidents_tenant_ref_key" ON "asset_incidents"("tenant_id", "incident_ref");

-- CreateIndex
CREATE INDEX "asset_maintenance_rules_model_idx" ON "asset_maintenance_rules"("tenant_id", "asset_model_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_maintenance_rules_tenant_ref_key" ON "asset_maintenance_rules"("tenant_id", "rule_ref");

-- CreateIndex
CREATE INDEX "asset_maintenance_orders_interval_idx" ON "asset_maintenance_orders"("tenant_id", "asset_instance_id", "status", "scheduled_start", "scheduled_end");

-- CreateIndex
CREATE UNIQUE INDEX "asset_maintenance_orders_tenant_id_key" ON "asset_maintenance_orders"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_maintenance_orders_tenant_ref_key" ON "asset_maintenance_orders"("tenant_id", "maintenance_ref");

-- CreateIndex
CREATE INDEX "asset_history_events_asset_idx" ON "asset_history_events"("tenant_id", "asset_instance_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "asset_history_events_tenant_ref_key" ON "asset_history_events"("tenant_id", "event_ref");

-- CreateIndex
CREATE INDEX "external_resource_offers_availability_idx" ON "external_resource_offers"("tenant_id", "status", "availability_status", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "external_resource_offers_tenant_id_key" ON "external_resource_offers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "external_resource_offers_tenant_ref_key" ON "external_resource_offers"("tenant_id", "offer_ref");

-- CreateIndex
CREATE UNIQUE INDEX "external_resource_offers_contract_key" ON "external_resource_offers"("tenant_id", "provider_reference", "contractual_reference");

-- CreateIndex
CREATE INDEX "external_resource_reservations_interval_idx" ON "external_resource_reservations"("tenant_id", "offer_id", "status", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "external_resource_reservations_tenant_ref_key" ON "external_resource_reservations"("tenant_id", "reservation_ref");

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_code_counters" ADD CONSTRAINT "asset_code_counters_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_instances" ADD CONSTRAINT "asset_instances_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_instances" ADD CONSTRAINT "asset_instances_model_fkey" FOREIGN KEY ("tenant_id", "asset_model_id") REFERENCES "asset_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_instances" ADD CONSTRAINT "asset_instances_location_fkey" FOREIGN KEY ("tenant_id", "current_location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cost_versions" ADD CONSTRAINT "asset_cost_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cost_versions" ADD CONSTRAINT "asset_cost_versions_model_fkey" FOREIGN KEY ("tenant_id", "asset_model_id") REFERENCES "asset_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cost_versions" ADD CONSTRAINT "asset_cost_versions_instance_fkey" FOREIGN KEY ("tenant_id", "asset_instance_id") REFERENCES "asset_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_mutation_commands" ADD CONSTRAINT "asset_mutation_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_mutation_commands" ADD CONSTRAINT "asset_mutation_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_instance_fkey" FOREIGN KEY ("tenant_id", "asset_instance_id") REFERENCES "asset_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_instance_fkey" FOREIGN KEY ("tenant_id", "asset_instance_id") REFERENCES "asset_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_reservation_fkey" FOREIGN KEY ("tenant_id", "reservation_id") REFERENCES "asset_reservations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assignee_fkey" FOREIGN KEY ("tenant_id", "assignee_membership_id", "assignee_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_custodian_fkey" FOREIGN KEY ("tenant_id", "custodian_membership_id", "custodian_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_origin_fkey" FOREIGN KEY ("tenant_id", "origin_location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_destination_fkey" FOREIGN KEY ("tenant_id", "destination_location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_instance_fkey" FOREIGN KEY ("tenant_id", "asset_instance_id") REFERENCES "asset_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_assignment_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "asset_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_location_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_instance_fkey" FOREIGN KEY ("tenant_id", "asset_instance_id") REFERENCES "asset_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_assignment_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "asset_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_inspection_fkey" FOREIGN KEY ("tenant_id", "inspection_id") REFERENCES "asset_inspections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_rules" ADD CONSTRAINT "asset_maintenance_rules_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_rules" ADD CONSTRAINT "asset_maintenance_rules_model_fkey" FOREIGN KEY ("tenant_id", "asset_model_id") REFERENCES "asset_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_orders" ADD CONSTRAINT "asset_maintenance_orders_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_orders" ADD CONSTRAINT "asset_maintenance_orders_instance_fkey" FOREIGN KEY ("tenant_id", "asset_instance_id") REFERENCES "asset_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_orders" ADD CONSTRAINT "asset_maintenance_orders_incident_fkey" FOREIGN KEY ("tenant_id", "incident_id") REFERENCES "asset_incidents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_orders" ADD CONSTRAINT "asset_maintenance_orders_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_history_events" ADD CONSTRAINT "asset_history_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_history_events" ADD CONSTRAINT "asset_history_events_instance_fkey" FOREIGN KEY ("tenant_id", "asset_instance_id") REFERENCES "asset_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_history_events" ADD CONSTRAINT "asset_history_events_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_resource_offers" ADD CONSTRAINT "external_resource_offers_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_resource_offers" ADD CONSTRAINT "external_resource_offers_model_fkey" FOREIGN KEY ("tenant_id", "asset_model_id") REFERENCES "asset_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_resource_reservations" ADD CONSTRAINT "external_resource_reservations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_resource_reservations" ADD CONSTRAINT "external_resource_reservations_offer_fkey" FOREIGN KEY ("tenant_id", "offer_id") REFERENCES "external_resource_offers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_resource_reservations" ADD CONSTRAINT "external_resource_reservations_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_resource_reservations" ADD CONSTRAINT "external_resource_reservations_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Asset lifecycle invariants. Availability is derived for an interval; it is never stored as a boolean.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "asset_models"
  ADD CONSTRAINT "asset_models_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_-]{0,63}$');
ALTER TABLE "asset_code_counters"
  ADD CONSTRAINT "asset_code_counters_positive_check" CHECK ("next_value" > 0);
ALTER TABLE "asset_instances"
  ADD CONSTRAINT "asset_instances_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "asset_instances_costs_check" CHECK (COALESCE("acquisition_cost", 0) >= 0 AND COALESCE("replacement_cost", 0) >= 0),
  ADD CONSTRAINT "asset_instances_usage_check" CHECK (COALESCE("usage_hours", 0) >= 0 AND COALESCE("usage_cycles", 0) >= 0 AND COALESCE("odometer_km", 0) >= 0),
  ADD CONSTRAINT "asset_instances_retired_state_check" CHECK (("operational_status" = 'RETIRED') = ("retired_at" IS NOT NULL));
ALTER TABLE "asset_cost_versions"
  ADD CONSTRAINT "asset_cost_versions_single_scope_check" CHECK (("asset_model_id" IS NOT NULL)::integer + ("asset_instance_id" IS NOT NULL)::integer = 1),
  ADD CONSTRAINT "asset_cost_versions_amount_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "asset_cost_versions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "asset_cost_versions_interval_check" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");
ALTER TABLE "asset_reservations"
  ADD CONSTRAINT "asset_reservations_interval_check" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "asset_reservations_reference_check" CHECK ("pipeline_case_id" IS NOT NULL OR "operational_reference" IS NOT NULL);
ALTER TABLE "asset_assignments"
  ADD CONSTRAINT "asset_assignments_assignee_pair_check" CHECK (("assignee_membership_id" IS NULL) = ("assignee_user_id" IS NULL)),
  ADD CONSTRAINT "asset_assignments_custodian_pair_check" CHECK (("custodian_membership_id" IS NULL) = ("custodian_user_id" IS NULL)),
  ADD CONSTRAINT "asset_assignments_target_check" CHECK ("assignee_membership_id" IS NOT NULL OR "operational_reference" IS NOT NULL),
  ADD CONSTRAINT "asset_assignments_active_custody_check" CHECK ("status" <> 'ACTIVE' OR "custodian_membership_id" IS NOT NULL),
  ADD CONSTRAINT "asset_assignments_handout_check" CHECK ("status" NOT IN ('ACTIVE', 'RETURNED') OR ("handed_out_at" IS NOT NULL AND "handout_condition" IS NOT NULL)),
  ADD CONSTRAINT "asset_assignments_return_check" CHECK ("status" <> 'RETURNED' OR ("returned_at" IS NOT NULL AND "return_condition" IS NOT NULL));
ALTER TABLE "asset_maintenance_rules"
  ADD CONSTRAINT "asset_maintenance_rules_single_trigger_check" CHECK (
    ("interval_days" IS NOT NULL)::integer + ("interval_usage_hours" IS NOT NULL)::integer +
    ("interval_odometer_km" IS NOT NULL)::integer + ("interval_cycles" IS NOT NULL)::integer = 1
  ),
  ADD CONSTRAINT "asset_maintenance_rules_positive_check" CHECK (
    COALESCE("interval_days", 1) > 0 AND COALESCE("interval_usage_hours", 1) > 0 AND
    COALESCE("interval_odometer_km", 1) > 0 AND COALESCE("interval_cycles", 1) > 0
  );
ALTER TABLE "asset_maintenance_orders"
  ADD CONSTRAINT "asset_maintenance_orders_interval_check" CHECK ("scheduled_end" > "scheduled_start"),
  ADD CONSTRAINT "asset_maintenance_orders_cost_check" CHECK ("cost_amount" IS NULL OR ("cost_amount" >= 0 AND "currency" ~ '^[A-Z]{3}$'));
ALTER TABLE "external_resource_offers"
  ADD CONSTRAINT "external_resource_offers_interval_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "external_resource_offers_rate_check" CHECK (
    ("rate_amount" IS NULL AND "currency" IS NULL AND "temporal_unit" IS NULL) OR
    ("rate_amount" >= 0 AND "currency" ~ '^[A-Z]{3}$' AND "temporal_unit" IS NOT NULL)
  );
ALTER TABLE "external_resource_reservations"
  ADD CONSTRAINT "external_resource_reservations_interval_check" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "external_resource_reservations_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "external_resource_reservations_price_check" CHECK (
    ("agreed_amount" IS NULL AND "currency" IS NULL) OR
    ("agreed_amount" >= 0 AND "currency" ~ '^[A-Z]{3}$')
  );

ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "asset_instance_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

CREATE UNIQUE INDEX "asset_assignments_one_active_per_instance_key"
  ON "asset_assignments" ("tenant_id", "asset_instance_id") WHERE "status" = 'ACTIVE';

CREATE OR REPLACE FUNCTION "asset_assert_serial_policy"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE policy "AssetSerialPolicy";
BEGIN
  SELECT "serial_policy" INTO policy FROM "asset_models"
  WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."asset_model_id";
  IF policy = 'REQUIRED' AND NEW."serial_number" IS NULL THEN
    RAISE EXCEPTION 'ASSET_SERIAL_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF policy = 'NONE' AND NEW."serial_number" IS NOT NULL THEN
    RAISE EXCEPTION 'ASSET_SERIAL_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "asset_instances_serial_policy_trigger"
  BEFORE INSERT OR UPDATE OF "asset_model_id", "serial_number" ON "asset_instances"
  FOR EACH ROW EXECUTE FUNCTION "asset_assert_serial_policy"();

CREATE OR REPLACE FUNCTION "asset_lock_and_assert_reservation_interval"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenant_id" || ':' || NEW."asset_instance_id", 0));
  IF NEW."status" = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM "asset_maintenance_orders" m
    WHERE m."tenant_id" = NEW."tenant_id" AND m."asset_instance_id" = NEW."asset_instance_id"
      AND m."status" IN ('SCHEDULED', 'IN_PROGRESS')
      AND tstzrange(m."scheduled_start", m."scheduled_end", '[)') && tstzrange(NEW."starts_at", NEW."ends_at", '[)')
  ) THEN RAISE EXCEPTION 'ASSET_MAINTENANCE_CONFLICT' USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION "asset_lock_and_assert_maintenance_interval"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenant_id" || ':' || NEW."asset_instance_id", 0));
  IF NEW."status" IN ('SCHEDULED', 'IN_PROGRESS') AND EXISTS (
    SELECT 1 FROM "asset_reservations" r
    WHERE r."tenant_id" = NEW."tenant_id" AND r."asset_instance_id" = NEW."asset_instance_id"
      AND r."status" = 'ACTIVE'
      AND tstzrange(r."starts_at", r."ends_at", '[)') && tstzrange(NEW."scheduled_start", NEW."scheduled_end", '[)')
  ) THEN RAISE EXCEPTION 'ASSET_RESERVATION_CONFLICT' USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "asset_reservations_interval_guard"
  BEFORE INSERT OR UPDATE OF "asset_instance_id", "starts_at", "ends_at", "status" ON "asset_reservations"
  FOR EACH ROW EXECUTE FUNCTION "asset_lock_and_assert_reservation_interval"();
CREATE TRIGGER "asset_maintenance_interval_guard"
  BEFORE INSERT OR UPDATE OF "asset_instance_id", "scheduled_start", "scheduled_end", "status" ON "asset_maintenance_orders"
  FOR EACH ROW EXECUTE FUNCTION "asset_lock_and_assert_maintenance_interval"();

CREATE OR REPLACE FUNCTION "asset_reject_immutable_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN RAISE EXCEPTION 'ASSET_TENANT_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'model_ref' AND to_jsonb(NEW)->>'model_ref' IS DISTINCT FROM to_jsonb(OLD)->>'model_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'asset_ref' AND to_jsonb(NEW)->>'asset_ref' IS DISTINCT FROM to_jsonb(OLD)->>'asset_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'reservation_ref' AND to_jsonb(NEW)->>'reservation_ref' IS DISTINCT FROM to_jsonb(OLD)->>'reservation_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'assignment_ref' AND to_jsonb(NEW)->>'assignment_ref' IS DISTINCT FROM to_jsonb(OLD)->>'assignment_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'inspection_ref' AND to_jsonb(NEW)->>'inspection_ref' IS DISTINCT FROM to_jsonb(OLD)->>'inspection_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'incident_ref' AND to_jsonb(NEW)->>'incident_ref' IS DISTINCT FROM to_jsonb(OLD)->>'incident_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'maintenance_ref' AND to_jsonb(NEW)->>'maintenance_ref' IS DISTINCT FROM to_jsonb(OLD)->>'maintenance_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'cost_ref' AND to_jsonb(NEW)->>'cost_ref' IS DISTINCT FROM to_jsonb(OLD)->>'cost_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'rule_ref' AND to_jsonb(NEW)->>'rule_ref' IS DISTINCT FROM to_jsonb(OLD)->>'rule_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'offer_ref' AND to_jsonb(NEW)->>'offer_ref' IS DISTINCT FROM to_jsonb(OLD)->>'offer_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  IF to_jsonb(NEW) ? 'external_reservation_ref' AND to_jsonb(NEW)->>'external_reservation_ref' IS DISTINCT FROM to_jsonb(OLD)->>'external_reservation_ref' THEN RAISE EXCEPTION 'ASSET_PUBLIC_REF_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "asset_models_immutable_ref" BEFORE UPDATE ON "asset_models" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "asset_instances_immutable_ref" BEFORE UPDATE ON "asset_instances" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "asset_reservations_immutable_ref" BEFORE UPDATE ON "asset_reservations" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "asset_assignments_immutable_ref" BEFORE UPDATE ON "asset_assignments" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "asset_cost_versions_immutable_ref" BEFORE UPDATE ON "asset_cost_versions" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "asset_maintenance_rules_immutable_ref" BEFORE UPDATE ON "asset_maintenance_rules" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "asset_incidents_immutable_ref" BEFORE UPDATE ON "asset_incidents" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "asset_maintenance_immutable_ref" BEFORE UPDATE ON "asset_maintenance_orders" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "external_offers_immutable_ref" BEFORE UPDATE ON "external_resource_offers" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();
CREATE TRIGGER "external_reservations_immutable_ref" BEFORE UPDATE ON "external_resource_reservations" FOR EACH ROW EXECUTE FUNCTION "asset_reject_immutable_change"();

CREATE OR REPLACE FUNCTION "asset_reject_append_only_change"() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ASSET_APPEND_ONLY'; END $$;
CREATE TRIGGER "asset_history_events_append_only" BEFORE UPDATE OR DELETE ON "asset_history_events" FOR EACH ROW EXECUTE FUNCTION "asset_reject_append_only_change"();
CREATE TRIGGER "asset_inspections_append_only" BEFORE UPDATE OR DELETE ON "asset_inspections" FOR EACH ROW EXECUTE FUNCTION "asset_reject_append_only_change"();
CREATE TRIGGER "asset_commands_append_only" BEFORE UPDATE OR DELETE ON "asset_mutation_commands" FOR EACH ROW EXECUTE FUNCTION "asset_reject_append_only_change"();
CREATE TRIGGER "asset_cost_versions_append_only" BEFORE DELETE ON "asset_cost_versions" FOR EACH ROW EXECUTE FUNCTION "asset_reject_append_only_change"();
