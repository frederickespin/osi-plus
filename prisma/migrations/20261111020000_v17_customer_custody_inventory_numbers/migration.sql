-- A custody item has one permanent human number inside its storage lot.
-- QR payloads remain immutable machine identifiers and may be printed in batches.
ALTER TABLE "customer_storage_lots"
  ADD COLUMN "next_item_number" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "customer_stored_items"
  ADD COLUMN "inventory_number" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenant_id", "storage_lot_id"
      ORDER BY "created_at", "item_code", "id"
    )::INTEGER AS "inventory_number"
  FROM "customer_stored_items"
)
UPDATE "customer_stored_items" AS item
SET "inventory_number" = ranked."inventory_number"
FROM ranked
WHERE ranked."id" = item."id";

UPDATE "customer_storage_lots" AS lot
SET "next_item_number" = COALESCE(numbering."next_item_number", 1)
FROM (
  SELECT
    "tenant_id",
    "storage_lot_id",
    MAX("inventory_number") + 1 AS "next_item_number"
  FROM "customer_stored_items"
  GROUP BY "tenant_id", "storage_lot_id"
) AS numbering
WHERE numbering."tenant_id" = lot."tenant_id"
  AND numbering."storage_lot_id" = lot."id";

ALTER TABLE "customer_stored_items"
  ALTER COLUMN "inventory_number" SET NOT NULL,
  ADD CONSTRAINT "customer_stored_items_inventory_number_check"
    CHECK ("inventory_number" > 0);

ALTER TABLE "customer_storage_lots"
  ADD CONSTRAINT "customer_storage_lots_next_item_number_check"
    CHECK ("next_item_number" > 0);

CREATE UNIQUE INDEX "customer_stored_items_inventory_number_key"
  ON "customer_stored_items"("tenant_id", "storage_lot_id", "inventory_number");
