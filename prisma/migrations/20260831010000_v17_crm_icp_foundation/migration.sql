-- V17 migration 22: tenant-first ICP v2 address and immutable route foundations.
-- This migration is additive. It deliberately does not infer structured addresses
-- from legacy Client or PipelineCase text fields.

CREATE TYPE "osi"."ClientAddressStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "osi"."PipelineCaseRouteRole" AS ENUM ('ORIGIN', 'DESTINATION', 'ADDITIONAL_STOP');
CREATE TYPE "osi"."PipelineDestinationStatus" AS ENUM ('CONFIRMED', 'APPROXIMATE', 'PENDING');
CREATE TYPE "osi"."PipelineIntakeChannel" AS ENUM (
  'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'RECOMMENDATION', 'YOUTUBE', 'OTHER_SOCIAL',
  'PROMOTION', 'CALL', 'EMAIL', 'WEB', 'REFERRED'
);
CREATE TYPE "osi"."PipelineClientProfileType" AS ENUM (
  'INDIVIDUAL', 'CORPORATE', 'LEAD_ACCOUNT', 'COMMERCIAL', 'DIPLOMATIC'
);

ALTER TABLE "osi"."osi_clients"
  ADD COLUMN "normalized_email" VARCHAR(320),
  ADD COLUMN "tax_id_normalized" VARCHAR(32);

CREATE UNIQUE INDEX "osi_clients_tenant_tax_id_normalized_key"
  ON "osi"."osi_clients" ("tenant_id", "tax_id_normalized")
  WHERE "tenant_id" IS NOT NULL AND "tax_id_normalized" IS NOT NULL;

CREATE UNIQUE INDEX "osi_clients_tenant_phone_email_normalized_key"
  ON "osi"."osi_clients" ("tenant_id", "normalizedPhone", "normalized_email")
  WHERE "tenant_id" IS NOT NULL AND "normalizedPhone" IS NOT NULL AND "normalized_email" IS NOT NULL;

ALTER TABLE "osi"."osi_clients"
  ADD CONSTRAINT "osi_clients_icp_normalized_values_check"
  CHECK (
    ("normalized_email" IS NULL OR (
      "normalized_email" = lower(btrim("normalized_email"))
      AND "normalized_email" !~ '[[:space:]]'
      AND length("normalized_email") BETWEEN 3 AND 320
    ))
    AND ("tax_id_normalized" IS NULL OR (
      "tax_id_normalized" = upper(btrim("tax_id_normalized"))
      AND "tax_id_normalized" ~ '^[A-Z0-9]{5,32}$'
    ))
  );

CREATE SEQUENCE "osi"."icp_client_code_seq" AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE FUNCTION "osi"."next_icp_client_code"()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, osi
AS $$
  SELECT 'ICP-' || to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY') || '-'
    || lpad(nextval('osi.icp_client_code_seq'::regclass)::text, 12, '0')
$$;

CREATE TABLE "osi"."client_addresses" (
  "id" TEXT NOT NULL,
  "address_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "country_code" CHAR(2) NOT NULL,
  "province_state" VARCHAR(160),
  "city_municipality" VARCHAR(160) NOT NULL,
  "sector" VARCHAR(160),
  "street_and_number" VARCHAR(240),
  "building_residential" VARCHAR(160),
  "floor_unit" VARCHAR(80),
  "arrival_reference" VARCHAR(320),
  "location_contact_name" VARCHAR(160),
  "location_contact_phone" VARCHAR(40),
  "label" VARCHAR(80),
  "status" "osi"."ClientAddressStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_addresses_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "client_addresses_city_check" CHECK (length(btrim("city_municipality")) BETWEEN 1 AND 160),
  CONSTRAINT "client_addresses_contact_phone_check" CHECK (
    "location_contact_phone" IS NULL OR "location_contact_phone" ~ '^\+[1-9][0-9]{7,14}$'
  )
);

ALTER TABLE "osi"."client_addresses"
  ADD CONSTRAINT "client_addresses_tenant_id_key" UNIQUE ("tenant_id", "id"),
  ADD CONSTRAINT "client_addresses_tenant_address_ref_key" UNIQUE ("tenant_id", "address_ref"),
  ADD CONSTRAINT "client_addresses_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "client_addresses_tenant_client_fkey"
    FOREIGN KEY ("tenant_id", "client_id") REFERENCES "osi"."osi_clients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "client_addresses_tenant_client_status_label_idx"
  ON "osi"."client_addresses" ("tenant_id", "client_id", "status", "label");
CREATE INDEX "client_addresses_tenant_geography_idx"
  ON "osi"."client_addresses" ("tenant_id", "country_code", "province_state", "city_municipality");

CREATE FUNCTION "osi"."client_addresses_reject_address_ref_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  IF NEW."address_ref" IS DISTINCT FROM OLD."address_ref" THEN
    RAISE EXCEPTION 'ClientAddress.addressRef is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "client_addresses_address_ref_immutable"
BEFORE UPDATE OF "address_ref" ON "osi"."client_addresses"
FOR EACH ROW EXECUTE FUNCTION "osi"."client_addresses_reject_address_ref_mutation"();

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD COLUMN "case_contact_name" VARCHAR(160),
  ADD COLUMN "case_contact_phone" VARCHAR(40),
  ADD COLUMN "case_contact_phone_normalized" VARCHAR(32),
  ADD COLUMN "case_contact_email" VARCHAR(320),
  ADD COLUMN "case_contact_email_normalized" VARCHAR(320),
  ADD COLUMN "intake_channel" "osi"."PipelineIntakeChannel",
  ADD COLUMN "client_profile_type" "osi"."PipelineClientProfileType",
  ADD COLUMN "route_contract_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "route_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "destination_status" "osi"."PipelineDestinationStatus";

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_icp_contact_check" CHECK (
    ("case_contact_phone_normalized" IS NULL OR "case_contact_phone_normalized" ~ '^\+[1-9][0-9]{7,14}$')
    AND ("case_contact_email_normalized" IS NULL OR (
      "case_contact_email_normalized" = lower(btrim("case_contact_email_normalized"))
      AND "case_contact_email_normalized" !~ '[[:space:]]'
      AND length("case_contact_email_normalized") BETWEEN 3 AND 320
    ))
  ),
  ADD CONSTRAINT "osi_pipeline_cases_route_contract_check" CHECK (
    ("route_contract_version" = 1 AND "route_revision" = 0 AND "destination_status" IS NULL)
    OR
    ("route_contract_version" = 2 AND "route_revision" >= 1 AND "destination_status" IS NOT NULL)
  );

CREATE TABLE "osi"."pipeline_case_route_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "route_version" INTEGER NOT NULL,
  "role" "osi"."PipelineCaseRouteRole" NOT NULL,
  "stop_order" INTEGER NOT NULL DEFAULT 0,
  "source_address_ref" UUID,
  "country_code" CHAR(2) NOT NULL,
  "province_state" VARCHAR(160),
  "city_municipality" VARCHAR(160) NOT NULL,
  "sector" VARCHAR(160),
  "street_and_number" VARCHAR(240),
  "building_residential" VARCHAR(160),
  "floor_unit" VARCHAR(80),
  "arrival_reference" VARCHAR(320),
  "location_contact_name" VARCHAR(160),
  "location_contact_phone" VARCHAR(40),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_case_route_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_case_route_snapshots_route_version_check" CHECK ("route_version" >= 1),
  CONSTRAINT "pipeline_case_route_snapshots_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "pipeline_case_route_snapshots_city_check" CHECK (length(btrim("city_municipality")) BETWEEN 1 AND 160),
  CONSTRAINT "pipeline_case_route_snapshots_contact_phone_check" CHECK (
    "location_contact_phone" IS NULL OR "location_contact_phone" ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT "pipeline_case_route_snapshots_position_check" CHECK (
    ("role" IN ('ORIGIN', 'DESTINATION') AND "stop_order" = 0)
    OR ("role" = 'ADDITIONAL_STOP' AND "stop_order" BETWEEN 1 AND 8)
  )
);

ALTER TABLE "osi"."pipeline_case_route_snapshots"
  ADD CONSTRAINT "pipeline_case_route_snapshots_position_key"
    UNIQUE ("tenant_id", "pipeline_case_id", "route_version", "role", "stop_order"),
  ADD CONSTRAINT "pipeline_case_route_snapshots_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_route_snapshots_tenant_case_fkey"
    FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_route_snapshots_source_address_fkey"
    FOREIGN KEY ("tenant_id", "source_address_ref") REFERENCES "osi"."client_addresses"("tenant_id", "address_ref") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "pipeline_case_route_snapshots_origin_key"
  ON "osi"."pipeline_case_route_snapshots" ("tenant_id", "pipeline_case_id", "route_version")
  WHERE "role" = 'ORIGIN';
CREATE UNIQUE INDEX "pipeline_case_route_snapshots_destination_key"
  ON "osi"."pipeline_case_route_snapshots" ("tenant_id", "pipeline_case_id", "route_version")
  WHERE "role" = 'DESTINATION';
CREATE INDEX "pipeline_case_route_snapshots_route_idx"
  ON "osi"."pipeline_case_route_snapshots" ("tenant_id", "pipeline_case_id", "route_version");
CREATE INDEX "pipeline_case_route_snapshots_source_address_idx"
  ON "osi"."pipeline_case_route_snapshots" ("tenant_id", "source_address_ref");

CREATE FUNCTION "osi"."pipeline_case_route_snapshots_before_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
DECLARE
  current_revision integer;
BEGIN
  SELECT "route_revision" INTO current_revision
  FROM "osi"."osi_pipeline_cases"
  WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."pipeline_case_id"
  FOR KEY SHARE;
  IF NOT FOUND OR NEW."route_version" <> current_revision + 1 THEN
    RAISE EXCEPTION 'PipelineCase route version is not the next tenant-first revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pipeline_case_route_snapshots_next_revision"
BEFORE INSERT ON "osi"."pipeline_case_route_snapshots"
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_case_route_snapshots_before_insert"();

CREATE FUNCTION "osi"."pipeline_case_route_snapshots_reject_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  RAISE EXCEPTION 'PipelineCase route snapshots are immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "pipeline_case_route_snapshots_immutable"
BEFORE UPDATE OR DELETE ON "osi"."pipeline_case_route_snapshots"
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_case_route_snapshots_reject_mutation"();

CREATE FUNCTION "osi"."pipeline_cases_validate_route_revision"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  IF NEW."route_contract_version" < OLD."route_contract_version"
     OR NEW."route_contract_version" > 2 THEN
    RAISE EXCEPTION 'PipelineCase route contract cannot be downgraded or skipped' USING ERRCODE = '23514';
  END IF;
  IF NEW."route_revision" < OLD."route_revision"
     OR NEW."route_revision" > OLD."route_revision" + 1 THEN
    RAISE EXCEPTION 'PipelineCase route revision must advance exactly once' USING ERRCODE = '23514';
  END IF;
  IF NEW."destination_status" IS DISTINCT FROM OLD."destination_status"
     AND NEW."route_revision" <> OLD."route_revision" + 1 THEN
    RAISE EXCEPTION 'PipelineCase destination status requires a new route revision' USING ERRCODE = '23514';
  END IF;
  IF NEW."route_revision" = OLD."route_revision" + 1
     AND NEW."route_contract_version" <> 2 THEN
    RAISE EXCEPTION 'PipelineCase structured routes require contract v2' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "osi_pipeline_cases_route_revision_control"
BEFORE UPDATE OF "route_contract_version", "route_revision", "destination_status"
ON "osi"."osi_pipeline_cases"
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_cases_validate_route_revision"();

CREATE FUNCTION "osi"."pipeline_cases_validate_route_snapshot_set"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
DECLARE
  tenant_country text;
  origin_count integer;
  destination_count integer;
  stop_count integer;
  origin_full boolean;
  destination_full boolean;
BEGIN
  IF NEW."route_revision" = OLD."route_revision" THEN
    RETURN NULL;
  END IF;

  SELECT "country_code" INTO tenant_country FROM "osi"."tenants" WHERE "id" = NEW."tenant_id";
  SELECT
    count(*) FILTER (WHERE "role" = 'ORIGIN'),
    count(*) FILTER (WHERE "role" = 'DESTINATION'),
    count(*) FILTER (WHERE "role" = 'ADDITIONAL_STOP'),
    coalesce(bool_and(
      "province_state" IS NOT NULL AND length(btrim("province_state")) > 0
      AND "street_and_number" IS NOT NULL AND length(btrim("street_and_number")) > 0
    ) FILTER (WHERE "role" = 'ORIGIN'), false),
    coalesce(bool_and(
      "province_state" IS NOT NULL AND length(btrim("province_state")) > 0
      AND "street_and_number" IS NOT NULL AND length(btrim("street_and_number")) > 0
    ) FILTER (WHERE "role" = 'DESTINATION'), false)
  INTO origin_count, destination_count, stop_count, origin_full, destination_full
  FROM "osi"."pipeline_case_route_snapshots"
  WHERE "tenant_id" = NEW."tenant_id"
    AND "pipeline_case_id" = NEW."id"
    AND "route_version" = NEW."route_revision";

  IF origin_count <> 1 OR stop_count > 8 THEN
    RAISE EXCEPTION 'PipelineCase route requires one origin and at most eight stops' USING ERRCODE = '23514';
  END IF;
  IF NEW."destination_status" = 'PENDING' THEN
    IF NEW."mode" <> 'LOCAL' OR destination_count <> 0 THEN
      RAISE EXCEPTION 'Pending destination is limited to an authorized LOCAL route without destination snapshot' USING ERRCODE = '23514';
    END IF;
  ELSIF destination_count <> 1 THEN
    RAISE EXCEPTION 'PipelineCase route requires one destination snapshot' USING ERRCODE = '23514';
  END IF;

  IF NEW."mode" = 'LOCAL' THEN
    IF tenant_country IS NULL OR NOT origin_full
       OR EXISTS (
         SELECT 1 FROM "osi"."pipeline_case_route_snapshots"
         WHERE "tenant_id" = NEW."tenant_id" AND "pipeline_case_id" = NEW."id"
           AND "route_version" = NEW."route_revision" AND "role" = 'ORIGIN'
           AND "country_code" <> tenant_country
       )
       OR (NEW."destination_status" <> 'PENDING' AND (
         NOT destination_full OR EXISTS (
           SELECT 1 FROM "osi"."pipeline_case_route_snapshots"
           WHERE "tenant_id" = NEW."tenant_id" AND "pipeline_case_id" = NEW."id"
             AND "route_version" = NEW."route_revision" AND "role" = 'DESTINATION'
             AND "country_code" <> tenant_country
         )
       )) THEN
      RAISE EXCEPTION 'LOCAL route requires complete tenant-country origin and destination' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."mode" = 'EXPORT' THEN
    IF NEW."destination_status" = 'PENDING' OR tenant_country IS NULL OR NOT origin_full
       OR EXISTS (
         SELECT 1 FROM "osi"."pipeline_case_route_snapshots"
         WHERE "tenant_id" = NEW."tenant_id" AND "pipeline_case_id" = NEW."id"
           AND "route_version" = NEW."route_revision" AND "role" = 'ORIGIN'
           AND "country_code" <> tenant_country
       ) THEN
      RAISE EXCEPTION 'EXPORT route requires complete local origin and country/city destination' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."mode" = 'IMPORT' THEN
    IF NEW."destination_status" = 'PENDING' OR tenant_country IS NULL OR NOT destination_full
       OR EXISTS (
         SELECT 1 FROM "osi"."pipeline_case_route_snapshots"
         WHERE "tenant_id" = NEW."tenant_id" AND "pipeline_case_id" = NEW."id"
           AND "route_version" = NEW."route_revision" AND "role" = 'DESTINATION'
           AND "country_code" <> tenant_country
       ) THEN
      RAISE EXCEPTION 'IMPORT route requires country/city origin and complete local destination' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "osi"."pipeline_case_route_snapshots"
    WHERE "tenant_id" = NEW."tenant_id" AND "pipeline_case_id" = NEW."id"
      AND "route_version" = NEW."route_revision" AND "role" = 'ADDITIONAL_STOP'
      AND ("province_state" IS NULL OR length(btrim("province_state")) = 0
        OR "street_and_number" IS NULL OR length(btrim("street_and_number")) = 0)
  ) THEN
    RAISE EXCEPTION 'Additional stops require complete structured addresses' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "osi_pipeline_cases_route_snapshot_set_complete"
AFTER UPDATE OF "route_contract_version", "route_revision", "destination_status"
ON "osi"."osi_pipeline_cases"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_cases_validate_route_snapshot_set"();

CREATE FUNCTION "osi"."pipeline_case_quotes_reject_final_pending_destination"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  IF upper(NEW."status") = 'FINAL' AND EXISTS (
    SELECT 1 FROM "osi"."osi_pipeline_cases"
    WHERE "id" = NEW."caseId" AND "destination_status" = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'Final quote requires confirmed or approximate destination' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "osi_pipeline_case_quotes_final_destination_guard"
BEFORE INSERT OR UPDATE OF "status" ON "osi"."osi_pipeline_case_quotes"
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_case_quotes_reject_final_pending_destination"();
