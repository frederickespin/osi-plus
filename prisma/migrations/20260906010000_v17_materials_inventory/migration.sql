-- CreateEnum
CREATE TYPE "MaterialRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MaterialLocationKind" AS ENUM ('WAREHOUSE_ROOT', 'ZONE', 'AISLE', 'RACK', 'LEVEL', 'BIN', 'RECEIVING', 'DISPATCH', 'QUARANTINE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialMovementType" AS ENUM ('RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'ISSUE', 'CONSUMPTION', 'RETURN', 'ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE');

-- CreateEnum
CREATE TYPE "MaterialReservationStatus" AS ENUM ('RESERVED', 'ASSIGNED', 'DISPATCHED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PackingRecipeVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "PackingFormulaType" AS ENUM ('FIXED', 'PER_ITEM', 'PER_LENGTH', 'PER_AREA');

-- CreateEnum
CREATE TYPE "MaterialRequirementSnapshotStatus" AS ENUM ('CURRENT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "MaterialPurchaseRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "material_units" (
    "id" TEXT NOT NULL,
    "unit_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 3,
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_catalog_items" (
    "id" TEXT NOT NULL,
    "material_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "family" VARCHAR(80) NOT NULL,
    "subfamily" VARCHAR(80),
    "base_unit_id" TEXT NOT NULL,
    "purchase_unit_id" TEXT NOT NULL,
    "consumption_unit_id" TEXT NOT NULL,
    "technical_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dimension_policy" JSONB NOT NULL DEFAULT '{}',
    "lot_tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "minimum_stock" DECIMAL(18,6),
    "maximum_stock" DECIMAL(18,6),
    "reorder_point" DECIMAL(18,6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_unit_conversions" (
    "id" TEXT NOT NULL,
    "conversion_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "source_unit_id" TEXT NOT NULL,
    "target_unit_id" TEXT NOT NULL,
    "multiplier" DECIMAL(24,9) NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL,
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_cost_versions" (
    "id" TEXT NOT NULL,
    "cost_version_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "supplier_reference_id" TEXT,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_cost_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_supplier_references" (
    "id" TEXT NOT NULL,
    "supplier_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "supplier_code" VARCHAR(64) NOT NULL,
    "supplier_name" VARCHAR(160) NOT NULL,
    "supplier_sku" VARCHAR(100),
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_supplier_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_warehouses" (
    "id" TEXT NOT NULL,
    "warehouse_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_locations" (
    "id" TEXT NOT NULL,
    "location_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "parent_location_id" TEXT,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "MaterialLocationKind" NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "path" VARCHAR(600) NOT NULL,
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_inventory_commands" (
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

    CONSTRAINT "material_inventory_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_inventory_movements" (
    "id" TEXT NOT NULL,
    "movement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_ref" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "command_id" UUID NOT NULL,
    "reservation_id" TEXT,
    "requirement_line_id" TEXT,
    "purchase_request_id" TEXT,
    "movement_type" "MaterialMovementType" NOT NULL,
    "quantity_base" DECIMAL(18,6) NOT NULL,
    "lot_code" VARCHAR(100),
    "reason_code" VARCHAR(80) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_reservations" (
    "id" TEXT NOT NULL,
    "reservation_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT,
    "requirement_line_id" TEXT,
    "crating_reference" VARCHAR(191),
    "quantity_base" DECIMAL(18,6) NOT NULL,
    "status" "MaterialReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_reservation_events" (
    "id" TEXT NOT NULL,
    "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "from_status" "MaterialReservationStatus",
    "to_status" "MaterialReservationStatus" NOT NULL,
    "quantity_base" DECIMAL(18,6) NOT NULL,
    "reason_code" VARCHAR(80) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_reservation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_recipes" (
    "id" TEXT NOT NULL,
    "recipe_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packing_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_recipe_versions" (
    "id" TEXT NOT NULL,
    "recipe_version_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PackingRecipeVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "applicability" JSONB NOT NULL,
    "applicability_sha256" CHAR(64) NOT NULL,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packing_recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_recipe_lines" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "recipe_version_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "material_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "formula_type" "PackingFormulaType" NOT NULL,
    "fixed_quantity" DECIMAL(18,6),
    "multiplier" DECIMAL(18,6),
    "rounding_increment" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "waste_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "formula_config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "packing_recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_requirement_snapshots" (
    "id" TEXT NOT NULL,
    "requirement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "survey_publication_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "recipe_version_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "MaterialRequirementSnapshotStatus" NOT NULL DEFAULT 'CURRENT',
    "context_snapshot" JSONB NOT NULL,
    "logical_sha256" CHAR(64) NOT NULL,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_requirement_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_requirement_lines" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requirement_snapshot_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "material_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "required_quantity" DECIMAL(18,6) NOT NULL,
    "formula_snapshot" JSONB NOT NULL,
    "source_snapshot" JSONB NOT NULL,

    CONSTRAINT "material_requirement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_purchase_requests" (
    "id" TEXT NOT NULL,
    "purchase_request_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "requirement_line_id" TEXT,
    "requested_quantity" DECIMAL(18,6) NOT NULL,
    "status" "MaterialPurchaseRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "requested_by_membership_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_units_status_idx" ON "material_units"("tenant_id", "status", "code");

-- CreateIndex
CREATE UNIQUE INDEX "material_units_tenant_id_key" ON "material_units"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_units_tenant_ref_key" ON "material_units"("tenant_id", "unit_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_units_tenant_code_key" ON "material_units"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "material_catalog_items_catalog_idx" ON "material_catalog_items"("tenant_id", "status", "family", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "material_catalog_items_tenant_id_key" ON "material_catalog_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_catalog_items_tenant_ref_key" ON "material_catalog_items"("tenant_id", "material_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_catalog_items_tenant_code_key" ON "material_catalog_items"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "material_unit_conversions_current_idx" ON "material_unit_conversions"("tenant_id", "material_id", "status", "valid_from" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "material_unit_conversions_tenant_ref_key" ON "material_unit_conversions"("tenant_id", "conversion_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_unit_conversions_version_key" ON "material_unit_conversions"("tenant_id", "material_id", "source_unit_id", "target_unit_id", "version");

-- CreateIndex
CREATE INDEX "material_cost_versions_current_idx" ON "material_cost_versions"("tenant_id", "material_id", "valid_from" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "material_cost_versions_tenant_id_key" ON "material_cost_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_cost_versions_tenant_ref_key" ON "material_cost_versions"("tenant_id", "cost_version_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_cost_versions_version_key" ON "material_cost_versions"("tenant_id", "material_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "material_supplier_references_tenant_id_key" ON "material_supplier_references"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_supplier_references_tenant_ref_key" ON "material_supplier_references"("tenant_id", "supplier_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_supplier_references_code_key" ON "material_supplier_references"("tenant_id", "material_id", "supplier_code");

-- CreateIndex
CREATE UNIQUE INDEX "material_warehouses_tenant_id_key" ON "material_warehouses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_warehouses_tenant_ref_key" ON "material_warehouses"("tenant_id", "warehouse_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_warehouses_tenant_code_key" ON "material_warehouses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "material_locations_tree_idx" ON "material_locations"("tenant_id", "warehouse_id", "parent_location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "material_locations_tenant_id_key" ON "material_locations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_locations_tenant_ref_key" ON "material_locations"("tenant_id", "location_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_locations_warehouse_code_key" ON "material_locations"("tenant_id", "warehouse_id", "code");

-- CreateIndex
CREATE INDEX "material_inventory_commands_target_idx" ON "material_inventory_commands"("tenant_id", "target_ref", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "material_inventory_commands_tenant_id_key" ON "material_inventory_commands"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_inventory_commands_request_key" ON "material_inventory_commands"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "material_inventory_movements_stock_idx" ON "material_inventory_movements"("tenant_id", "material_id", "location_id", "occurred_at");

-- CreateIndex
CREATE INDEX "material_inventory_movements_transaction_idx" ON "material_inventory_movements"("tenant_id", "transaction_ref", "movement_type");

-- CreateIndex
CREATE UNIQUE INDEX "material_inventory_movements_tenant_id_key" ON "material_inventory_movements"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_inventory_movements_tenant_ref_key" ON "material_inventory_movements"("tenant_id", "movement_ref");

-- CreateIndex
CREATE INDEX "material_reservations_availability_idx" ON "material_reservations"("tenant_id", "material_id", "location_id", "status");

-- CreateIndex
CREATE INDEX "material_reservations_case_idx" ON "material_reservations"("tenant_id", "pipeline_case_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "material_reservations_tenant_id_key" ON "material_reservations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_reservations_tenant_ref_key" ON "material_reservations"("tenant_id", "reservation_ref");

-- CreateIndex
CREATE INDEX "material_reservation_events_history_idx" ON "material_reservation_events"("tenant_id", "reservation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_reservation_events_tenant_ref_key" ON "material_reservation_events"("tenant_id", "event_ref");

-- CreateIndex
CREATE UNIQUE INDEX "packing_recipes_tenant_id_key" ON "packing_recipes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "packing_recipes_tenant_ref_key" ON "packing_recipes"("tenant_id", "recipe_ref");

-- CreateIndex
CREATE UNIQUE INDEX "packing_recipes_tenant_code_key" ON "packing_recipes"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "packing_recipe_versions_active_idx" ON "packing_recipe_versions"("tenant_id", "status", "activated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "packing_recipe_versions_tenant_id_key" ON "packing_recipe_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "packing_recipe_versions_tenant_ref_key" ON "packing_recipe_versions"("tenant_id", "recipe_version_ref");

-- CreateIndex
CREATE UNIQUE INDEX "packing_recipe_versions_version_key" ON "packing_recipe_versions"("tenant_id", "recipe_id", "version");

-- CreateIndex
CREATE INDEX "packing_recipe_lines_material_idx" ON "packing_recipe_lines"("tenant_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "packing_recipe_lines_position_key" ON "packing_recipe_lines"("tenant_id", "recipe_version_id", "position");

-- CreateIndex
CREATE INDEX "material_requirement_snapshots_case_idx" ON "material_requirement_snapshots"("tenant_id", "pipeline_case_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "material_requirement_snapshots_tenant_id_key" ON "material_requirement_snapshots"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_requirement_snapshots_tenant_ref_key" ON "material_requirement_snapshots"("tenant_id", "requirement_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_requirement_snapshots_publication_revision_key" ON "material_requirement_snapshots"("tenant_id", "survey_publication_id", "revision");

-- CreateIndex
CREATE INDEX "material_requirement_lines_material_idx" ON "material_requirement_lines"("tenant_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_requirement_lines_tenant_id_key" ON "material_requirement_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_requirement_lines_position_key" ON "material_requirement_lines"("tenant_id", "requirement_snapshot_id", "position");

-- CreateIndex
CREATE INDEX "material_purchase_requests_status_idx" ON "material_purchase_requests"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_purchase_requests_tenant_ref_key" ON "material_purchase_requests"("tenant_id", "purchase_request_ref");

-- CreateIndex
CREATE UNIQUE INDEX "material_purchase_requests_tenant_id_key" ON "material_purchase_requests"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_base_unit_fkey" FOREIGN KEY ("tenant_id", "base_unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_purchase_unit_fkey" FOREIGN KEY ("tenant_id", "purchase_unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_consumption_unit_fkey" FOREIGN KEY ("tenant_id", "consumption_unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_source_unit_fkey" FOREIGN KEY ("tenant_id", "source_unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_target_unit_fkey" FOREIGN KEY ("tenant_id", "target_unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_unit_fkey" FOREIGN KEY ("tenant_id", "unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_supplier_fkey" FOREIGN KEY ("tenant_id", "supplier_reference_id") REFERENCES "material_supplier_references"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_supplier_references" ADD CONSTRAINT "material_supplier_references_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_supplier_references" ADD CONSTRAINT "material_supplier_references_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_warehouses" ADD CONSTRAINT "material_warehouses_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_locations" ADD CONSTRAINT "material_locations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_locations" ADD CONSTRAINT "material_locations_warehouse_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "material_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_locations" ADD CONSTRAINT "material_locations_parent_fkey" FOREIGN KEY ("tenant_id", "parent_location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_commands" ADD CONSTRAINT "material_inventory_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_commands" ADD CONSTRAINT "material_inventory_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_location_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_command_fkey" FOREIGN KEY ("tenant_id", "command_id") REFERENCES "material_inventory_commands"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_reservation_fkey" FOREIGN KEY ("tenant_id", "reservation_id") REFERENCES "material_reservations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_requirement_fkey" FOREIGN KEY ("tenant_id", "requirement_line_id") REFERENCES "material_requirement_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_purchase_request_fkey" FOREIGN KEY ("tenant_id", "purchase_request_id") REFERENCES "material_purchase_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_location_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_requirement_fkey" FOREIGN KEY ("tenant_id", "requirement_line_id") REFERENCES "material_requirement_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservation_events" ADD CONSTRAINT "material_reservation_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservation_events" ADD CONSTRAINT "material_reservation_events_reservation_fkey" FOREIGN KEY ("tenant_id", "reservation_id") REFERENCES "material_reservations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservation_events" ADD CONSTRAINT "material_reservation_events_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipes" ADD CONSTRAINT "packing_recipes_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipe_versions" ADD CONSTRAINT "packing_recipe_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipe_versions" ADD CONSTRAINT "packing_recipe_versions_recipe_fkey" FOREIGN KEY ("tenant_id", "recipe_id") REFERENCES "packing_recipes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipe_versions" ADD CONSTRAINT "packing_recipe_versions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipe_lines" ADD CONSTRAINT "packing_recipe_lines_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipe_lines" ADD CONSTRAINT "packing_recipe_lines_version_fkey" FOREIGN KEY ("tenant_id", "recipe_version_id") REFERENCES "packing_recipe_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipe_lines" ADD CONSTRAINT "packing_recipe_lines_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_recipe_lines" ADD CONSTRAINT "packing_recipe_lines_unit_fkey" FOREIGN KEY ("tenant_id", "unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_snapshots" ADD CONSTRAINT "material_requirement_snapshots_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_snapshots" ADD CONSTRAINT "material_requirement_snapshots_publication_fkey" FOREIGN KEY ("tenant_id", "survey_publication_id") REFERENCES "survey_publications"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_snapshots" ADD CONSTRAINT "material_requirement_snapshots_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_snapshots" ADD CONSTRAINT "material_requirement_snapshots_recipe_fkey" FOREIGN KEY ("tenant_id", "recipe_version_id") REFERENCES "packing_recipe_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_snapshots" ADD CONSTRAINT "material_requirement_snapshots_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_lines" ADD CONSTRAINT "material_requirement_lines_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_lines" ADD CONSTRAINT "material_requirement_lines_snapshot_fkey" FOREIGN KEY ("tenant_id", "requirement_snapshot_id") REFERENCES "material_requirement_snapshots"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_lines" ADD CONSTRAINT "material_requirement_lines_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirement_lines" ADD CONSTRAINT "material_requirement_lines_unit_fkey" FOREIGN KEY ("tenant_id", "unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_purchase_requests" ADD CONSTRAINT "material_purchase_requests_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_purchase_requests" ADD CONSTRAINT "material_purchase_requests_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_purchase_requests" ADD CONSTRAINT "material_purchase_requests_unit_fkey" FOREIGN KEY ("tenant_id", "unit_id") REFERENCES "material_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_purchase_requests" ADD CONSTRAINT "material_purchase_requests_requirement_fkey" FOREIGN KEY ("tenant_id", "requirement_line_id") REFERENCES "material_requirement_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_purchase_requests" ADD CONSTRAINT "material_purchase_requests_actor_fkey" FOREIGN KEY ("tenant_id", "requested_by_membership_id", "requested_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks. Material stock is ledger-derived; none of these tables stores an authoritative balance.
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_decimal_places_check" CHECK ("decimal_places" BETWEEN 0 AND 6);
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_-]{0,63}$');
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_thresholds_check" CHECK (
  ("minimum_stock" IS NULL OR "minimum_stock" >= 0) AND
  ("maximum_stock" IS NULL OR "maximum_stock" >= 0) AND
  ("reorder_point" IS NULL OR "reorder_point" >= 0) AND
  ("minimum_stock" IS NULL OR "maximum_stock" IS NULL OR "minimum_stock" <= "maximum_stock")
);
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_multiplier_check" CHECK ("multiplier" > 0);
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_distinct_units_check" CHECK ("source_unit_id" <> "target_unit_id");
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_validity_check" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");
CREATE UNIQUE INDEX "material_unit_conversions_one_current_idx" ON "material_unit_conversions"("tenant_id", "material_id", "source_unit_id", "target_unit_id") WHERE "valid_to" IS NULL AND "status" = 'ACTIVE';
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "material_cost_versions" ADD CONSTRAINT "material_cost_versions_validity_check" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");
CREATE UNIQUE INDEX "material_cost_versions_one_current_idx" ON "material_cost_versions"("tenant_id", "material_id") WHERE "valid_to" IS NULL;
ALTER TABLE "material_locations" ADD CONSTRAINT "material_locations_depth_check" CHECK ("depth" BETWEEN 0 AND 32);
ALTER TABLE "material_inventory_movements" ADD CONSTRAINT "material_inventory_movements_quantity_check" CHECK ("quantity_base" > 0);
ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_quantity_check" CHECK ("quantity_base" > 0);
ALTER TABLE "material_reservation_events" ADD CONSTRAINT "material_reservation_events_quantity_check" CHECK ("quantity_base" > 0);
ALTER TABLE "packing_recipe_lines" ADD CONSTRAINT "packing_recipe_lines_quantity_check" CHECK (
  "rounding_increment" > 0 AND "waste_percent" >= 0 AND "waste_percent" <= 100 AND
  ("fixed_quantity" IS NULL OR "fixed_quantity" >= 0) AND
  ("multiplier" IS NULL OR "multiplier" >= 0)
);
CREATE UNIQUE INDEX "packing_recipe_versions_one_active_idx" ON "packing_recipe_versions"("tenant_id", "recipe_id") WHERE "status" = 'ACTIVE';
ALTER TABLE "material_requirement_lines" ADD CONSTRAINT "material_requirement_lines_quantity_check" CHECK ("required_quantity" > 0);
CREATE UNIQUE INDEX "material_requirement_snapshots_one_current_idx" ON "material_requirement_snapshots"("tenant_id", "survey_publication_id") WHERE "status" = 'CURRENT';
ALTER TABLE "material_purchase_requests" ADD CONSTRAINT "material_purchase_requests_quantity_check" CHECK ("requested_quantity" > 0);

-- Public references are immutable even when mutable catalog metadata changes.
CREATE OR REPLACE FUNCTION "v17_materials_reject_public_ref_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE ref_column text := TG_ARGV[0];
BEGIN
  IF to_jsonb(NEW)->>ref_column IS DISTINCT FROM to_jsonb(OLD)->>ref_column THEN
    RAISE EXCEPTION 'V17_MATERIAL_PUBLIC_REF_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "material_units_ref_immutable" BEFORE UPDATE ON "material_units" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('unit_ref');
CREATE TRIGGER "material_catalog_items_ref_immutable" BEFORE UPDATE ON "material_catalog_items" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('material_ref');
CREATE TRIGGER "material_unit_conversions_ref_immutable" BEFORE UPDATE ON "material_unit_conversions" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('conversion_ref');
CREATE TRIGGER "material_cost_versions_ref_immutable" BEFORE UPDATE ON "material_cost_versions" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('cost_version_ref');
CREATE TRIGGER "material_supplier_references_ref_immutable" BEFORE UPDATE ON "material_supplier_references" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('supplier_ref');
CREATE TRIGGER "material_warehouses_ref_immutable" BEFORE UPDATE ON "material_warehouses" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('warehouse_ref');
CREATE TRIGGER "material_locations_ref_immutable" BEFORE UPDATE ON "material_locations" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('location_ref');
CREATE TRIGGER "material_reservations_ref_immutable" BEFORE UPDATE ON "material_reservations" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('reservation_ref');
CREATE TRIGGER "packing_recipes_ref_immutable" BEFORE UPDATE ON "packing_recipes" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('recipe_ref');
CREATE TRIGGER "material_purchase_requests_ref_immutable" BEFORE UPDATE ON "material_purchase_requests" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_public_ref_change"('purchase_request_ref');

-- Confirmed ledger, reservation history and material requirements are append-only.
CREATE OR REPLACE FUNCTION "v17_materials_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'V17_MATERIAL_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "material_inventory_movements_append_only" BEFORE UPDATE OR DELETE ON "material_inventory_movements" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_mutation"();
CREATE TRIGGER "material_reservation_events_append_only" BEFORE UPDATE OR DELETE ON "material_reservation_events" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_mutation"();
CREATE TRIGGER "material_requirement_lines_append_only" BEFORE UPDATE OR DELETE ON "material_requirement_lines" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_mutation"();
CREATE TRIGGER "material_requirement_snapshots_no_delete" BEFORE DELETE ON "material_requirement_snapshots" FOR EACH ROW EXECUTE FUNCTION "v17_materials_reject_mutation"();

-- Once a recipe version is active, its rules and lines are historical authority.
CREATE OR REPLACE FUNCTION "v17_materials_guard_recipe_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."status" IN ('ACTIVE', 'RETIRED') AND (
    NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR
    NEW."recipe_id" IS DISTINCT FROM OLD."recipe_id" OR
    NEW."version" IS DISTINCT FROM OLD."version" OR
    NEW."applicability" IS DISTINCT FROM OLD."applicability" OR
    NEW."applicability_sha256" IS DISTINCT FROM OLD."applicability_sha256" OR
    NEW."created_by_membership_id" IS DISTINCT FROM OLD."created_by_membership_id" OR
    NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id" OR
    NEW."created_at" IS DISTINCT FROM OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'V17_MATERIAL_RECIPE_VERSION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "v17_materials_guard_recipe_line"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE version_status text;
BEGIN
  SELECT "status"::text INTO version_status FROM "packing_recipe_versions"
  WHERE "tenant_id" = COALESCE(NEW."tenant_id", OLD."tenant_id")
    AND "id" = COALESCE(NEW."recipe_version_id", OLD."recipe_version_id");
  IF version_status IN ('ACTIVE', 'RETIRED') THEN
    RAISE EXCEPTION 'V17_MATERIAL_RECIPE_LINE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "packing_recipe_versions_immutable" BEFORE UPDATE OR DELETE ON "packing_recipe_versions" FOR EACH ROW EXECUTE FUNCTION "v17_materials_guard_recipe_version"();
CREATE TRIGGER "packing_recipe_lines_immutable" BEFORE UPDATE OR DELETE ON "packing_recipe_lines" FOR EACH ROW EXECUTE FUNCTION "v17_materials_guard_recipe_line"();

-- A child location is always inside the same warehouse and exactly one level below its parent.
CREATE OR REPLACE FUNCTION "v17_materials_validate_location_parent"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent_warehouse text; parent_depth integer; parent_path text;
BEGIN
  IF NEW."parent_location_id" IS NULL THEN
    IF NEW."depth" <> 0 THEN RAISE EXCEPTION 'V17_MATERIAL_LOCATION_DEPTH_INVALID' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT "warehouse_id", "depth", "path" INTO parent_warehouse, parent_depth, parent_path
  FROM "material_locations" WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."parent_location_id";
  IF parent_warehouse IS NULL OR parent_warehouse <> NEW."warehouse_id" OR NEW."depth" <> parent_depth + 1 OR NEW."path" !~ ('^' || parent_path || '/') THEN
    RAISE EXCEPTION 'V17_MATERIAL_LOCATION_PARENT_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "material_locations_parent_guard" BEFORE INSERT OR UPDATE ON "material_locations" FOR EACH ROW EXECUTE FUNCTION "v17_materials_validate_location_parent"();
