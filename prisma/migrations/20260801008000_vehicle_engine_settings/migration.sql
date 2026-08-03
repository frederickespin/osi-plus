-- DB-01I: flota y configuración versionada del motor de vehículos.
-- Cadena experimental local. No activa endpoints ni reemplaza fuentes heredadas.

CREATE TYPE "osi"."VehicleOperationalStatus" AS ENUM (
  'AVAILABLE', 'IN_USE', 'UNAVAILABLE', 'RETIRED'
);

CREATE TYPE "osi"."VehicleImportBatchStatus" AS ENUM (
  'IMPORTED', 'ROLLED_BACK', 'REJECTED'
);

CREATE TYPE "osi"."VehicleImportItemStatus" AS ENUM (
  'CREATED', 'DUPLICATE', 'CONFLICT', 'INVALID', 'SKIPPED', 'ROLLED_BACK'
);

CREATE TABLE "osi"."vehicle_import_batches" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "batch_code" varchar(80) NOT NULL,
  "source_kind" varchar(40) NOT NULL,
  "source_key" varchar(160),
  "manifest_json" jsonb NOT NULL,
  "manifest_hash" char(64) NOT NULL,
  "payload_hash" char(64) NOT NULL,
  "item_count" integer NOT NULL,
  "created_count" integer NOT NULL DEFAULT 0,
  "duplicate_count" integer NOT NULL DEFAULT 0,
  "conflict_count" integer NOT NULL DEFAULT 0,
  "invalid_count" integer NOT NULL DEFAULT 0,
  "status" "osi"."VehicleImportBatchStatus" NOT NULL,
  "request_id" varchar(191) NOT NULL,
  "confirmed_by_user_id" text,
  "confirmed_by_membership_id" text,
  "rolled_back_by_user_id" text,
  "rolled_back_by_membership_id" text,
  "imported_at" timestamptz(3),
  "rolled_back_at" timestamptz(3),
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicle_import_batches_item_count_check" CHECK ("item_count" >= 0 AND "item_count" <= 500),
  CONSTRAINT "vehicle_import_batches_counts_check" CHECK (
    "created_count" >= 0 AND "duplicate_count" >= 0 AND "conflict_count" >= 0 AND "invalid_count" >= 0
  ),
  CONSTRAINT "vehicle_import_batches_hash_check" CHECK (
    "manifest_hash" ~ '^[0-9a-f]{64}$' AND "payload_hash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX "vehicle_import_batches_tenant_id_id_key"
  ON "osi"."vehicle_import_batches"("tenant_id", "id");
CREATE UNIQUE INDEX "vehicle_import_batches_tenant_batch_code_key"
  ON "osi"."vehicle_import_batches"("tenant_id", "batch_code");
CREATE UNIQUE INDEX "vehicle_import_batches_tenant_request_id_key"
  ON "osi"."vehicle_import_batches"("tenant_id", "request_id");
CREATE UNIQUE INDEX "vehicle_import_batches_tenant_manifest_hash_key"
  ON "osi"."vehicle_import_batches"("tenant_id", "manifest_hash");
CREATE INDEX "vehicle_import_batches_tenant_status_created_idx"
  ON "osi"."vehicle_import_batches"("tenant_id", "status", "created_at" DESC);

CREATE TABLE "osi"."osi_vehicles" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "business_code" varchar(80) NOT NULL,
  "normalized_code" varchar(80) NOT NULL,
  "plate" varchar(40),
  "normalized_plate" varchar(40),
  "vin" varchar(80),
  "normalized_vin" varchar(80),
  "source_stable_id" varchar(191),
  "vehicle_type" varchar(80) NOT NULL,
  "brand" varchar(120),
  "model" varchar(120),
  "model_year" integer,
  "capacity_weight" numeric(14,3),
  "capacity_volume" numeric(14,4),
  "usable_length" numeric(12,4),
  "usable_width" numeric(12,4),
  "usable_height" numeric(12,4),
  "weight_unit" varchar(12) NOT NULL DEFAULT 'KG',
  "volume_unit" varchar(12) NOT NULL DEFAULT 'CBM',
  "dimension_unit" varchar(12) NOT NULL DEFAULT 'M',
  "operational_status" "osi"."VehicleOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
  "available_for_calculation" boolean NOT NULL DEFAULT true,
  "effective_from" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" timestamptz(3),
  "hub_code" varchar(80),
  "source" varchar(80) NOT NULL,
  "import_batch_id" text,
  "request_id" varchar(191) NOT NULL,
  "payload_hash" char(64) NOT NULL,
  "calculation_locked_at" timestamptz(3),
  "retired_at" timestamptz(3),
  "created_by_user_id" text,
  "created_by_membership_id" text,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_vehicles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_vehicles_year_check" CHECK ("model_year" IS NULL OR "model_year" BETWEEN 1900 AND 2200),
  CONSTRAINT "osi_vehicles_capacity_check" CHECK (
    ("capacity_weight" IS NULL OR "capacity_weight" > 0) AND
    ("capacity_volume" IS NULL OR "capacity_volume" > 0) AND
    ("usable_length" IS NULL OR "usable_length" > 0) AND
    ("usable_width" IS NULL OR "usable_width" > 0) AND
    ("usable_height" IS NULL OR "usable_height" > 0)
  ),
  CONSTRAINT "osi_vehicles_unit_check" CHECK (
    "weight_unit" IN ('KG', 'LB') AND "volume_unit" IN ('CBM', 'CFT') AND "dimension_unit" IN ('M', 'CM', 'FT', 'IN')
  ),
  CONSTRAINT "osi_vehicles_effective_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
  CONSTRAINT "osi_vehicles_availability_check" CHECK (
    NOT "available_for_calculation" OR "operational_status" IN ('AVAILABLE', 'IN_USE')
  ),
  CONSTRAINT "osi_vehicles_payload_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "osi_vehicles_tenant_id_id_key" ON "osi"."osi_vehicles"("tenant_id", "id");
CREATE UNIQUE INDEX "osi_vehicles_tenant_code_key" ON "osi"."osi_vehicles"("tenant_id", "normalized_code");
CREATE UNIQUE INDEX "osi_vehicles_tenant_plate_key" ON "osi"."osi_vehicles"("tenant_id", "normalized_plate") WHERE "normalized_plate" IS NOT NULL;
CREATE UNIQUE INDEX "osi_vehicles_tenant_vin_key" ON "osi"."osi_vehicles"("tenant_id", "normalized_vin") WHERE "normalized_vin" IS NOT NULL;
CREATE UNIQUE INDEX "osi_vehicles_tenant_source_stable_key" ON "osi"."osi_vehicles"("tenant_id", "source", "source_stable_id") WHERE "source_stable_id" IS NOT NULL;
CREATE UNIQUE INDEX "osi_vehicles_tenant_request_id_key" ON "osi"."osi_vehicles"("tenant_id", "request_id");
CREATE INDEX "osi_vehicles_tenant_status_available_idx" ON "osi"."osi_vehicles"("tenant_id", "operational_status", "available_for_calculation");
CREATE INDEX "osi_vehicles_tenant_capacity_idx" ON "osi"."osi_vehicles"("tenant_id", "capacity_volume", "capacity_weight");
CREATE INDEX "osi_vehicles_import_batch_idx" ON "osi"."osi_vehicles"("tenant_id", "import_batch_id");

CREATE TABLE "osi"."vehicle_import_items" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "batch_id" text NOT NULL,
  "ordinal" integer NOT NULL,
  "source_stable_id" varchar(191),
  "reconciliation_key" varchar(260),
  "status" "osi"."VehicleImportItemStatus" NOT NULL,
  "reason_code" varchar(100),
  "vehicle_id" text,
  "source_json" jsonb NOT NULL,
  "before_json" jsonb,
  "after_json" jsonb,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_import_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_import_items_tenant_id_id_key" ON "osi"."vehicle_import_items"("tenant_id", "id");
CREATE UNIQUE INDEX "vehicle_import_items_batch_ordinal_key" ON "osi"."vehicle_import_items"("tenant_id", "batch_id", "ordinal");
CREATE INDEX "vehicle_import_items_batch_status_idx" ON "osi"."vehicle_import_items"("tenant_id", "batch_id", "status");
CREATE INDEX "vehicle_import_items_vehicle_idx" ON "osi"."vehicle_import_items"("tenant_id", "vehicle_id");

CREATE TABLE "osi"."osi_vehicle_engine_settings" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "series_id" text NOT NULL,
  "scope_key" varchar(120) NOT NULL,
  "version" integer NOT NULL,
  "name" varchar(160) NOT NULL,
  "state" "osi"."LogisticsConfigState" NOT NULL DEFAULT 'DRAFT',
  "operation_mode" "osi"."LogisticsOperationMode" NOT NULL DEFAULT 'LEGACY_ONLY',
  "allow_manual_override" boolean NOT NULL DEFAULT true,
  "require_approval_if_override" boolean NOT NULL DEFAULT false,
  "distribute_wear_automatically" boolean NOT NULL DEFAULT true,
  "consider_upcoming_maintenance" boolean NOT NULL DEFAULT true,
  "block_if_no_vehicle" boolean NOT NULL DEFAULT false,
  "capacity_utilization_percent" numeric(6,3) NOT NULL DEFAULT 85,
  "weight_unit" varchar(12) NOT NULL DEFAULT 'KG',
  "volume_unit" varchar(12) NOT NULL DEFAULT 'CBM',
  "distance_unit" varchar(12) NOT NULL DEFAULT 'KM',
  "settings_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "settings_hash" char(64) NOT NULL,
  "valid_from" timestamptz(3),
  "valid_to" timestamptz(3),
  "version_hash" char(64) NOT NULL,
  "replaces_settings_id" text,
  "source" varchar(80) NOT NULL,
  "evidence_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" text,
  "created_by_membership_id" text,
  "approved_by_user_id" text,
  "approved_by_membership_id" text,
  "approved_at" timestamptz(3),
  "activated_at" timestamptz(3),
  "retired_at" timestamptz(3),
  "request_id" varchar(191) NOT NULL,
  "payload_hash" char(64) NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_vehicle_engine_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_vehicle_engine_settings_version_check" CHECK ("version" > 0),
  CONSTRAINT "osi_vehicle_engine_settings_capacity_check" CHECK ("capacity_utilization_percent" > 0 AND "capacity_utilization_percent" <= 100),
  CONSTRAINT "osi_vehicle_engine_settings_unit_check" CHECK (
    "weight_unit" IN ('KG', 'LB') AND "volume_unit" IN ('CBM', 'CFT') AND "distance_unit" IN ('KM', 'MI')
  ),
  CONSTRAINT "osi_vehicle_engine_settings_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  CONSTRAINT "osi_vehicle_engine_settings_hash_check" CHECK (
    "settings_hash" ~ '^[0-9a-f]{64}$' AND "version_hash" ~ '^[0-9a-f]{64}$' AND "payload_hash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX "osi_vehicle_engine_settings_tenant_id_id_key" ON "osi"."osi_vehicle_engine_settings"("tenant_id", "id");
CREATE UNIQUE INDEX "osi_vehicle_engine_settings_tenant_series_version_key" ON "osi"."osi_vehicle_engine_settings"("tenant_id", "series_id", "version");
CREATE UNIQUE INDEX "osi_vehicle_engine_settings_tenant_version_hash_key" ON "osi"."osi_vehicle_engine_settings"("tenant_id", "version_hash");
CREATE UNIQUE INDEX "osi_vehicle_engine_settings_tenant_request_id_key" ON "osi"."osi_vehicle_engine_settings"("tenant_id", "request_id");
CREATE UNIQUE INDEX "osi_vehicle_engine_settings_one_active_scope_key" ON "osi"."osi_vehicle_engine_settings"("tenant_id", "scope_key") WHERE "state" = 'ACTIVE';
CREATE UNIQUE INDEX "osi_vehicle_engine_settings_one_shadow_scope_key" ON "osi"."osi_vehicle_engine_settings"("tenant_id", "scope_key") WHERE "state" = 'SHADOW';
CREATE INDEX "osi_vehicle_engine_settings_tenant_state_validity_idx" ON "osi"."osi_vehicle_engine_settings"("tenant_id", "state", "valid_from", "valid_to");

ALTER TABLE "osi"."vehicle_import_batches"
  ADD CONSTRAINT "vehicle_import_batches_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vehicle_import_batches_confirmed_membership_fkey" FOREIGN KEY ("tenant_id", "confirmed_by_membership_id", "confirmed_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vehicle_import_batches_rolledback_membership_fkey" FOREIGN KEY ("tenant_id", "rolled_back_by_membership_id", "rolled_back_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT;

ALTER TABLE "osi"."osi_vehicles"
  ADD CONSTRAINT "osi_vehicles_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "osi_vehicles_created_membership_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "osi_vehicles_import_batch_fkey" FOREIGN KEY ("tenant_id", "import_batch_id") REFERENCES "osi"."vehicle_import_batches"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "osi"."vehicle_import_items"
  ADD CONSTRAINT "vehicle_import_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vehicle_import_items_batch_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "osi"."vehicle_import_batches"("tenant_id", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vehicle_import_items_vehicle_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "osi"."osi_vehicles"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "osi"."osi_vehicle_engine_settings"
  ADD CONSTRAINT "osi_vehicle_engine_settings_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "osi_vehicle_engine_settings_created_membership_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "osi_vehicle_engine_settings_approved_membership_fkey" FOREIGN KEY ("tenant_id", "approved_by_membership_id", "approved_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "osi_vehicle_engine_settings_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_settings_id") REFERENCES "osi"."osi_vehicle_engine_settings"("tenant_id", "id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION "osi"."db01i_forbid_vehicle_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DB01I_VEHICLE_DELETE_FORBIDDEN' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "osi_vehicles_no_delete"
BEFORE DELETE ON "osi"."osi_vehicles"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01i_forbid_vehicle_delete"();

CREATE OR REPLACE FUNCTION "osi"."db01i_vehicle_settings_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" IN ('SHADOW', 'ACTIVE', 'RETIRED') AND ROW(
    NEW."tenant_id", NEW."series_id", NEW."scope_key", NEW."version", NEW."name",
    NEW."operation_mode", NEW."allow_manual_override", NEW."require_approval_if_override",
    NEW."distribute_wear_automatically", NEW."consider_upcoming_maintenance", NEW."block_if_no_vehicle",
    NEW."capacity_utilization_percent", NEW."weight_unit", NEW."volume_unit", NEW."distance_unit",
    NEW."settings_json", NEW."settings_hash", NEW."valid_from", NEW."valid_to", NEW."version_hash",
    NEW."replaces_settings_id", NEW."source", NEW."evidence_json", NEW."payload_hash"
  ) IS DISTINCT FROM ROW(
    OLD."tenant_id", OLD."series_id", OLD."scope_key", OLD."version", OLD."name",
    OLD."operation_mode", OLD."allow_manual_override", OLD."require_approval_if_override",
    OLD."distribute_wear_automatically", OLD."consider_upcoming_maintenance", OLD."block_if_no_vehicle",
    OLD."capacity_utilization_percent", OLD."weight_unit", OLD."volume_unit", OLD."distance_unit",
    OLD."settings_json", OLD."settings_hash", OLD."valid_from", OLD."valid_to", OLD."version_hash",
    OLD."replaces_settings_id", OLD."source", OLD."evidence_json", OLD."payload_hash"
  ) THEN
    RAISE EXCEPTION 'DB01I_ACTIVE_SETTINGS_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "osi_vehicle_engine_settings_immutable"
BEFORE UPDATE ON "osi"."osi_vehicle_engine_settings"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01i_vehicle_settings_immutable"();
