-- V17 20C: additive warehouse worksheet profile and immutable presentation addresses.
-- No seed/backfill and no scalar/constraint changes on pre-existing tables.
CREATE TABLE "warehouse_sheet_profiles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "warehouse_number" INTEGER NOT NULL,
  "manager_membership_id" TEXT,
  "manager_user_id" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warehouse_sheet_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "warehouse_sheet_profiles_number_check" CHECK ("warehouse_number" BETWEEN 1 AND 99),
  CONSTRAINT "warehouse_sheet_profiles_version_check" CHECK ("version" >= 1),
  CONSTRAINT "warehouse_sheet_profiles_manager_pair_check" CHECK (("manager_membership_id" IS NULL) = ("manager_user_id" IS NULL))
);
CREATE UNIQUE INDEX "warehouse_sheet_profiles_warehouse_key" ON "warehouse_sheet_profiles"("tenant_id", "warehouse_id");
CREATE UNIQUE INDEX "warehouse_sheet_profiles_number_key" ON "warehouse_sheet_profiles"("tenant_id", "warehouse_number");
CREATE INDEX "warehouse_sheet_profiles_manager_idx" ON "warehouse_sheet_profiles"("tenant_id", "manager_membership_id");
ALTER TABLE "warehouse_sheet_profiles" ADD CONSTRAINT "warehouse_sheet_profiles_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_sheet_profiles" ADD CONSTRAINT "warehouse_sheet_profiles_warehouse_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "material_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_sheet_profiles" ADD CONSTRAINT "warehouse_sheet_profiles_manager_fkey" FOREIGN KEY ("tenant_id", "manager_membership_id", "manager_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "warehouse_location_addresses" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "label" VARCHAR(32) NOT NULL,
  "zone_number" INTEGER NOT NULL DEFAULT 0,
  "aisle_number" INTEGER NOT NULL DEFAULT 0,
  "rack_code" VARCHAR(2),
  "level_number" INTEGER NOT NULL DEFAULT 0,
  "position_number" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warehouse_location_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "warehouse_location_addresses_segments_check" CHECK (
    "zone_number" BETWEEN 0 AND 999 AND "aisle_number" BETWEEN 0 AND 99
    AND ("rack_code" IS NULL OR "rack_code" ~ '^[A-Z]{2}$')
    AND "level_number" BETWEEN 0 AND 9 AND "position_number" BETWEEN 0 AND 4
  )
);
CREATE UNIQUE INDEX "warehouse_location_addresses_location_key" ON "warehouse_location_addresses"("tenant_id", "location_id");
CREATE UNIQUE INDEX "warehouse_location_addresses_label_key" ON "warehouse_location_addresses"("tenant_id", "label");
CREATE INDEX "warehouse_location_addresses_warehouse_idx" ON "warehouse_location_addresses"("tenant_id", "warehouse_id");
ALTER TABLE "warehouse_location_addresses" ADD CONSTRAINT "warehouse_location_addresses_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_location_addresses" ADD CONSTRAINT "warehouse_location_addresses_profile_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouse_sheet_profiles"("tenant_id", "warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_location_addresses" ADD CONSTRAINT "warehouse_location_addresses_location_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "v17_warehouse_sheet_profile_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_SHEET_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."version" <> 1 THEN
      RAISE EXCEPTION 'V17_WAREHOUSE_SHEET_INITIAL_VERSION_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW."id", NEW."tenant_id", NEW."warehouse_id", NEW."warehouse_number", NEW."created_at")
     IS DISTINCT FROM ROW(OLD."id", OLD."tenant_id", OLD."warehouse_id", OLD."warehouse_number", OLD."created_at") THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_SHEET_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_SHEET_VERSION_INVALID' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "warehouse_sheet_profiles_guard" BEFORE INSERT OR UPDATE OR DELETE ON "warehouse_sheet_profiles"
  FOR EACH ROW EXECUTE FUNCTION "v17_warehouse_sheet_profile_guard"();

CREATE FUNCTION "v17_warehouse_location_address_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  location_row RECORD;
  parent_row RECORD;
  parent_address RECORD;
  warehouse_number INTEGER;
  location_rank INTEGER;
  parent_rank INTEGER;
  expected_label TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO location_row FROM "osi"."material_locations"
    WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."location_id";
  SELECT p."warehouse_number" INTO warehouse_number FROM "osi"."warehouse_sheet_profiles" p
    WHERE p."tenant_id" = NEW."tenant_id" AND p."warehouse_id" = NEW."warehouse_id";
  IF location_row."id" IS NULL OR location_row."warehouse_id" <> NEW."warehouse_id" OR warehouse_number IS NULL THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_SCOPE_INVALID' USING ERRCODE = '23514';
  END IF;
  expected_label := 'ALM-' || LPAD(warehouse_number::text, 2, '0') || '-'
    || LPAD(NEW."zone_number"::text, 3, '0') || '-' || LPAD(NEW."aisle_number"::text, 2, '0') || '-'
    || COALESCE(NEW."rack_code", '00') || '-' || NEW."level_number"::text || '-' || NEW."position_number"::text;
  IF NEW."label" <> expected_label THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_LABEL_INVALID' USING ERRCODE = '23514';
  END IF;
  location_rank := CASE location_row."kind"::text WHEN 'WAREHOUSE_ROOT' THEN 0 WHEN 'ZONE' THEN 1 WHEN 'AISLE' THEN 2 WHEN 'RACK' THEN 3 WHEN 'LEVEL' THEN 4 WHEN 'BIN' THEN 5 ELSE -1 END;
  IF location_rank = 0 THEN
    IF location_row."parent_location_id" IS NOT NULL OR NEW."zone_number" <> 0 OR NEW."aisle_number" <> 0
       OR NEW."rack_code" IS NOT NULL OR NEW."level_number" <> 0 OR NEW."position_number" <> 0 THEN
      RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_HIERARCHY_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF location_rank < 1 OR location_row."parent_location_id" IS NULL THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_HIERARCHY_INVALID' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO parent_row FROM "osi"."material_locations"
    WHERE "tenant_id" = NEW."tenant_id" AND "id" = location_row."parent_location_id";
  SELECT * INTO parent_address FROM "osi"."warehouse_location_addresses"
    WHERE "tenant_id" = NEW."tenant_id" AND "location_id" = location_row."parent_location_id";
  parent_rank := CASE parent_row."kind"::text WHEN 'WAREHOUSE_ROOT' THEN 0 WHEN 'ZONE' THEN 1 WHEN 'AISLE' THEN 2 WHEN 'RACK' THEN 3 WHEN 'LEVEL' THEN 4 WHEN 'BIN' THEN 5 ELSE -1 END;
  IF parent_row."warehouse_id" IS DISTINCT FROM NEW."warehouse_id" OR parent_address."id" IS NULL
     OR parent_rank < 0 OR parent_rank >= location_rank THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_HIERARCHY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF (location_rank = 1 AND NEW."zone_number" = 0) OR (location_rank > 1 AND NEW."zone_number" <> parent_address."zone_number")
     OR (location_rank < 2 AND NEW."aisle_number" <> 0) OR (location_rank = 2 AND NEW."aisle_number" = 0) OR (location_rank > 2 AND NEW."aisle_number" <> parent_address."aisle_number")
     OR (location_rank < 3 AND NEW."rack_code" IS NOT NULL) OR (location_rank = 3 AND NEW."rack_code" IS NULL) OR (location_rank > 3 AND NEW."rack_code" IS DISTINCT FROM parent_address."rack_code")
     OR (location_rank < 4 AND NEW."level_number" <> 0) OR (location_rank = 4 AND (NEW."level_number" = 0 OR NEW."rack_code" IS NULL)) OR (location_rank > 4 AND NEW."level_number" <> parent_address."level_number")
     OR (location_rank < 5 AND NEW."position_number" <> 0) OR (location_rank = 5 AND NEW."position_number" = 0) THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_SEGMENTS_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "warehouse_location_addresses_guard" BEFORE INSERT OR UPDATE OR DELETE ON "warehouse_location_addresses"
  FOR EACH ROW EXECUTE FUNCTION "v17_warehouse_location_address_guard"();
