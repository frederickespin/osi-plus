-- CRM-01B1 — autoridad persistente e inactiva para mutaciones PipelineCase.
-- Cambio aditivo: no interpreta estados existentes ni crea comandos.

ALTER TYPE "osi"."PipelineCaseStatus" ADD VALUE 'QUOTE_DRAFT' AFTER 'PRICING_IN_PROGRESS';
ALTER TYPE "osi"."PipelineCaseStatus" ADD VALUE 'WON' AFTER 'NEGOTIATION';
ALTER TYPE "osi"."PipelineCaseStatus" ADD VALUE 'LOST' AFTER 'WON';

CREATE TYPE "osi"."PipelineCaseCommandType" AS ENUM (
  'TRANSITION',
  'REOPEN',
  'ASSIGN_OWNER',
  'UNASSIGN_OWNER'
);

CREATE TYPE "osi"."PipelineCaseEvidenceType" AS ENUM (
  'SURVEY',
  'QUOTE',
  'PROJECT',
  'APPROVAL',
  'ADDENDUM'
);

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "status_changed_at" TIMESTAMPTZ(6),
  ADD COLUMN "loss_reason_code" VARCHAR(64);

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_version_positive_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "osi_pipeline_cases_loss_reason_check"
    CHECK (
      (
        "status"::text = 'LOST'
        AND "loss_reason_code" IS NOT NULL
        AND "loss_reason_code" IN (
          'PRICE', 'COMPETITOR', 'NO_RESPONSE', 'CLIENT_CANCELLED',
          'TIMING', 'SERVICE_UNAVAILABLE', 'DUPLICATE', 'OTHER'
        )
      )
      OR (
        "status"::text <> 'LOST'
        AND "loss_reason_code" IS NULL
      )
    );

ALTER TABLE "osi"."osi_projects"
  ADD COLUMN "pipeline_case_id" TEXT;

ALTER TABLE "osi"."osi_projects"
  ADD CONSTRAINT "osi_projects_pipeline_case_requires_tenant_check"
    CHECK ("pipeline_case_id" IS NULL OR "tenant_id" IS NOT NULL),
  ADD CONSTRAINT "osi_projects_tenant_id_pipeline_case_id_fkey"
    FOREIGN KEY ("tenant_id", "pipeline_case_id")
    REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "osi_projects_tenant_id_pipeline_case_id_idx"
  ON "osi"."osi_projects"("tenant_id", "pipeline_case_id");

CREATE TABLE "osi"."pipeline_case_commands" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "command_type" "osi"."PipelineCaseCommandType" NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "expected_version" INTEGER NOT NULL,
  "resulting_version" INTEGER NOT NULL,
  "previous_status" "osi"."PipelineCaseStatus" NOT NULL,
  "resulting_status" "osi"."PipelineCaseStatus" NOT NULL,
  "previous_owner_membership_id" TEXT,
  "previous_owner_user_id" TEXT,
  "resulting_owner_membership_id" TEXT,
  "resulting_owner_user_id" TEXT,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "actor_role" VARCHAR(64) NOT NULL,
  "reason_code" VARCHAR(64),
  "evidence_type" "osi"."PipelineCaseEvidenceType",
  "evidence_id" VARCHAR(191),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_case_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_case_commands_tenant_request_key" UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "pipeline_case_commands_tenant_case_resulting_version_key"
    UNIQUE ("tenant_id", "pipeline_case_id", "resulting_version"),
  CONSTRAINT "pipeline_case_commands_request_id_canonical_check"
    CHECK ("request_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,190}$'),
  CONSTRAINT "pipeline_case_commands_payload_hash_canonical_check"
    CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "pipeline_case_commands_version_step_check"
    CHECK ("expected_version" >= 1 AND "resulting_version" = "expected_version" + 1),
  CONSTRAINT "pipeline_case_commands_actor_role_canonical_check"
    CHECK ("actor_role" ~ '^[A-Z][A-Z0-9_-]{0,63}$'),
  CONSTRAINT "pipeline_case_commands_previous_owner_complete_check"
    CHECK (("previous_owner_membership_id" IS NULL) = ("previous_owner_user_id" IS NULL)),
  CONSTRAINT "pipeline_case_commands_resulting_owner_complete_check"
    CHECK (("resulting_owner_membership_id" IS NULL) = ("resulting_owner_user_id" IS NULL)),
  CONSTRAINT "pipeline_case_commands_evidence_complete_check"
    CHECK (("evidence_type" IS NULL) = ("evidence_id" IS NULL)),
  CONSTRAINT "pipeline_case_commands_evidence_id_canonical_check"
    CHECK (
      "evidence_id" IS NULL
      OR (
        LENGTH("evidence_id") BETWEEN 1 AND 191
        AND "evidence_id" = BTRIM("evidence_id")
        AND "evidence_id" !~ '[[:cntrl:]]'
      )
    ),
  CONSTRAINT "pipeline_case_commands_reason_code_canonical_check"
    CHECK ("reason_code" IS NULL OR "reason_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "pipeline_case_commands_command_shape_check"
    CHECK (
      CASE "command_type"
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
          AND "previous_status"::text <> 'APPROVED'
          AND "resulting_status"::text <> 'APPROVED'
          AND ROW("previous_owner_membership_id", "previous_owner_user_id")
              IS NOT DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND (
            (
              "resulting_status"::text = 'LOST'
              AND "reason_code" IS NOT NULL
              AND "reason_code" IN (
                'PRICE', 'COMPETITOR', 'NO_RESPONSE', 'CLIENT_CANCELLED',
                'TIMING', 'SERVICE_UNAVAILABLE', 'DUPLICATE', 'OTHER'
              )
            )
            OR (
              "resulting_status"::text <> 'LOST'
              AND "reason_code" IS NULL
            )
          )
        WHEN 'REOPEN'::"osi"."PipelineCaseCommandType" THEN
          "previous_status"::text = 'LOST'
          AND "resulting_status"::text <> 'LOST'
          AND "resulting_status"::text <> 'APPROVED'
          AND ROW("previous_owner_membership_id", "previous_owner_user_id")
              IS NOT DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND "reason_code" IS NOT NULL
        ELSE FALSE
      END
    )
);

CREATE INDEX "pipeline_case_commands_tenant_case_created_at_idx"
  ON "osi"."pipeline_case_commands"("tenant_id", "pipeline_case_id", "created_at" DESC, "id" DESC);

CREATE INDEX "pipeline_case_commands_tenant_actor_created_at_idx"
  ON "osi"."pipeline_case_commands"("tenant_id", "actor_membership_id", "created_at" DESC);

ALTER TABLE "osi"."pipeline_case_commands"
  ADD CONSTRAINT "pipeline_case_commands_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commands_tenant_case_fkey"
    FOREIGN KEY ("tenant_id", "pipeline_case_id")
    REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commands_actor_fkey"
    FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commands_previous_owner_fkey"
    FOREIGN KEY ("tenant_id", "previous_owner_membership_id", "previous_owner_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commands_resulting_owner_fkey"
    FOREIGN KEY ("tenant_id", "resulting_owner_membership_id", "resulting_owner_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "osi"."pipeline_case_commands_reject_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'pipeline_case_commands is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "pipeline_case_commands_append_only"
BEFORE UPDATE OR DELETE ON "osi"."pipeline_case_commands"
FOR EACH ROW EXECUTE FUNCTION "osi"."pipeline_case_commands_reject_mutation"();
