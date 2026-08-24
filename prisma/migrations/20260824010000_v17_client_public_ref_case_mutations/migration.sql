-- V17 migration 19: public Client identity and governed case create/update commands.
-- The only backfill is the technical UUID identity required by the new NOT NULL column.

ALTER TABLE "osi"."osi_clients" ADD COLUMN "public_ref" UUID;
UPDATE "osi"."osi_clients"
SET "public_ref" = gen_random_uuid()
WHERE "public_ref" IS NULL;
ALTER TABLE "osi"."osi_clients"
  ALTER COLUMN "public_ref" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "public_ref" SET NOT NULL;
ALTER TABLE "osi"."osi_clients"
  ADD CONSTRAINT "osi_clients_tenant_id_public_ref_key" UNIQUE ("tenant_id", "public_ref");

CREATE FUNCTION "osi"."osi_clients_reject_public_ref_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  IF NEW."public_ref" IS DISTINCT FROM OLD."public_ref" THEN
    RAISE EXCEPTION 'Client.publicRef is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "osi_clients_public_ref_immutable"
BEFORE UPDATE OF "public_ref" ON "osi"."osi_clients"
FOR EACH ROW EXECUTE FUNCTION "osi"."osi_clients_reject_public_ref_mutation"();

-- Case codes are authoritative inside a tenant. New codes remain server-generated.
DROP INDEX "osi"."osi_pipeline_cases_caseCode_key";
ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_tenant_id_case_code_key" UNIQUE ("tenant_id", "caseCode");

DROP TRIGGER "pipeline_case_commands_validate_case_state_trigger" ON "osi"."pipeline_case_commands";
DROP FUNCTION "osi"."pipeline_case_commands_validate_case_state"();
DROP TRIGGER "pipeline_cases_coherent_command_constraint" ON "osi"."osi_pipeline_cases";
DROP FUNCTION "osi"."pipeline_cases_require_coherent_command"();
ALTER TABLE "osi"."pipeline_case_commands"
  DROP CONSTRAINT "pipeline_case_commands_version_step_check",
  DROP CONSTRAINT "pipeline_case_commands_command_shape_check";

ALTER TABLE "osi"."pipeline_case_commands"
  ALTER COLUMN "command_type" TYPE TEXT USING "command_type"::text;
DROP TYPE "osi"."PipelineCaseCommandType";
CREATE TYPE "osi"."PipelineCaseCommandType" AS ENUM
  ('CREATE','UPDATE','TRANSITION','REOPEN','ASSIGN_OWNER','UNASSIGN_OWNER');
ALTER TABLE "osi"."pipeline_case_commands"
  ALTER COLUMN "command_type" TYPE "osi"."PipelineCaseCommandType"
  USING "command_type"::"osi"."PipelineCaseCommandType";

ALTER TABLE "osi"."pipeline_case_commands"
  ADD CONSTRAINT "pipeline_case_commands_version_step_check"
    CHECK (
      ("command_type" = 'CREATE'::"osi"."PipelineCaseCommandType"
        AND "expected_version" = 0 AND "resulting_version" = 1)
      OR
      ("command_type" <> 'CREATE'::"osi"."PipelineCaseCommandType"
        AND "expected_version" >= 1 AND "resulting_version" = "expected_version" + 1)
    ),
  ADD CONSTRAINT "pipeline_case_commands_command_shape_check"
    CHECK (
      CASE "command_type"
        WHEN 'CREATE'::"osi"."PipelineCaseCommandType" THEN
          "expected_version" = 0
          AND "resulting_version" = 1
          AND "previous_status" = 'NEW_INBOX'::"osi"."PipelineCaseStatus"
          AND "resulting_status" = 'NEW_INBOX'::"osi"."PipelineCaseStatus"
          AND "previous_owner_membership_id" IS NULL
          AND "previous_owner_user_id" IS NULL
          AND "reason_code" IS NULL
          AND "evidence_type" IS NULL
          AND "evidence_id" IS NULL
        WHEN 'UPDATE'::"osi"."PipelineCaseCommandType" THEN
          "previous_status" = "resulting_status"
          AND ROW("previous_owner_membership_id", "previous_owner_user_id")
              IS NOT DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND "reason_code" IS NULL
          AND "evidence_type" IS NULL
          AND "evidence_id" IS NULL
        WHEN 'ASSIGN_OWNER'::"osi"."PipelineCaseCommandType" THEN
          "previous_status" = "resulting_status"
          AND "resulting_owner_membership_id" IS NOT NULL
          AND ROW("previous_owner_membership_id", "previous_owner_user_id")
              IS DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND "reason_code" IS NULL
        WHEN 'UNASSIGN_OWNER'::"osi"."PipelineCaseCommandType" THEN
          "previous_status" = "resulting_status"
          AND "previous_owner_membership_id" IS NOT NULL
          AND "resulting_owner_membership_id" IS NULL
          AND "reason_code" IS NULL
        WHEN 'TRANSITION'::"osi"."PipelineCaseCommandType" THEN
          "previous_status" <> "resulting_status"
          AND "previous_status"::text <> 'LOST'
          AND "previous_status"::text <> 'APPROVED'
          AND "resulting_status"::text <> 'APPROVED'
          AND ROW("previous_owner_membership_id", "previous_owner_user_id")
              IS NOT DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND (("resulting_status"::text = 'LOST' AND "reason_code" IN
            ('PRICE','COMPETITOR','NO_RESPONSE','CLIENT_CANCELLED','TIMING','SERVICE_UNAVAILABLE','DUPLICATE','OTHER'))
            OR ("resulting_status"::text <> 'LOST' AND "reason_code" IS NULL))
        WHEN 'REOPEN'::"osi"."PipelineCaseCommandType" THEN
          "previous_status"::text = 'LOST'
          AND "resulting_status"::text = 'NEW_INBOX'
          AND ROW("previous_owner_membership_id", "previous_owner_user_id")
              IS NOT DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND "reason_code" IS NOT NULL
        ELSE FALSE
      END
    );

CREATE FUNCTION "osi"."pipeline_case_commands_validate_case_state"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
DECLARE
  current_case "osi"."osi_pipeline_cases"%ROWTYPE;
BEGIN
  SELECT * INTO current_case
  FROM "osi"."osi_pipeline_cases"
  WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."pipeline_case_id";

  IF NOT FOUND
     OR current_case."version" <> NEW."resulting_version"
     OR current_case."status" IS DISTINCT FROM NEW."resulting_status"
     OR current_case."owner_membership_id" IS DISTINCT FROM NEW."resulting_owner_membership_id"
     OR current_case."owner_user_id" IS DISTINCT FROM NEW."resulting_owner_user_id" THEN
    RAISE EXCEPTION 'pipeline command does not match current case state' USING ERRCODE = '23514';
  END IF;

  IF NEW."previous_status"::text = 'APPROVED' OR NEW."resulting_status"::text = 'APPROVED' THEN
    RAISE EXCEPTION 'APPROVED is frozen pending manual review' USING ERRCODE = '23514';
  END IF;

  IF NEW."command_type" IN ('TRANSITION'::"osi"."PipelineCaseCommandType", 'REOPEN'::"osi"."PipelineCaseCommandType") THEN
    IF current_case."status_changed_at" IS NULL
       OR ABS(EXTRACT(EPOCH FROM (current_case."status_changed_at" - NEW."created_at"))) > 5
       OR ABS(EXTRACT(EPOCH FROM (NEW."created_at" - transaction_timestamp()))) > 5 THEN
      RAISE EXCEPTION 'pipeline transition timestamp is incoherent' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."resulting_status"::text = 'LOST' THEN
    IF current_case."loss_reason_code" IS DISTINCT FROM NEW."reason_code" THEN
      RAISE EXCEPTION 'pipeline LOST reason does not match journal' USING ERRCODE = '23514';
    END IF;
  ELSIF current_case."loss_reason_code" IS NOT NULL THEN
    RAISE EXCEPTION 'pipeline non-LOST state retains loss reason' USING ERRCODE = '23514';
  END IF;

  IF NEW."command_type" = 'REOPEN'::"osi"."PipelineCaseCommandType"
     AND NEW."resulting_status"::text <> 'NEW_INBOX' THEN
    RAISE EXCEPTION 'LOST may only reopen to NEW_INBOX' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pipeline_case_commands_validate_case_state_trigger"
AFTER INSERT ON "osi"."pipeline_case_commands"
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_case_commands_validate_case_state"();

CREATE FUNCTION "osi"."pipeline_cases_require_coherent_command"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
DECLARE
  matching_command "osi"."pipeline_case_commands"%ROWTYPE;
  matching_count INTEGER;
BEGIN
  IF ROW(OLD."version",OLD."status",OLD."status_changed_at",OLD."loss_reason_code",OLD."owner_membership_id",OLD."owner_user_id")
     IS NOT DISTINCT FROM
     ROW(NEW."version",NEW."status",NEW."status_changed_at",NEW."loss_reason_code",NEW."owner_membership_id",NEW."owner_user_id") THEN
    RETURN NULL;
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'governed pipeline mutation must increment version exactly once' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*)::integer INTO matching_count
  FROM "osi"."pipeline_case_commands"
  WHERE "tenant_id"=NEW."tenant_id" AND "pipeline_case_id"=NEW."id"
    AND "expected_version"=OLD."version" AND "resulting_version"=NEW."version";
  IF matching_count <> 1 THEN
    RAISE EXCEPTION 'governed pipeline mutation requires exactly one command' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO matching_command FROM "osi"."pipeline_case_commands"
  WHERE "tenant_id"=NEW."tenant_id" AND "pipeline_case_id"=NEW."id"
    AND "expected_version"=OLD."version" AND "resulting_version"=NEW."version";
  IF matching_command."previous_status" IS DISTINCT FROM OLD."status"
     OR matching_command."resulting_status" IS DISTINCT FROM NEW."status"
     OR matching_command."previous_owner_membership_id" IS DISTINCT FROM OLD."owner_membership_id"
     OR matching_command."previous_owner_user_id" IS DISTINCT FROM OLD."owner_user_id"
     OR matching_command."resulting_owner_membership_id" IS DISTINCT FROM NEW."owner_membership_id"
     OR matching_command."resulting_owner_user_id" IS DISTINCT FROM NEW."owner_user_id" THEN
    RAISE EXCEPTION 'pipeline command does not describe case mutation' USING ERRCODE = '23514';
  END IF;
  IF matching_command."command_type" IN (
       'UPDATE'::"osi"."PipelineCaseCommandType",'ASSIGN_OWNER'::"osi"."PipelineCaseCommandType",'UNASSIGN_OWNER'::"osi"."PipelineCaseCommandType"
     ) AND NEW."status_changed_at" IS DISTINCT FROM OLD."status_changed_at" THEN
    RAISE EXCEPTION 'non-transition command cannot change status timestamp' USING ERRCODE = '23514';
  END IF;
  IF matching_command."command_type" IN ('TRANSITION'::"osi"."PipelineCaseCommandType",'REOPEN'::"osi"."PipelineCaseCommandType")
     AND (NEW."status_changed_at" IS NULL OR NEW."status_changed_at" IS NOT DISTINCT FROM OLD."status_changed_at"
       OR ABS(EXTRACT(EPOCH FROM (NEW."status_changed_at" - matching_command."created_at"))) > 5) THEN
    RAISE EXCEPTION 'transition command requires a fresh status timestamp' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "pipeline_cases_coherent_command_constraint"
AFTER UPDATE ON "osi"."osi_pipeline_cases"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_cases_require_coherent_command"();
