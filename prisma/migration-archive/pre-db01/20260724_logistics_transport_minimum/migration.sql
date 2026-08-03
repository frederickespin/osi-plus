ALTER TABLE "global_commercial_settings"
ADD COLUMN IF NOT EXISTS "transport_minimo" DECIMAL(10, 2) NOT NULL DEFAULT 0;
