ALTER TABLE "osi_clients"
ADD COLUMN IF NOT EXISTS "billingTaxId" TEXT;

UPDATE "osi_clients"
SET "billingTaxId" = COALESCE(NULLIF(BTRIM("billingTaxId"), ''), NULLIF(BTRIM("taxId"), ''))
WHERE "billingTaxId" IS NULL
   OR BTRIM("billingTaxId") = '';
