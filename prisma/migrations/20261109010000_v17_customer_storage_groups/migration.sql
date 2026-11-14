-- Customer-owned goods remain one custody authority, while each lot records its
-- operational storage group. Existing lots are explicitly classified as local
-- personal effects; operators may create the other groups only through the API.
CREATE TYPE "CustomerStorageType" AS ENUM (
  'PERSONAL_EFFECTS',
  'IMPORT_STORAGE',
  'INTERNATIONAL_DISPATCH',
  'COMMERCIAL_STORAGE'
);

ALTER TABLE "customer_storage_lots"
  ADD COLUMN "storage_type" "CustomerStorageType" NOT NULL DEFAULT 'PERSONAL_EFFECTS';

CREATE INDEX "customer_storage_lots_type_idx"
  ON "customer_storage_lots"("tenant_id", "storage_type", "status", "received_at" DESC);
