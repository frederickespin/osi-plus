-- Client duplicate guard
-- Adds normalized phone storage and a safe unique guard for tax identifiers.

ALTER TABLE "osi_clients"
ADD COLUMN IF NOT EXISTS "normalizedPhone" TEXT;

WITH normalized AS (
  SELECT
    source."id",
    CASE
      WHEN source.digits = '' THEN NULL
      WHEN LENGTH(source.digits) = 11 AND LEFT(source.digits, 1) = '1' THEN SUBSTRING(source.digits FROM 2)
      WHEN LENGTH(source.digits) > 10 THEN RIGHT(source.digits, 10)
      ELSE source.digits
    END AS normalized_phone
  FROM (
    SELECT
      "id",
      REGEXP_REPLACE(COALESCE("phone", ''), '\D', '', 'g') AS digits
    FROM "osi_clients"
  ) AS source
)
UPDATE "osi_clients" AS clients
SET "normalizedPhone" = normalized.normalized_phone
FROM normalized
WHERE clients."id" = normalized."id";

CREATE INDEX IF NOT EXISTS "osi_clients_normalizedPhone_idx"
ON "osi_clients" ("normalizedPhone")
WHERE "normalizedPhone" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'osi_clients_taxId_unique'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM "osi_clients"
      WHERE "taxId" IS NOT NULL
        AND BTRIM("taxId") <> ''
      GROUP BY UPPER(REGEXP_REPLACE("taxId", '[^A-Za-z0-9]', '', 'g'))
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Skipping osi_clients_taxId_unique because duplicate tax identifiers already exist.';
    ELSE
      CREATE UNIQUE INDEX "osi_clients_taxId_unique"
      ON "osi_clients" ((UPPER(REGEXP_REPLACE("taxId", '[^A-Za-z0-9]', '', 'g'))))
      WHERE "taxId" IS NOT NULL
        AND BTRIM("taxId") <> '';
    END IF;
  END IF;
END $$;
