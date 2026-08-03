CREATE TABLE IF NOT EXISTS "osi_hubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "osi_hubs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_hubs_active_priority_idx" ON "osi_hubs"("active", "priority");

CREATE TABLE IF NOT EXISTS "global_commercial_settings" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_scheduled" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_activation_date" DATE,
    "activated_at" TIMESTAMP(3),
    "activated_by" TEXT,
    "created_by" TEXT NOT NULL,
    "km_metro" INTEGER NOT NULL,
    "km_interior" INTEGER NOT NULL,
    "tarifa_base" DECIMAL(10,2) NOT NULL,
    "visit_fee_minimo" DECIMAL(10,2) NOT NULL,
    "margen_minimo" DECIMAL(5,2) NOT NULL,
    "hub_principal_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_commercial_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "global_commercial_settings"
    ADD COLUMN IF NOT EXISTS "version" INTEGER,
    ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS "is_scheduled" BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS "scheduled_activation_date" DATE,
    ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "activated_by" TEXT,
    ADD COLUMN IF NOT EXISTS "created_by" TEXT,
    ADD COLUMN IF NOT EXISTS "km_metro" INTEGER,
    ADD COLUMN IF NOT EXISTS "km_interior" INTEGER,
    ADD COLUMN IF NOT EXISTS "tarifa_base" DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "visit_fee_minimo" DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "margen_minimo" DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS "hub_principal_id" TEXT,
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "global_commercial_settings"
SET
    "version" = COALESCE("version", 1),
    "is_active" = COALESCE("is_active", false),
    "is_scheduled" = COALESCE("is_scheduled", false),
    "created_by" = COALESCE(NULLIF("created_by", ''), 'system'),
    "km_metro" = COALESCE("km_metro", 15),
    "km_interior" = COALESCE("km_interior", 0),
    "tarifa_base" = COALESCE("tarifa_base", 220.00),
    "visit_fee_minimo" = COALESCE("visit_fee_minimo", 0.00),
    "margen_minimo" = COALESCE("margen_minimo", 18.00),
    "created_at" = COALESCE("created_at", CURRENT_TIMESTAMP)
WHERE
    "version" IS NULL
    OR "is_active" IS NULL
    OR "is_scheduled" IS NULL
    OR "created_by" IS NULL
    OR "km_metro" IS NULL
    OR "km_interior" IS NULL
    OR "tarifa_base" IS NULL
    OR "visit_fee_minimo" IS NULL
    OR "margen_minimo" IS NULL
    OR "created_at" IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'updated_at'
    ) THEN
        DROP INDEX IF EXISTS "global_commercial_settings_updated_at_idx";
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "updated_at";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "updated_by";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'hub_lat'
    ) THEN
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "hub_lat";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'hub_lng'
    ) THEN
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "hub_lng";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'survey_free_km'
    ) THEN
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "survey_free_km";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'survey_per_km_rate'
    ) THEN
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "survey_per_km_rate";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'survey_min_trip_fee'
    ) THEN
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "survey_min_trip_fee";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'global_commercial_settings'
          AND column_name = 'minimum_margin_percent'
    ) THEN
        ALTER TABLE "global_commercial_settings" DROP COLUMN IF EXISTS "minimum_margin_percent";
    END IF;
END $$;

ALTER TABLE "global_commercial_settings"
    ALTER COLUMN "version" SET NOT NULL,
    ALTER COLUMN "is_active" SET NOT NULL,
    ALTER COLUMN "is_scheduled" SET NOT NULL,
    ALTER COLUMN "created_by" SET NOT NULL,
    ALTER COLUMN "km_metro" SET NOT NULL,
    ALTER COLUMN "km_interior" SET NOT NULL,
    ALTER COLUMN "tarifa_base" SET NOT NULL,
    ALTER COLUMN "visit_fee_minimo" SET NOT NULL,
    ALTER COLUMN "margen_minimo" SET NOT NULL,
    ALTER COLUMN "created_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "global_commercial_settings_version_idx" ON "global_commercial_settings"("version");
CREATE INDEX IF NOT EXISTS "global_commercial_settings_is_active_idx" ON "global_commercial_settings"("is_active");
CREATE INDEX IF NOT EXISTS "global_commercial_settings_is_scheduled_idx" ON "global_commercial_settings"("is_scheduled");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'global_commercial_settings_hub_principal_id_fkey'
    ) THEN
        ALTER TABLE "global_commercial_settings"
        ADD CONSTRAINT "global_commercial_settings_hub_principal_id_fkey"
        FOREIGN KEY ("hub_principal_id") REFERENCES "osi_hubs"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;
