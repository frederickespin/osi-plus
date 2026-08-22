-- V17-CASE-PUBLIC-REF-01A — identidad pública UUID independiente e inmutable.
-- Backfill técnico: no modifica autoridad empresarial ni expone la referencia por HTTP.

DO $v17_public_ref$
BEGIN
  IF to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_UUID_UNAVAILABLE'
      USING ERRCODE = '0A000';
  END IF;
END
$v17_public_ref$;

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD COLUMN "public_ref" UUID;

UPDATE "osi"."osi_pipeline_cases"
SET "public_ref" = pg_catalog.gen_random_uuid()
WHERE "public_ref" IS NULL;

-- PipelineCase ya posee un constraint trigger diferido. Se drenan sus eventos
-- antes del siguiente ALTER TABLE sin desactivar ni omitir ninguna protección.
SET CONSTRAINTS ALL IMMEDIATE;

DO $v17_public_ref$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "osi"."osi_pipeline_cases"
    WHERE "public_ref" IS NULL
  ) THEN
    RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_BACKFILL_INCOMPLETE'
      USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "osi"."osi_pipeline_cases"
    GROUP BY "tenant_id", "public_ref"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_BACKFILL_DUPLICATE'
      USING ERRCODE = '23505';
  END IF;
END
$v17_public_ref$;

ALTER TABLE "osi"."osi_pipeline_cases"
  ALTER COLUMN "public_ref" SET DEFAULT pg_catalog.gen_random_uuid(),
  ALTER COLUMN "public_ref" SET NOT NULL;

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_tenant_id_public_ref_key"
    UNIQUE ("tenant_id", "public_ref");

CREATE FUNCTION "osi"."osi_prevent_pipeline_case_public_ref_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $v17_public_ref$
BEGIN
  IF NEW."public_ref" IS DISTINCT FROM OLD."public_ref" THEN
    RAISE EXCEPTION 'V17_PIPELINE_CASE_PUBLIC_REF_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$v17_public_ref$;

CREATE TRIGGER "osi_pipeline_cases_public_ref_immutable_trg"
BEFORE UPDATE OF "public_ref" ON "osi"."osi_pipeline_cases"
FOR EACH ROW
EXECUTE FUNCTION "osi"."osi_prevent_pipeline_case_public_ref_change"();
