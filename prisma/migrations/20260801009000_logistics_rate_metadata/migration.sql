-- DB-01J corrective metadata for DB-01H monetary rates.
-- Does not import, infer or modify the values 57, 55 or 220.

ALTER TABLE "osi"."osi_zone_rules"
  ADD COLUMN "currency_code" char(3),
  ADD COLUMN "km_rate_unit" varchar(32);

ALTER TABLE "osi"."osi_transport_zone_rules"
  ADD COLUMN "currency_code" char(3);

ALTER TABLE "osi"."osi_zone_rules"
  ADD CONSTRAINT "osi_zone_rules_currency_check"
    CHECK ("currency_code" IS NULL OR "currency_code" ~ '^[A-Z]{3}$') NOT VALID,
  ADD CONSTRAINT "osi_zone_rules_km_rate_metadata_check"
    CHECK ("km_rate" IS NULL OR ("currency_code" IS NOT NULL AND "km_rate_unit" = 'AMOUNT_PER_KM')) NOT VALID;

ALTER TABLE "osi"."osi_transport_zone_rules"
  ADD CONSTRAINT "osi_transport_zone_rules_currency_check"
    CHECK ("currency_code" IS NULL OR "currency_code" ~ '^[A-Z]{3}$') NOT VALID,
  ADD CONSTRAINT "osi_transport_zone_rules_minimum_currency_check"
    CHECK ("minimum_charge" IS NULL OR "currency_code" IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION "osi"."db01j_zone_rate_metadata_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" IN ('SHADOW', 'ACTIVE', 'RETIRED')
     AND ROW(NEW."currency_code", NEW."km_rate_unit")
         IS DISTINCT FROM ROW(OLD."currency_code", OLD."km_rate_unit") THEN
    RAISE EXCEPTION 'DB01J_ZONE_RATE_METADATA_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "osi_zone_rules_rate_metadata_immutable"
BEFORE UPDATE ON "osi"."osi_zone_rules"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01j_zone_rate_metadata_immutable"();

CREATE OR REPLACE FUNCTION "osi"."db01j_transport_rate_metadata_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" IN ('SHADOW', 'ACTIVE', 'RETIRED')
     AND NEW."currency_code" IS DISTINCT FROM OLD."currency_code" THEN
    RAISE EXCEPTION 'DB01J_TRANSPORT_RATE_METADATA_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "osi_transport_zone_rules_rate_metadata_immutable"
BEFORE UPDATE ON "osi"."osi_transport_zone_rules"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01j_transport_rate_metadata_immutable"();
