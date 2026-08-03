-- Client master service addresses
-- Stores canonical origin/destination service addresses in the client master.

ALTER TABLE "osi_clients"
ADD COLUMN IF NOT EXISTS "serviceOriginAddress" TEXT,
ADD COLUMN IF NOT EXISTS "serviceDestinationAddress" TEXT;

UPDATE "osi_clients"
SET "serviceOriginAddress" = COALESCE(NULLIF(BTRIM("serviceOriginAddress"), ''), NULLIF(BTRIM("address"), ''))
WHERE "serviceOriginAddress" IS NULL
   OR BTRIM("serviceOriginAddress") = '';
