CREATE TABLE IF NOT EXISTS "code_sequences" (
  "key" TEXT PRIMARY KEY,
  "value" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "account_pricing_profiles"
ADD COLUMN IF NOT EXISTS "code" TEXT;

WITH numbered AS (
  SELECT
    id,
    'PRF-' || LPAD(ROW_NUMBER() OVER (ORDER BY "created_at", id)::text, 5, '0') AS generated_code
  FROM "account_pricing_profiles"
  WHERE "code" IS NULL OR "code" = ''
)
UPDATE "account_pricing_profiles" AS profiles
SET "code" = numbered.generated_code
FROM numbered
WHERE profiles.id = numbered.id;

ALTER TABLE "account_pricing_profiles"
ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "account_pricing_profiles_code_key"
ON "account_pricing_profiles" ("code");
