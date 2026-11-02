-- V17 20D: optional alphanumeric zone identifiers for explicit warehouse routes.
-- No backfill, renumbering or modification of persisted warehouse/location identities.
-- The existing numeric checks, unique labels, scope FKs and immutable-address trigger remain.
ALTER TABLE "warehouse_location_addresses" ADD COLUMN "zone_code" VARCHAR(3);
ALTER TABLE "warehouse_location_addresses" ADD CONSTRAINT "warehouse_location_addresses_zone_code_check" CHECK (
  "zone_code" IS NULL OR (
    "zone_code" ~ '^[A-Z0-9]{3}$' AND "zone_code" ~ '[A-Z]' AND "zone_number" = 0
  )
);

CREATE OR REPLACE FUNCTION "v17_warehouse_location_address_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
    || COALESCE(NEW."zone_code", LPAD(NEW."zone_number"::text, 3, '0')) || '-' || LPAD(NEW."aisle_number"::text, 2, '0') || '-'
    || COALESCE(NEW."rack_code", '00') || '-' || NEW."level_number"::text || '-' || NEW."position_number"::text;
  IF NEW."label" <> expected_label THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_LABEL_INVALID' USING ERRCODE = '23514';
  END IF;
  location_rank := CASE location_row."kind"::text WHEN 'WAREHOUSE_ROOT' THEN 0 WHEN 'ZONE' THEN 1 WHEN 'AISLE' THEN 2 WHEN 'RACK' THEN 3 WHEN 'LEVEL' THEN 4 WHEN 'BIN' THEN 5 ELSE -1 END;
  IF location_rank = 0 THEN
    IF location_row."parent_location_id" IS NOT NULL OR NEW."zone_number" <> 0 OR NEW."zone_code" IS NOT NULL OR NEW."aisle_number" <> 0
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
  IF (location_rank = 1 AND NEW."zone_number" = 0 AND NEW."zone_code" IS NULL)
     OR (location_rank > 1 AND (NEW."zone_number" <> parent_address."zone_number" OR NEW."zone_code" IS DISTINCT FROM parent_address."zone_code"))
     OR (location_rank < 2 AND NEW."aisle_number" <> 0) OR (location_rank = 2 AND NEW."aisle_number" = 0) OR (location_rank > 2 AND NEW."aisle_number" <> parent_address."aisle_number")
     OR (location_rank < 3 AND NEW."rack_code" IS NOT NULL) OR (location_rank = 3 AND NEW."rack_code" IS NULL) OR (location_rank > 3 AND NEW."rack_code" IS DISTINCT FROM parent_address."rack_code")
     OR (location_rank < 4 AND NEW."level_number" <> 0) OR (location_rank = 4 AND (NEW."level_number" = 0 OR NEW."rack_code" IS NULL)) OR (location_rank > 4 AND NEW."level_number" <> parent_address."level_number")
     OR (location_rank < 5 AND NEW."position_number" <> 0) OR (location_rank = 5 AND NEW."position_number" = 0) THEN
    RAISE EXCEPTION 'V17_WAREHOUSE_ADDRESS_SEGMENTS_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
