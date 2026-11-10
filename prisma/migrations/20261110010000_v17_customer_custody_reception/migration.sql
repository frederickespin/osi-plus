-- Customer custody reception is an explicit chain of custody. Historical lots
-- remain closed and retain their first recorded location as the reception point.
CREATE TYPE "CustomerCustodyIntakeSource" AS ENUM (
  'OWN_PICKUP',
  'EXTERNAL_ORIGIN',
  'COMMERCIAL_PRE_ADVICE',
  'DIRECT_WAREHOUSE'
);

CREATE TYPE "CustomerCustodyReceptionStage" AS ENUM (
  'PLANNED',
  'IN_TRANSIT',
  'ARRIVED',
  'RECEIVING',
  'EXCEPTIONS',
  'PUT_AWAY',
  'CLOSED'
);

ALTER TYPE "CustomerStorageLotStatus" ADD VALUE 'PLANNED' BEFORE 'RECEIVED';
ALTER TYPE "CustomerStorageLotStatus" ADD VALUE 'IN_TRANSIT' BEFORE 'RECEIVED';
ALTER TYPE "CustomerStoredItemStatus" ADD VALUE 'EXPECTED' BEFORE 'IN_CUSTODY';
ALTER TYPE "CustomerCustodyMovementType" ADD VALUE 'ARRIVAL' BEFORE 'RECEIVE';
ALTER TYPE "CustomerCustodyMovementType" ADD VALUE 'HANDOFF' BEFORE 'RECEIVE';
ALTER TYPE "CustomerCustodyMovementType" ADD VALUE 'CLOSE_RECEIPT' AFTER 'RELEASE_HOLD';

ALTER TABLE "material_locations"
  ADD CONSTRAINT "material_locations_tenant_warehouse_id_key"
  UNIQUE ("tenant_id", "warehouse_id", "id");

ALTER TABLE "customer_storage_lots"
  ADD COLUMN "reception_location_id" TEXT,
  ADD COLUMN "intake_source" "CustomerCustodyIntakeSource" NOT NULL DEFAULT 'DIRECT_WAREHOUSE',
  ADD COLUMN "reception_stage" "CustomerCustodyReceptionStage" NOT NULL DEFAULT 'CLOSED',
  ADD COLUMN "manifest_code" VARCHAR(80),
  ADD COLUMN "expected_units" INTEGER,
  ADD COLUMN "group_lead_name" VARCHAR(160),
  ADD COLUMN "driver_name" VARCHAR(160),
  ADD COLUMN "vehicle_code" VARCHAR(64),
  ADD COLUMN "seal_number" VARCHAR(80),
  ADD COLUMN "departed_at" TIMESTAMPTZ(6),
  ADD COLUMN "arrived_at" TIMESTAMPTZ(6),
  ADD COLUMN "handoff_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reception_closed_at" TIMESTAMPTZ(6);

UPDATE "customer_storage_lots" AS lot
SET
  "reception_location_id" = source."current_location_id",
  "expected_units" = source."item_count",
  "arrived_at" = lot."received_at",
  "handoff_confirmed_at" = lot."received_at",
  "reception_closed_at" = lot."received_at"
FROM (
  SELECT
    item."tenant_id",
    item."storage_lot_id",
    (
      SELECT movement."destination_location_id"
      FROM "customer_custody_movements" AS movement
      WHERE movement."tenant_id" = item."tenant_id"
        AND movement."storage_lot_id" = item."storage_lot_id"
        AND movement."movement_type" = 'RECEIVE'
        AND movement."destination_location_id" IS NOT NULL
      ORDER BY movement."occurred_at", movement."id"
      LIMIT 1
    ) AS "current_location_id",
    COUNT(*)::INTEGER AS "item_count"
  FROM "customer_stored_items" AS item
  GROUP BY item."tenant_id", item."storage_lot_id"
) AS source
WHERE source."tenant_id" = lot."tenant_id"
  AND source."storage_lot_id" = lot."id";

ALTER TABLE "customer_storage_lots"
  ALTER COLUMN "reception_location_id" SET NOT NULL,
  ADD CONSTRAINT "customer_storage_lots_expected_units_check"
    CHECK ("expected_units" IS NULL OR "expected_units" > 0),
  ADD CONSTRAINT "customer_storage_lots_reception_location_fkey"
    FOREIGN KEY ("tenant_id", "warehouse_id", "reception_location_id")
    REFERENCES "material_locations"("tenant_id", "warehouse_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_stored_items"
  ADD COLUMN "external_code" VARCHAR(120),
  ADD COLUMN "received_at" TIMESTAMPTZ(6);

UPDATE "customer_stored_items" AS item
SET "received_at" = lot."received_at"
FROM "customer_storage_lots" AS lot
WHERE lot."tenant_id" = item."tenant_id"
  AND lot."id" = item."storage_lot_id";

CREATE INDEX "customer_storage_lots_reception_stage_idx"
  ON "customer_storage_lots"("tenant_id", "reception_stage", "arrived_at" DESC);

CREATE UNIQUE INDEX "customer_stored_items_external_code_key"
  ON "customer_stored_items"("tenant_id", "storage_lot_id", "external_code")
  WHERE "external_code" IS NOT NULL;
