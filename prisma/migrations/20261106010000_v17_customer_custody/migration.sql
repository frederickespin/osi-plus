-- CreateEnum
CREATE TYPE "WarehouseInventoryScope" AS ENUM ('INTERNAL_MATERIALS', 'INTERNAL_ASSETS', 'CUSTOMER_CUSTODY');

-- CreateEnum
CREATE TYPE "WarehouseGrantOperation" AS ENUM ('VIEW', 'RECEIVE', 'PUT_AWAY', 'TRANSFER', 'COUNT', 'PREPARE_EXIT', 'DISPATCH', 'RETURN', 'ADJUST');

-- CreateEnum
CREATE TYPE "WarehouseAccessGrantStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CustomerStorageLotStatus" AS ENUM ('RECEIVED', 'STORED', 'PARTIALLY_RELEASED', 'RELEASE_PREPARED', 'RELEASED', 'HOLD');

-- CreateEnum
CREATE TYPE "CustomerStoredCondition" AS ENUM ('UNSPECIFIED', 'GOOD', 'USED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "CustomerStoredItemStatus" AS ENUM ('IN_CUSTODY', 'EXIT_PREPARED', 'RELEASED', 'HOLD');

-- CreateEnum
CREATE TYPE "CustomerCustodyMovementType" AS ENUM ('RECEIVE', 'PUT_AWAY', 'TRANSFER', 'COUNT', 'PREPARE_EXIT', 'DISPATCH', 'RETURN', 'ADJUST', 'HOLD', 'RELEASE_HOLD');

-- CreateTable
CREATE TABLE "warehouse_access_grants" (
    "id" TEXT NOT NULL,
    "grant_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "location_id" TEXT,
    "inventory_scope" "WarehouseInventoryScope" NOT NULL,
    "operations" "WarehouseGrantOperation"[] DEFAULT ARRAY[]::"WarehouseGrantOperation"[],
    "status" "WarehouseAccessGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_access_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "warehouse_access_grants_operations_check" CHECK (cardinality("operations") > 0),
    CONSTRAINT "warehouse_access_grants_location_scope_check" CHECK ("location_id" IS NULL OR "warehouse_id" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "customer_storage_lots" (
    "id" TEXT NOT NULL,
    "storage_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "lot_code" VARCHAR(64) NOT NULL,
    "status" "CustomerStorageLotStatus" NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "billing_start_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "notes" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_storage_lots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_storage_lots_release_check" CHECK (("status" = 'RELEASED' AND "released_at" IS NOT NULL) OR ("status" <> 'RELEASED' AND "released_at" IS NULL))
);

-- CreateTable
CREATE TABLE "customer_stored_items" (
    "id" TEXT NOT NULL,
    "item_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "storage_lot_id" TEXT NOT NULL,
    "current_location_id" TEXT,
    "item_code" VARCHAR(80) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "category" VARCHAR(120),
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(24) NOT NULL,
    "volume_m3" DECIMAL(14,6),
    "weight_kg" DECIMAL(14,3),
    "condition" "CustomerStoredCondition" NOT NULL DEFAULT 'UNSPECIFIED',
    "evidence" JSONB,
    "notes" VARCHAR(2000),
    "status" "CustomerStoredItemStatus" NOT NULL DEFAULT 'IN_CUSTODY',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_stored_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_stored_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "customer_stored_items_volume_check" CHECK ("volume_m3" IS NULL OR "volume_m3" > 0),
    CONSTRAINT "customer_stored_items_weight_check" CHECK ("weight_kg" IS NULL OR "weight_kg" > 0),
    CONSTRAINT "customer_stored_items_evidence_check" CHECK ("evidence" IS NULL OR jsonb_typeof("evidence") = 'array')
);

-- CreateTable
CREATE TABLE "customer_custody_commands" (
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

    CONSTRAINT "customer_custody_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_custody_movements" (
    "id" TEXT NOT NULL,
    "movement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "storage_lot_id" TEXT NOT NULL,
    "stored_item_id" TEXT,
    "command_id" UUID NOT NULL,
    "origin_location_id" TEXT,
    "destination_location_id" TEXT,
    "movement_type" "CustomerCustodyMovementType" NOT NULL,
    "quantity" DECIMAL(14,3),
    "notes" VARCHAR(1000),
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_custody_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_custody_movements_quantity_check" CHECK ("quantity" IS NULL OR "quantity" > 0)
);

-- CreateIndex
CREATE INDEX "warehouse_access_grants_membership_idx" ON "warehouse_access_grants"("tenant_id", "membership_id", "status", "inventory_scope");

-- CreateIndex
CREATE INDEX "warehouse_access_grants_scope_idx" ON "warehouse_access_grants"("tenant_id", "warehouse_id", "location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_access_grants_tenant_id_key" ON "warehouse_access_grants"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_access_grants_tenant_ref_key" ON "warehouse_access_grants"("tenant_id", "grant_ref");

-- CreateIndex
CREATE INDEX "customer_storage_lots_warehouse_idx" ON "customer_storage_lots"("tenant_id", "warehouse_id", "status", "received_at" DESC);

-- CreateIndex
CREATE INDEX "customer_storage_lots_client_idx" ON "customer_storage_lots"("tenant_id", "client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_storage_lots_tenant_id_key" ON "customer_storage_lots"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_storage_lots_tenant_ref_key" ON "customer_storage_lots"("tenant_id", "storage_ref");

-- CreateIndex
CREATE UNIQUE INDEX "customer_storage_lots_code_key" ON "customer_storage_lots"("tenant_id", "lot_code");

-- CreateIndex
CREATE INDEX "customer_stored_items_location_idx" ON "customer_stored_items"("tenant_id", "current_location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_stored_items_tenant_id_key" ON "customer_stored_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_stored_items_tenant_ref_key" ON "customer_stored_items"("tenant_id", "item_ref");

-- CreateIndex
CREATE UNIQUE INDEX "customer_stored_items_code_key" ON "customer_stored_items"("tenant_id", "storage_lot_id", "item_code");

-- CreateIndex
CREATE INDEX "customer_custody_commands_target_idx" ON "customer_custody_commands"("tenant_id", "target_ref", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_custody_commands_tenant_id_key" ON "customer_custody_commands"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_custody_commands_request_key" ON "customer_custody_commands"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "customer_custody_movements_lot_idx" ON "customer_custody_movements"("tenant_id", "storage_lot_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "customer_custody_movements_item_idx" ON "customer_custody_movements"("tenant_id", "stored_item_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_custody_movements_tenant_id_key" ON "customer_custody_movements"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_custody_movements_tenant_ref_key" ON "customer_custody_movements"("tenant_id", "movement_ref");

-- AddForeignKey
ALTER TABLE "warehouse_access_grants" ADD CONSTRAINT "warehouse_access_grants_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_access_grants" ADD CONSTRAINT "warehouse_access_grants_membership_fkey" FOREIGN KEY ("tenant_id", "membership_id", "user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_access_grants" ADD CONSTRAINT "warehouse_access_grants_warehouse_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "material_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_access_grants" ADD CONSTRAINT "warehouse_access_grants_location_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_storage_lots" ADD CONSTRAINT "customer_storage_lots_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_storage_lots" ADD CONSTRAINT "customer_storage_lots_client_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "osi_clients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A case may only be attached to a custody lot for its authoritative service client.
ALTER TABLE "customer_storage_lots" ADD CONSTRAINT "customer_storage_lots_case_client_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id", "client_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_storage_lots" ADD CONSTRAINT "customer_storage_lots_warehouse_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "material_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_stored_items" ADD CONSTRAINT "customer_stored_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_stored_items" ADD CONSTRAINT "customer_stored_items_lot_fkey" FOREIGN KEY ("tenant_id", "storage_lot_id") REFERENCES "customer_storage_lots"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_stored_items" ADD CONSTRAINT "customer_stored_items_location_fkey" FOREIGN KEY ("tenant_id", "current_location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_commands" ADD CONSTRAINT "customer_custody_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_commands" ADD CONSTRAINT "customer_custody_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_movements" ADD CONSTRAINT "customer_custody_movements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_movements" ADD CONSTRAINT "customer_custody_movements_lot_fkey" FOREIGN KEY ("tenant_id", "storage_lot_id") REFERENCES "customer_storage_lots"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_movements" ADD CONSTRAINT "customer_custody_movements_item_fkey" FOREIGN KEY ("tenant_id", "stored_item_id") REFERENCES "customer_stored_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_movements" ADD CONSTRAINT "customer_custody_movements_command_fkey" FOREIGN KEY ("tenant_id", "command_id") REFERENCES "customer_custody_commands"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_movements" ADD CONSTRAINT "customer_custody_movements_origin_fkey" FOREIGN KEY ("tenant_id", "origin_location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_movements" ADD CONSTRAINT "customer_custody_movements_destination_fkey" FOREIGN KEY ("tenant_id", "destination_location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_custody_movements" ADD CONSTRAINT "customer_custody_movements_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Commands and custody movements are evidence, never mutable business state.
CREATE OR REPLACE FUNCTION "v17_customer_custody_append_only_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  IF TG_TABLE_NAME = 'customer_custody_commands'
    AND TG_OP = 'UPDATE'
    AND OLD.result_json = '{}'::jsonb
    AND NEW.result_json <> '{}'::jsonb
    AND NEW.id = OLD.id
    AND NEW.tenant_id = OLD.tenant_id
    AND NEW.request_id = OLD.request_id
    AND NEW.operation = OLD.operation
    AND NEW.payload_hash = OLD.payload_hash
    AND NEW.target_ref = OLD.target_ref
    AND NEW.actor_membership_id = OLD.actor_membership_id
    AND NEW.actor_user_id = OLD.actor_user_id
    AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'V17_CUSTOMER_CUSTODY_APPEND_ONLY';
END;
$$;

CREATE OR REPLACE FUNCTION "v17_customer_custody_movement_append_only_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  RAISE EXCEPTION 'V17_CUSTOMER_CUSTODY_APPEND_ONLY';
END;
$$;

CREATE TRIGGER "customer_custody_commands_append_only"
BEFORE UPDATE OR DELETE ON "customer_custody_commands"
FOR EACH ROW EXECUTE FUNCTION "v17_customer_custody_append_only_guard"();

CREATE TRIGGER "customer_custody_movements_append_only"
BEFORE UPDATE OR DELETE ON "customer_custody_movements"
FOR EACH ROW EXECUTE FUNCTION "v17_customer_custody_movement_append_only_guard"();

-- Physical scopes must agree with the warehouse declared by the grant or lot.
CREATE OR REPLACE FUNCTION "v17_customer_custody_scope_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
DECLARE
  expected_warehouse_id TEXT;
  v_tenant_id TEXT;
  v_warehouse_id TEXT;
  v_location_id TEXT;
  v_storage_lot_id TEXT;
  v_origin_location_id TEXT;
  v_destination_location_id TEXT;
BEGIN
  v_tenant_id := NEW.tenant_id;

  IF TG_TABLE_NAME = 'warehouse_access_grants' THEN
    v_warehouse_id := NEW.warehouse_id;
    v_location_id := NEW.location_id;
    IF v_location_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT location.warehouse_id INTO expected_warehouse_id
    FROM osi.material_locations location
    WHERE location.tenant_id = v_tenant_id AND location.id = v_location_id;
    IF expected_warehouse_id IS DISTINCT FROM v_warehouse_id THEN
      RAISE EXCEPTION 'V17_WAREHOUSE_ACCESS_LOCATION_SCOPE_MISMATCH';
    END IF;
  ELSIF TG_TABLE_NAME = 'customer_stored_items' THEN
    v_storage_lot_id := NEW.storage_lot_id;
    v_location_id := NEW.current_location_id;
    IF v_location_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT lot.warehouse_id INTO expected_warehouse_id
    FROM osi.customer_storage_lots lot
    WHERE lot.tenant_id = v_tenant_id AND lot.id = v_storage_lot_id;
    IF NOT EXISTS (
      SELECT 1 FROM osi.material_locations location
      WHERE location.tenant_id = v_tenant_id
        AND location.id = v_location_id
        AND location.warehouse_id = expected_warehouse_id
    ) THEN
      RAISE EXCEPTION 'V17_CUSTOMER_ITEM_LOCATION_SCOPE_MISMATCH';
    END IF;
  ELSIF TG_TABLE_NAME = 'customer_custody_movements' THEN
    v_storage_lot_id := NEW.storage_lot_id;
    v_origin_location_id := NEW.origin_location_id;
    v_destination_location_id := NEW.destination_location_id;
    SELECT lot.warehouse_id INTO expected_warehouse_id
    FROM osi.customer_storage_lots lot
    WHERE lot.tenant_id = v_tenant_id AND lot.id = v_storage_lot_id;
    IF v_origin_location_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM osi.material_locations location
      WHERE location.tenant_id = v_tenant_id AND location.id = v_origin_location_id AND location.warehouse_id = expected_warehouse_id
    ) THEN
      RAISE EXCEPTION 'V17_CUSTOMER_MOVEMENT_ORIGIN_SCOPE_MISMATCH';
    END IF;
    IF v_destination_location_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM osi.material_locations location
      WHERE location.tenant_id = v_tenant_id AND location.id = v_destination_location_id AND location.warehouse_id = expected_warehouse_id
    ) THEN
      RAISE EXCEPTION 'V17_CUSTOMER_MOVEMENT_DESTINATION_SCOPE_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "warehouse_access_grants_scope_guard"
BEFORE INSERT OR UPDATE OF "tenant_id", "warehouse_id", "location_id" ON "warehouse_access_grants"
FOR EACH ROW EXECUTE FUNCTION "v17_customer_custody_scope_guard"();

CREATE TRIGGER "customer_stored_items_scope_guard"
BEFORE INSERT OR UPDATE OF "tenant_id", "storage_lot_id", "current_location_id" ON "customer_stored_items"
FOR EACH ROW EXECUTE FUNCTION "v17_customer_custody_scope_guard"();

CREATE TRIGGER "customer_custody_movements_scope_guard"
BEFORE INSERT ON "customer_custody_movements"
FOR EACH ROW EXECUTE FUNCTION "v17_customer_custody_scope_guard"();
