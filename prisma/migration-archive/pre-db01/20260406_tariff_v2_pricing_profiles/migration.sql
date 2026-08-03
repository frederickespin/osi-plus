-- Tariff V2 foundation
-- Master tariffs + account pricing profiles + overrides + surcharge policies

DO $$ BEGIN
  CREATE TYPE "MasterTariffScope" AS ENUM ('INTL','LOCAL','GOV','CORP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TariffRateMode" AS ENUM ('AIR','LCL','FCL','LOCAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SurchargePricingMode" AS ENUM ('FIXED','PER_UNIT','PER_HOUR','PER_DAY','PER_KM','PCT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccountSurchargeHandling" AS ENUM ('CHARGE','INCLUDE','DISABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TariffOverrideScope" AS ENUM ('GLOBAL','ROUTE','MODE','SERVICE_TYPE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "master_tariffs" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" "MasterTariffScope" NOT NULL,
  "currency" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "master_tariffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "master_tariffs_code_key" ON "master_tariffs"("code");
CREATE INDEX IF NOT EXISTS "master_tariffs_scope_is_active_idx" ON "master_tariffs"("scope", "is_active");
CREATE INDEX IF NOT EXISTS "master_tariffs_currency_is_active_idx" ON "master_tariffs"("currency", "is_active");

CREATE TABLE IF NOT EXISTS "tariff_rate_sets" (
  "id" TEXT NOT NULL,
  "master_tariff_id" TEXT NOT NULL,
  "mode" "TariffRateMode" NOT NULL,
  "measurement_system" TEXT NOT NULL,
  "density_reference" DECIMAL(12,4),
  "minimum_charge" DECIMAL(14,4),
  "base_fee" DECIMAL(14,4),
  "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tariff_rate_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tariff_rate_sets_master_tariff_id_fkey"
    FOREIGN KEY ("master_tariff_id") REFERENCES "master_tariffs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tariff_rate_sets_master_tariff_id_mode_idx"
  ON "tariff_rate_sets"("master_tariff_id", "mode");

CREATE TABLE IF NOT EXISTS "tariff_rate_bands" (
  "id" TEXT NOT NULL,
  "rate_set_id" TEXT NOT NULL,
  "from_value" DECIMAL(14,4) NOT NULL,
  "to_value" DECIMAL(14,4),
  "rate" DECIMAL(14,4) NOT NULL,
  "fixed_fee" DECIMAL(14,4),
  "unit" TEXT NOT NULL,
  "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tariff_rate_bands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tariff_rate_bands_rate_set_id_fkey"
    FOREIGN KEY ("rate_set_id") REFERENCES "tariff_rate_sets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tariff_rate_bands_rate_set_id_from_value_idx"
  ON "tariff_rate_bands"("rate_set_id", "from_value");

CREATE TABLE IF NOT EXISTS "surcharge_catalog" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "default_pricing_mode" "SurchargePricingMode" NOT NULL,
  "default_rate" DECIMAL(14,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "applies_to" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "surcharge_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "surcharge_catalog_code_key" ON "surcharge_catalog"("code");
CREATE INDEX IF NOT EXISTS "surcharge_catalog_currency_idx" ON "surcharge_catalog"("currency");

CREATE TABLE IF NOT EXISTS "account_pricing_profiles" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "base_master_tariff_id" TEXT NOT NULL,
  "currency_override" TEXT,
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "global_markup_pct" DECIMAL(7,4),
  "global_discount_pct" DECIMAL(7,4),
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "air_markup_pct" DECIMAL(7,4),
  "air_min_kg" DECIMAL(14,4),
  "lcl_markup_pct" DECIMAL(7,4),
  "lcl_min_wm" DECIMAL(14,4),
  "fcl_markup_pct" DECIMAL(7,4),
  "local_markup_pct" DECIMAL(7,4),
  "local_min_hours" DECIMAL(14,4),
  "local_base_zone_km" DECIMAL(14,4),
  "local_per_km_rate" DECIMAL(14,4),
  "local_min_trip_fee" DECIMAL(14,4),
  "after_hours_multiplier" DECIMAL(10,4),
  "weekend_multiplier" DECIMAL(10,4),
  "holiday_multiplier" DECIMAL(10,4),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_pricing_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_pricing_profiles_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "account_pricing_profiles_base_master_tariff_id_fkey"
    FOREIGN KEY ("base_master_tariff_id") REFERENCES "master_tariffs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "account_pricing_profiles_account_id_is_active_idx"
  ON "account_pricing_profiles"("account_id", "is_active");
CREATE INDEX IF NOT EXISTS "account_pricing_profiles_base_master_tariff_id_is_active_idx"
  ON "account_pricing_profiles"("base_master_tariff_id", "is_active");

CREATE TABLE IF NOT EXISTS "account_surcharge_policies" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "surcharge_code" TEXT NOT NULL,
  "handling" "AccountSurchargeHandling" NOT NULL,
  "override_rate" DECIMAL(14,4),
  "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_surcharge_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_surcharge_policies_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "account_pricing_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "account_surcharge_policies_surcharge_code_fkey"
    FOREIGN KEY ("surcharge_code") REFERENCES "surcharge_catalog"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "account_surcharge_policies_profile_id_surcharge_code_key"
    UNIQUE ("profile_id", "surcharge_code")
);

CREATE INDEX IF NOT EXISTS "account_surcharge_policies_surcharge_code_idx"
  ON "account_surcharge_policies"("surcharge_code");

CREATE TABLE IF NOT EXISTS "tariff_overrides" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "scope" "TariffOverrideScope" NOT NULL,
  "mode" "TariffRateMode",
  "route_key" TEXT,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tariff_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tariff_overrides_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "account_pricing_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tariff_overrides_profile_id_scope_mode_idx"
  ON "tariff_overrides"("profile_id", "scope", "mode");
CREATE INDEX IF NOT EXISTS "tariff_overrides_route_key_idx"
  ON "tariff_overrides"("route_key");

-- Seed base master used as default fallback during rollout.
INSERT INTO "master_tariffs" (
  "id",
  "code",
  "name",
  "scope",
  "currency",
  "is_active",
  "notes",
  "created_at",
  "updated_at"
)
SELECT
  'master-intl-001',
  'INTL-001',
  'International HHG USD',
  'INTL'::"MasterTariffScope",
  'USD',
  TRUE,
  'Migración inicial Tarifario V2 basada en el tarifario internacional actual.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "master_tariffs" WHERE "code" = 'INTL-001'
);

INSERT INTO "tariff_rate_sets" (
  "id",
  "master_tariff_id",
  "mode",
  "measurement_system",
  "density_reference",
  "minimum_charge",
  "base_fee",
  "meta",
  "created_at",
  "updated_at"
)
SELECT
  'master-intl-001-lcl',
  'master-intl-001',
  'LCL'::"TariffRateMode",
  'LB/FT3',
  1000,
  1,
  0,
  '{"pricing_scheme":"WM_TABLE","notes":"Migrado desde CommercialRelationsModule seed"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "master_tariffs" WHERE "id" = 'master-intl-001'
)
AND NOT EXISTS (
  SELECT 1 FROM "tariff_rate_sets" WHERE "id" = 'master-intl-001-lcl'
);

INSERT INTO "tariff_rate_bands" (
  "id",
  "rate_set_id",
  "from_value",
  "to_value",
  "rate",
  "fixed_fee",
  "unit",
  "meta",
  "created_at",
  "updated_at"
)
SELECT
  seed."id",
  seed."rate_set_id",
  seed."from_value",
  seed."to_value",
  seed."rate",
  seed."fixed_fee",
  seed."unit",
  seed."meta"::jsonb,
  seed."created_at",
  seed."updated_at"
FROM (
  VALUES
    ('master-intl-001-lcl-band-1','master-intl-001-lcl',1000,1999,0.85,850,'WM','{"volume_from":150,"volume_to":308,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('master-intl-001-lcl-band-2','master-intl-001-lcl',2000,2999,0.75,1500,'WM','{"volume_from":308,"volume_to":462,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('master-intl-001-lcl-band-3','master-intl-001-lcl',3000,3999,0.70,2100,'WM','{"volume_from":462,"volume_to":615,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('master-intl-001-lcl-band-4','master-intl-001-lcl',4000,4999,0.66,2650,'WM','{"volume_from":615,"volume_to":769,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('master-intl-001-lcl-band-5','master-intl-001-lcl',5000,5999,0.63,3150,'WM','{"volume_from":769,"volume_to":923,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('master-intl-001-lcl-band-6','master-intl-001-lcl',6000,6999,0.60,3600,'WM','{"volume_from":923,"volume_to":1077,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('master-intl-001-lcl-band-7','master-intl-001-lcl',7000,7999,0.56,3920,'WM','{"volume_from":1077,"volume_to":1231,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('master-intl-001-lcl-band-8','master-intl-001-lcl',8000,NULL,0.53,4200,'WM','{"volume_from":1231,"volume_to":null,"volume_unit":"FT3"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
) AS seed("id","rate_set_id","from_value","to_value","rate","fixed_fee","unit","meta","created_at","updated_at")
WHERE EXISTS (
  SELECT 1 FROM "tariff_rate_sets" WHERE "id" = 'master-intl-001-lcl'
)
AND NOT EXISTS (
  SELECT 1 FROM "tariff_rate_bands" b WHERE b."id" = seed."id"
);
