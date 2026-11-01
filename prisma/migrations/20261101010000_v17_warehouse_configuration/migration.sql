-- V17 20B: additive warehouse configuration. No seed, backfill, or old-table scalar changes.
-- With the configuration feature disabled, existing warehouse/material/asset queries
-- do not select these tables and remain compatible before this migration is applied.
-- CreateEnum
CREATE TYPE "WarehouseAreaUsePurpose" AS ENUM ('INTERNAL', 'CLIENT_STORAGE', 'MIXED');

-- CreateEnum
CREATE TYPE "WarehouseLocationOperationalStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "WarehouseLocationAvailabilityRule" AS ENUM ('CONDITION_BASED', 'BLOCKED');

-- CreateTable
CREATE TABLE "warehouse_area_uses" (
    "id" TEXT NOT NULL,
    "use_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "name_key" VARCHAR(320) NOT NULL,
    "description" VARCHAR(500),
    "purpose" "WarehouseAreaUsePurpose" NOT NULL,
    "status" "MaterialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_area_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_location_configurations" (
    "id" TEXT NOT NULL,
    "config_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "area_use_id" TEXT,
    "characteristics" VARCHAR(180),
    "notes" VARCHAR(2000),
    "operational_status" "WarehouseLocationOperationalStatus" NOT NULL DEFAULT 'ACTIVE',
    "availability_rule" "WarehouseLocationAvailabilityRule" NOT NULL DEFAULT 'CONDITION_BASED',
    "control_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_location_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouse_area_uses_status_idx" ON "warehouse_area_uses"("tenant_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_area_uses_tenant_id_key" ON "warehouse_area_uses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_area_uses_tenant_ref_key" ON "warehouse_area_uses"("tenant_id", "use_ref");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_area_uses_tenant_code_key" ON "warehouse_area_uses"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_area_uses_tenant_name_key" ON "warehouse_area_uses"("tenant_id", "name_key");

-- CreateIndex
CREATE INDEX "warehouse_location_configs_area_use_idx" ON "warehouse_location_configurations"("tenant_id", "area_use_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_location_configs_tenant_id_key" ON "warehouse_location_configurations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_location_configs_tenant_ref_key" ON "warehouse_location_configurations"("tenant_id", "config_ref");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_location_configs_location_key" ON "warehouse_location_configurations"("tenant_id", "location_id");

-- AddForeignKey
ALTER TABLE "warehouse_area_uses" ADD CONSTRAINT "warehouse_area_uses_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_location_configurations" ADD CONSTRAINT "warehouse_location_configs_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_location_configurations" ADD CONSTRAINT "warehouse_location_configs_location_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_location_configurations" ADD CONSTRAINT "warehouse_location_configs_area_use_fkey" FOREIGN KEY ("tenant_id", "area_use_id") REFERENCES "warehouse_area_uses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "warehouse_area_uses" ADD CONSTRAINT "warehouse_area_uses_name_check"
  CHECK (BTRIM("name") <> '' AND BTRIM("name_key") <> '');
ALTER TABLE "warehouse_area_uses" ADD CONSTRAINT "warehouse_area_uses_code_check"
  CHECK ("code" ~ '^[A-Z][A-Z0-9_-]{0,63}$');
ALTER TABLE "warehouse_area_uses" ADD CONSTRAINT "warehouse_area_uses_version_check" CHECK ("version" >= 1);
ALTER TABLE "warehouse_location_configurations" ADD CONSTRAINT "warehouse_location_configs_version_check" CHECK ("version" >= 1);

CREATE FUNCTION "v17_warehouse_configuration_identity_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE immutable_column TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_CONFIGURATION_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."version" <> 1 THEN
      RAISE EXCEPTION 'V17_WAREHOUSE_CONFIGURATION_INITIAL_VERSION_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW."id", NEW."tenant_id", NEW."created_at") IS DISTINCT FROM ROW(OLD."id", OLD."tenant_id", OLD."created_at") THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_CONFIGURATION_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  FOREACH immutable_column IN ARRAY TG_ARGV LOOP
    IF to_jsonb(NEW)->immutable_column IS DISTINCT FROM to_jsonb(OLD)->immutable_column THEN
      RAISE EXCEPTION 'V17_WAREHOUSE_CONFIGURATION_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
  END LOOP;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_CONFIGURATION_VERSION_INVALID' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "warehouse_area_uses_identity_guard" BEFORE INSERT OR UPDATE OR DELETE ON "warehouse_area_uses"
  FOR EACH ROW EXECUTE FUNCTION "v17_warehouse_configuration_identity_guard"('use_ref', 'code');
CREATE TRIGGER "warehouse_location_configs_identity_guard" BEFORE INSERT OR UPDATE OR DELETE ON "warehouse_location_configurations"
  FOR EACH ROW EXECUTE FUNCTION "v17_warehouse_configuration_identity_guard"('config_ref', 'location_id');

-- A lazy per-tenant write barrier forces a fresh Serializable snapshot after an
-- advisory-lock waiter. It is infrastructure, not a location or inventory record.
CREATE TABLE "warehouse_location_policy_epochs" (
  "tenant_id" TEXT NOT NULL,
  "revision" BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT "warehouse_location_policy_epochs_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "warehouse_location_policy_epochs_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "warehouse_location_policy_epochs_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE FUNCTION "v17_warehouse_location_policy_epoch_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_POLICY_EPOCH_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."revision" <> 1 THEN
      RAISE EXCEPTION 'V17_WAREHOUSE_POLICY_EPOCH_INITIAL_REVISION_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_POLICY_EPOCH_TENANT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_POLICY_EPOCH_REVISION_INVALID' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "warehouse_location_policy_epochs_guard" BEFORE INSERT OR UPDATE OR DELETE ON "warehouse_location_policy_epochs"
  FOR EACH ROW EXECUTE FUNCTION "v17_warehouse_location_policy_epoch_guard"();

