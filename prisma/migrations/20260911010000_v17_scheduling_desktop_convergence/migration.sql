SET search_path = osi, public;

-- CreateEnum
CREATE TYPE "SurveyEvaluationMethod" AS ENUM ('IN_PERSON', 'VIRTUAL', 'CLIENT_PHOTOS_DOCUMENTS', 'WRITTEN_REPORT', 'VOXME', 'MINI', 'NONE');

-- CreateEnum
CREATE TYPE "SurveyEvaluationState" AS ENUM ('NOT_REQUIRED', 'PENDING_METHOD', 'WAITING_CLIENT_INFO', 'READY_TO_SCHEDULE', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurveyInformationSource" AS ENUM ('CLIENT', 'EVALUATOR', 'COMMERCIAL', 'VOXME', 'MINI');

-- CreateEnum
CREATE TYPE "SurveyScheduleProfile" AS ENUM ('METRO', 'INTERIOR_SHORT', 'INTERIOR_LONG', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SurveySchedulePolicyState" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SurveySchedulingEventType" AS ENUM ('METHOD_DECIDED', 'SCHEDULED', 'RESCHEDULED', 'CANCELLED', 'EVALUATOR_CHANGED', 'ROUTE_INVALIDATED', 'VISIT_FEE_CHANGED', 'COMMUNICATION_PREPARED', 'COMMUNICATION_RECORDED', 'SURVEY_PUBLISHED');

-- CreateEnum
CREATE TYPE "SurveyVisitFeeDisposition" AS ENUM ('FREE', 'CHARGEABLE', 'PENDING_CALCULATION', 'WAIVED');

-- CreateEnum
CREATE TYPE "SurveyFeeCommunicationStatus" AS ENUM ('NOT_COMMUNICATED', 'PREPARED', 'COMMUNICATED');

-- CreateEnum
CREATE TYPE "SurveyFeeApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SurveyFeePaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "SurveyCommunicationAudience" AS ENUM ('CLIENT', 'EVALUATOR', 'BOOKER', 'AGENT', 'LEAD_ACCOUNT', 'CORPORATE_CONTACT');

-- CreateEnum
CREATE TYPE "SurveyCommunicationChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "SurveyCommunicationStatus" AS ENUM ('PREPARED', 'RECORDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "survey_assignments" ADD COLUMN     "evaluation_decision_id" TEXT,
ADD COLUMN     "route_invalidated_at" TIMESTAMPTZ(6),
ADD COLUMN     "schedule_policy_id" TEXT,
ADD COLUMN     "schedule_profile" "SurveyScheduleProfile",
ADD COLUMN     "slot_key" VARCHAR(64),
ADD COLUMN     "zone_code" VARCHAR(64);

-- CreateTable
CREATE TABLE "survey_evaluation_decisions" (
    "id" TEXT NOT NULL,
    "decision_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "service_revision_id" TEXT,
    "route_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "method" "SurveyEvaluationMethod" NOT NULL,
    "commercial_state" "SurveyEvaluationState" NOT NULL,
    "information_source" "SurveyInformationSource",
    "rationale_code" VARCHAR(80),
    "replaces_decision_id" TEXT,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_evaluation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_schedule_policy_versions" (
    "id" TEXT NOT NULL,
    "policy_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "SurveySchedulePolicyState" NOT NULL DEFAULT 'DRAFT',
    "timezone" VARCHAR(64) NOT NULL,
    "configuration" JSONB NOT NULL,
    "configuration_hash" CHAR(64) NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "replaces_policy_id" TEXT,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_schedule_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_assignment_events" (
    "id" TEXT NOT NULL,
    "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "evaluation_decision_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "event_type" "SurveySchedulingEventType" NOT NULL,
    "reason_code" VARCHAR(80),
    "notification_required" BOOLEAN NOT NULL DEFAULT false,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_assignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_visit_fees" (
    "id" TEXT NOT NULL,
    "fee_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "evaluation_decision_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "logistics_revision_id" TEXT,
    "costing_revision_id" TEXT,
    "costing_line_id" TEXT,
    "disposition" "SurveyVisitFeeDisposition" NOT NULL,
    "suggested_amount" DECIMAL(18,4),
    "currency" CHAR(3),
    "communication_status" "SurveyFeeCommunicationStatus" NOT NULL DEFAULT 'NOT_COMMUNICATED',
    "approval_status" "SurveyFeeApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "payment_status" "SurveyFeePaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "authorized_by_membership_id" TEXT,
    "authorized_by_user_id" TEXT,
    "authorized_at" TIMESTAMPTZ(6),
    "waiver_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "survey_visit_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_communication_records" (
    "id" TEXT NOT NULL,
    "communication_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "evaluation_decision_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "template_code" VARCHAR(80) NOT NULL,
    "template_version" INTEGER NOT NULL,
    "audience" "SurveyCommunicationAudience" NOT NULL,
    "channel" "SurveyCommunicationChannel" NOT NULL,
    "status" "SurveyCommunicationStatus" NOT NULL DEFAULT 'PREPARED',
    "recipient_ref" UUID,
    "content_hash" CHAR(64) NOT NULL,
    "prepared_by_membership_id" TEXT NOT NULL,
    "prepared_by_user_id" TEXT NOT NULL,
    "prepared_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at" TIMESTAMPTZ(6),

    CONSTRAINT "survey_communication_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "survey_evaluation_decisions_current_idx" ON "survey_evaluation_decisions"("tenant_id", "pipeline_case_id", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_evaluation_decisions_tenant_id_key" ON "survey_evaluation_decisions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_evaluation_decisions_tenant_ref_key" ON "survey_evaluation_decisions"("tenant_id", "decision_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_evaluation_decisions_case_version_key" ON "survey_evaluation_decisions"("tenant_id", "pipeline_case_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "survey_evaluation_decisions_replaces_key" ON "survey_evaluation_decisions"("tenant_id", "replaces_decision_id");

-- CreateIndex
CREATE INDEX "survey_schedule_policies_active_idx" ON "survey_schedule_policy_versions"("tenant_id", "state", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "survey_schedule_policies_tenant_id_key" ON "survey_schedule_policy_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_schedule_policies_tenant_ref_key" ON "survey_schedule_policy_versions"("tenant_id", "policy_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_schedule_policies_series_version_key" ON "survey_schedule_policy_versions"("tenant_id", "series_ref", "version");

-- CreateIndex
CREATE UNIQUE INDEX "survey_schedule_policies_replaces_key" ON "survey_schedule_policy_versions"("tenant_id", "replaces_policy_id");

-- CreateIndex
CREATE INDEX "survey_assignment_events_case_idx" ON "survey_assignment_events"("tenant_id", "pipeline_case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "survey_assignment_events_assignment_idx" ON "survey_assignment_events"("tenant_id", "assignment_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_assignment_events_tenant_ref_key" ON "survey_assignment_events"("tenant_id", "event_ref");

-- CreateIndex
CREATE INDEX "survey_visit_fees_case_idx" ON "survey_visit_fees"("tenant_id", "pipeline_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_visit_fees_tenant_ref_key" ON "survey_visit_fees"("tenant_id", "fee_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_visit_fees_decision_key" ON "survey_visit_fees"("tenant_id", "evaluation_decision_id");

-- CreateIndex
CREATE INDEX "survey_communications_case_idx" ON "survey_communication_records"("tenant_id", "pipeline_case_id", "prepared_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_communications_tenant_ref_key" ON "survey_communication_records"("tenant_id", "communication_ref");

-- Tenant-first referential authority. No legacy text is backfilled or inferred.
ALTER TABLE "survey_evaluation_decisions"
  ADD CONSTRAINT "survey_evaluation_decisions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_evaluation_decisions_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_evaluation_decisions_service_fkey" FOREIGN KEY ("tenant_id", "service_revision_id") REFERENCES "pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_evaluation_decisions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_evaluation_decisions_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_decision_id") REFERENCES "survey_evaluation_decisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_evaluation_decisions_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "survey_evaluation_decisions_route_check" CHECK ("route_version" >= 0),
  ADD CONSTRAINT "survey_evaluation_decisions_state_method_check" CHECK (("method" = 'NONE' AND "commercial_state" IN ('NOT_REQUIRED','PENDING_METHOD','CANCELLED')) OR ("method" <> 'NONE' AND "commercial_state" <> 'NOT_REQUIRED'));

ALTER TABLE "survey_schedule_policy_versions"
  ADD CONSTRAINT "survey_schedule_policies_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_schedule_policies_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_schedule_policies_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_policy_id") REFERENCES "survey_schedule_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_schedule_policies_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "survey_schedule_policies_hash_check" CHECK ("configuration_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "survey_schedule_policies_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from");

CREATE UNIQUE INDEX "survey_schedule_policies_one_active_idx"
  ON "survey_schedule_policy_versions"("tenant_id") WHERE "state" = 'ACTIVE';

ALTER TABLE "survey_assignments"
  ADD CONSTRAINT "survey_assignments_decision_fkey" FOREIGN KEY ("tenant_id", "evaluation_decision_id") REFERENCES "survey_evaluation_decisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_assignments_policy_fkey" FOREIGN KEY ("tenant_id", "schedule_policy_id") REFERENCES "survey_schedule_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_assignments_schedule_fields_check" CHECK (("evaluation_decision_id" IS NULL AND "schedule_policy_id" IS NULL AND "schedule_profile" IS NULL AND "zone_code" IS NULL AND "slot_key" IS NULL) OR ("evaluation_decision_id" IS NOT NULL AND "schedule_policy_id" IS NOT NULL AND "schedule_profile" IS NOT NULL AND "zone_code" IS NOT NULL AND "slot_key" IS NOT NULL));

CREATE INDEX "survey_assignments_slot_capacity_idx"
  ON "survey_assignments"("tenant_id", "schedule_policy_id", "zone_code", "slot_key", "scheduled_start")
  WHERE "status" <> 'CANCELLED' AND "route_invalidated_at" IS NULL;

ALTER TABLE "survey_assignment_events"
  ADD CONSTRAINT "survey_assignment_events_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_assignment_events_decision_fkey" FOREIGN KEY ("tenant_id", "evaluation_decision_id") REFERENCES "survey_evaluation_decisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_assignment_events_assignment_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_assignment_events_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "survey_visit_fees"
  ADD CONSTRAINT "survey_visit_fees_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_visit_fees_decision_fkey" FOREIGN KEY ("tenant_id", "evaluation_decision_id") REFERENCES "survey_evaluation_decisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_visit_fees_assignment_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_visit_fees_logistics_fkey" FOREIGN KEY ("tenant_id", "logistics_revision_id") REFERENCES "logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_visit_fees_costing_fkey" FOREIGN KEY ("tenant_id", "costing_revision_id") REFERENCES "costing_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_visit_fees_costing_line_fkey" FOREIGN KEY ("tenant_id", "costing_line_id") REFERENCES "costing_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_visit_fees_authorizer_fkey" FOREIGN KEY ("tenant_id", "authorized_by_membership_id", "authorized_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_visit_fees_amount_check" CHECK (("suggested_amount" IS NULL AND "currency" IS NULL) OR ("suggested_amount" >= 0 AND "currency" ~ '^[A-Z]{3}$')),
  ADD CONSTRAINT "survey_visit_fees_source_check" CHECK (("suggested_amount" IS NULL AND "logistics_revision_id" IS NULL AND "costing_revision_id" IS NULL AND "costing_line_id" IS NULL) OR ("suggested_amount" IS NOT NULL AND "logistics_revision_id" IS NOT NULL AND "costing_revision_id" IS NOT NULL AND "costing_line_id" IS NOT NULL)),
  ADD CONSTRAINT "survey_visit_fees_waiver_check" CHECK (("disposition" <> 'WAIVED') OR ("waiver_reason" IS NOT NULL AND "authorized_at" IS NOT NULL)),
  ADD CONSTRAINT "survey_visit_fees_authorizer_check" CHECK (("authorized_by_membership_id" IS NULL AND "authorized_by_user_id" IS NULL AND "authorized_at" IS NULL) OR ("authorized_by_membership_id" IS NOT NULL AND "authorized_by_user_id" IS NOT NULL AND "authorized_at" IS NOT NULL));

ALTER TABLE "survey_communication_records"
  ADD CONSTRAINT "survey_communications_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_communications_decision_fkey" FOREIGN KEY ("tenant_id", "evaluation_decision_id") REFERENCES "survey_evaluation_decisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_communications_assignment_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_communications_actor_fkey" FOREIGN KEY ("tenant_id", "prepared_by_membership_id", "prepared_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "survey_communications_template_check" CHECK ("template_version" > 0),
  ADD CONSTRAINT "survey_communications_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "survey_communications_recorded_check" CHECK (("status" = 'RECORDED') = ("recorded_at" IS NOT NULL));

-- Published identities and history are immutable. Commands append replacement rows/events.
CREATE FUNCTION "survey_scheduling_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SURVEY_SCHEDULING_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "survey_evaluation_decisions_append_only"
  BEFORE UPDATE OR DELETE ON "survey_evaluation_decisions"
  FOR EACH ROW EXECUTE FUNCTION "survey_scheduling_append_only"();
CREATE TRIGGER "survey_schedule_policies_append_only"
  BEFORE DELETE ON "survey_schedule_policy_versions"
  FOR EACH ROW EXECUTE FUNCTION "survey_scheduling_append_only"();
CREATE TRIGGER "survey_assignment_events_append_only"
  BEFORE UPDATE OR DELETE ON "survey_assignment_events"
  FOR EACH ROW EXECUTE FUNCTION "survey_scheduling_append_only"();
CREATE TRIGGER "survey_communications_append_only"
  BEFORE UPDATE OR DELETE ON "survey_communication_records"
  FOR EACH ROW EXECUTE FUNCTION "survey_scheduling_append_only"();

CREATE FUNCTION "survey_assignment_public_identity_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."assignment_ref" IS DISTINCT FROM OLD."assignment_ref"
     OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."pipeline_case_id" IS DISTINCT FROM OLD."pipeline_case_id"
     OR NEW."service_revision_id" IS DISTINCT FROM OLD."service_revision_id" THEN
    RAISE EXCEPTION 'SURVEY_ASSIGNMENT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "survey_assignment_public_identity_immutable"
  BEFORE UPDATE ON "survey_assignments"
  FOR EACH ROW EXECUTE FUNCTION "survey_assignment_public_identity_immutable"();
