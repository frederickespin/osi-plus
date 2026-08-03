-- Persist operational volume snapshot on quote versions.
-- Safe for stable environments:
-- 1. Creates quote_versions if the table is still missing in this database.
-- 2. Adds operational volume columns if the table already exists elsewhere.

CREATE TABLE IF NOT EXISTS "quote_versions" (
  "id" TEXT NOT NULL,
  "quote_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "hub_snapshot" TEXT,
  "vehicle_snapshot" TEXT,
  "zone_origin_snapshot" TEXT,
  "zone_destination_snapshot" TEXT,
  "km_rate_snapshot" DOUBLE PRECISION,
  "free_km_snapshot" DOUBLE PRECISION,
  "surcharge_snapshot" DOUBLE PRECISION,
  "sla_snapshot" INTEGER,
  "margin_snapshot" DOUBLE PRECISION,
  "engine_flags_snapshot" JSONB,
  "operational_volume_total" DOUBLE PRECISION,
  "operational_volume_source" TEXT,
  "selected_shipping_method" TEXT,
  "operational_volume_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_versions_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "quote_versions"
ADD COLUMN IF NOT EXISTS "operational_volume_total" DOUBLE PRECISION;

ALTER TABLE "quote_versions"
ADD COLUMN IF NOT EXISTS "operational_volume_source" TEXT;

ALTER TABLE "quote_versions"
ADD COLUMN IF NOT EXISTS "selected_shipping_method" TEXT;

ALTER TABLE "quote_versions"
ADD COLUMN IF NOT EXISTS "operational_volume_snapshot" JSONB;

CREATE INDEX IF NOT EXISTS "quote_versions_quote_id_version_number_idx"
ON "quote_versions" ("quote_id", "version_number");
