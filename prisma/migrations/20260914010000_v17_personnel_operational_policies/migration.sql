-- CreateEnum
CREATE TYPE "osi"."AfterHoursVisitRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "osi"."OperationalCapabilityAssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "osi"."OperationalRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "osi"."OperationalScheduleOverrideKind" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'TRAVEL_BUFFER');

-- CreateEnum
CREATE TYPE "osi"."VisitAdminDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "osi"."VisitClientConfirmation" AS ENUM ('NOT_CONFIRMED', 'CONFIRMED', 'CHANGE_REQUESTED', 'CANCELLED_BY_CLIENT');

-- CreateEnum
CREATE TYPE "osi"."VisitEvaluatorConfirmation" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "osi"."VisitEvaluatorResponse" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'UNAVAILABLE', 'ALTERNATIVE_PROPOSED');

-- CreateEnum
CREATE TYPE "osi"."VisitPolicyEventType" AS ENUM ('PROFILE_UPDATED', 'CAPABILITY_CREATED', 'CAPABILITY_ASSIGNED', 'CAPABILITY_REVOKED', 'ZONE_ASSIGNED', 'SCHEDULE_OVERRIDE_CREATED', 'POLICY_PUBLISHED', 'EXCEPTION_REQUESTED', 'EVALUATOR_RESPONDED', 'ADMIN_APPROVED', 'ADMIN_REJECTED', 'VISIT_SCHEDULED', 'VISIT_RESCHEDULED', 'VISIT_CANCELLED', 'AFTER_HOURS_APPROVED', 'AFTER_HOURS_REJECTED', 'VISIT_REASON_CREATED', 'CLIENT_CONFIRMATION_RECORDED', 'COMMUNICATION_PREPARED');

-- CreateEnum
CREATE TYPE "osi"."VisitPolicyState" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "osi"."VisitPolicyWindowKind" AS ENUM ('REGULAR', 'SPECIAL_CLOSURE', 'SPECIAL_OPENING');

-- CreateEnum
CREATE TYPE "osi"."VisitReasonKind" AS ENUM ('VISIT', 'RESCHEDULE', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "osi"."VisitRequestOrigin" AS ENUM ('CLIENT', 'EVALUATOR', 'SALES', 'ADMIN', 'RESOURCE_CONFLICT', 'OTHER');

-- AlterEnum
ALTER TYPE "osi"."SurveyAssignmentStatus" ADD VALUE 'SUPERSEDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "osi"."SurveySchedulingEventType" ADD VALUE 'EXCEPTION_REQUESTED';
ALTER TYPE "osi"."SurveySchedulingEventType" ADD VALUE 'EVALUATOR_RESPONDED';
ALTER TYPE "osi"."SurveySchedulingEventType" ADD VALUE 'AFTER_HOURS_APPROVED';
ALTER TYPE "osi"."SurveySchedulingEventType" ADD VALUE 'AFTER_HOURS_REJECTED';

-- Scheduling notifications remain PREPARED while external transports are gated.
ALTER TYPE "osi"."CommunicationMilestone" ADD VALUE 'AFTER_HOURS_APPROVED';
ALTER TYPE "osi"."CommunicationMilestone" ADD VALUE 'AFTER_HOURS_REJECTED';

-- AlterTable
ALTER TABLE "osi"."employee_profiles"
  ADD COLUMN "profile_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "operational_restrictions" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "operational_notes" VARCHAR(1000),
  ADD COLUMN "operational_valid_from" TIMESTAMPTZ(6),
  ADD COLUMN "operational_valid_to" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "osi"."survey_assignments" ADD COLUMN     "client_confirmation" "osi"."VisitClientConfirmation" NOT NULL DEFAULT 'NOT_CONFIRMED',
ADD COLUMN     "evaluator_confirmation" "osi"."VisitEvaluatorConfirmation" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "logistics_revision_id" TEXT,
ADD COLUMN     "operational_policy_id" TEXT,
ADD COLUMN     "replaces_assignment_id" TEXT,
ADD COLUMN     "resources_snapshot" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "travel_buffer_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visit_reason_id" TEXT;

-- CreateTable
CREATE TABLE "osi"."after_hours_visit_requests" (
    "id" TEXT NOT NULL,
    "request_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "evaluator_profile_id" TEXT NOT NULL,
    "evaluator_membership_id" TEXT NOT NULL,
    "evaluator_user_id" TEXT NOT NULL,
    "visit_reason_id" TEXT NOT NULL,
    "logistics_revision_id" TEXT,
    "method" "osi"."SurveyEvaluationMethod" NOT NULL,
    "requested_start" TIMESTAMPTZ(6) NOT NULL,
    "requested_end" TIMESTAMPTZ(6) NOT NULL,
    "requester_origin" "osi"."VisitRequestOrigin" NOT NULL,
    "reason_description" VARCHAR(1000) NOT NULL,
    "required_resources_snapshot" JSONB NOT NULL DEFAULT '[]',
    "impact_snapshot" JSONB NOT NULL DEFAULT '{}',
    "violated_rules_snapshot" JSONB NOT NULL DEFAULT '[]',
    "status" "osi"."AfterHoursVisitRequestStatus" NOT NULL DEFAULT 'PENDING',
    "evaluator_response" "osi"."VisitEvaluatorResponse" NOT NULL DEFAULT 'PENDING',
    "admin_decision" "osi"."VisitAdminDecision" NOT NULL DEFAULT 'PENDING',
    "proposed_alternative_start" TIMESTAMPTZ(6),
    "proposed_alternative_end" TIMESTAMPTZ(6),
    "response_reason" VARCHAR(1000),
    "decision_reason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "requested_by_membership_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "decided_by_membership_id" TEXT,
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "after_hours_visit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."operational_capabilities" (
    "id" TEXT NOT NULL,
    "capability_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "status" "osi"."OperationalRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."operational_capability_assignments" (
    "id" TEXT NOT NULL,
    "assignment_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_profile_id" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,
    "status" "osi"."OperationalCapabilityAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "restrictions" JSONB NOT NULL DEFAULT '{}',
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_capability_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."operational_schedule_overrides" (
    "id" TEXT NOT NULL,
    "override_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_profile_id" TEXT NOT NULL,
    "kind" "osi"."OperationalScheduleOverrideKind" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "method" "osi"."SurveyEvaluationMethod",
    "logistics_rule_id" TEXT,
    "travel_buffer_minutes" INTEGER,
    "reason" VARCHAR(500) NOT NULL,
    "status" "osi"."OperationalRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_schedule_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."operational_zone_assignments" (
    "id" TEXT NOT NULL,
    "assignment_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_profile_id" TEXT NOT NULL,
    "logistics_rule_id" TEXT NOT NULL,
    "status" "osi"."OperationalRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_zone_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."personnel_policy_commands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "target_ref" UUID,
    "result_json" JSONB NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_policy_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."visit_policy_events" (
    "id" TEXT NOT NULL,
    "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_ref" UUID NOT NULL,
    "event_type" "osi"."VisitPolicyEventType" NOT NULL,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_policy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."visit_policy_versions" (
    "id" TEXT NOT NULL,
    "policy_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "osi"."VisitPolicyState" NOT NULL DEFAULT 'DRAFT',
    "timezone" VARCHAR(64) NOT NULL,
    "default_visit_minutes" INTEGER NOT NULL,
    "minimum_travel_buffer_minutes" INTEGER NOT NULL,
    "virtual_preparation_minutes" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "replaces_policy_id" TEXT,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."visit_policy_windows" (
    "id" TEXT NOT NULL,
    "window_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "method" "osi"."SurveyEvaluationMethod" NOT NULL,
    "logistics_rule_id" TEXT,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "kind" "osi"."VisitPolicyWindowKind" NOT NULL DEFAULT 'REGULAR',
    "calendar_date" DATE,

    CONSTRAINT "visit_policy_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osi"."visit_reasons" (
    "id" TEXT NOT NULL,
    "reason_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "osi"."VisitReasonKind" NOT NULL,
    "requester_origin" "osi"."VisitRequestOrigin",
    "visible_to_client" BOOLEAN NOT NULL DEFAULT true,
    "visible_to_evaluator" BOOLEAN NOT NULL DEFAULT true,
    "status" "osi"."OperationalRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "after_hours_visit_requests_evaluator_idx" ON "osi"."after_hours_visit_requests"("tenant_id" ASC, "evaluator_membership_id" ASC, "evaluator_user_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "after_hours_visit_requests_status_idx" ON "osi"."after_hours_visit_requests"("tenant_id" ASC, "status" ASC, "requested_start" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "after_hours_visit_requests_tenant_id_key" ON "osi"."after_hours_visit_requests"("tenant_id" ASC, "id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "after_hours_visit_requests_tenant_ref_key" ON "osi"."after_hours_visit_requests"("tenant_id" ASC, "request_ref" ASC);

-- CreateIndex
CREATE INDEX "operational_capabilities_catalog_idx" ON "osi"."operational_capabilities"("tenant_id" ASC, "status" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_capabilities_request_key" ON "osi"."operational_capabilities"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_capabilities_tenant_code_key" ON "osi"."operational_capabilities"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_capabilities_tenant_id_key" ON "osi"."operational_capabilities"("tenant_id" ASC, "id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_capabilities_tenant_ref_key" ON "osi"."operational_capabilities"("tenant_id" ASC, "capability_ref" ASC);

-- CreateIndex
CREATE INDEX "operational_capability_assignments_capability_idx" ON "osi"."operational_capability_assignments"("tenant_id" ASC, "capability_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "operational_capability_assignments_profile_idx" ON "osi"."operational_capability_assignments"("tenant_id" ASC, "employee_profile_id" ASC, "status" ASC, "valid_from" ASC, "valid_to" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_capability_assignments_request_key" ON "osi"."operational_capability_assignments"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_capability_assignments_tenant_ref_key" ON "osi"."operational_capability_assignments"("tenant_id" ASC, "assignment_ref" ASC);

-- CreateIndex
CREATE INDEX "operational_schedule_overrides_interval_idx" ON "osi"."operational_schedule_overrides"("tenant_id" ASC, "employee_profile_id" ASC, "starts_at" ASC, "ends_at" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_schedule_overrides_request_key" ON "osi"."operational_schedule_overrides"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_schedule_overrides_tenant_ref_key" ON "osi"."operational_schedule_overrides"("tenant_id" ASC, "override_ref" ASC);

-- CreateIndex
CREATE INDEX "operational_zone_assignments_profile_idx" ON "osi"."operational_zone_assignments"("tenant_id" ASC, "employee_profile_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_zone_assignments_request_key" ON "osi"."operational_zone_assignments"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_zone_assignments_tenant_ref_key" ON "osi"."operational_zone_assignments"("tenant_id" ASC, "assignment_ref" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "personnel_policy_commands_request_key" ON "osi"."personnel_policy_commands"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE INDEX "personnel_policy_commands_target_idx" ON "osi"."personnel_policy_commands"("tenant_id" ASC, "target_ref" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "visit_policy_events_aggregate_idx" ON "osi"."visit_policy_events"("tenant_id" ASC, "aggregate_ref" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "visit_policy_events_request_idx" ON "osi"."visit_policy_events"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_events_tenant_ref_key" ON "osi"."visit_policy_events"("tenant_id" ASC, "event_ref" ASC);

-- CreateIndex
CREATE INDEX "visit_policy_versions_active_idx" ON "osi"."visit_policy_versions"("tenant_id" ASC, "state" ASC, "valid_from" ASC, "valid_to" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_versions_replaces_key" ON "osi"."visit_policy_versions"("tenant_id" ASC, "replaces_policy_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_versions_request_key" ON "osi"."visit_policy_versions"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_versions_series_version_key" ON "osi"."visit_policy_versions"("tenant_id" ASC, "series_ref" ASC, "version" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_versions_tenant_id_key" ON "osi"."visit_policy_versions"("tenant_id" ASC, "id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_versions_tenant_ref_key" ON "osi"."visit_policy_versions"("tenant_id" ASC, "policy_ref" ASC);

-- CreateIndex
CREATE INDEX "visit_policy_windows_lookup_idx" ON "osi"."visit_policy_windows"("tenant_id" ASC, "policy_id" ASC, "weekday" ASC, "method" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_windows_scope_key" ON "osi"."visit_policy_windows"("tenant_id" ASC, "policy_id" ASC, "weekday" ASC, "start_minute" ASC, "end_minute" ASC, "method" ASC, "logistics_rule_id" ASC, "calendar_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_policy_windows_tenant_ref_key" ON "osi"."visit_policy_windows"("tenant_id" ASC, "window_ref" ASC);

-- CreateIndex
CREATE INDEX "visit_reasons_catalog_idx" ON "osi"."visit_reasons"("tenant_id" ASC, "kind" ASC, "status" ASC, "sort_order" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_reasons_tenant_code_key" ON "osi"."visit_reasons"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_reasons_tenant_id_key" ON "osi"."visit_reasons"("tenant_id" ASC, "id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_reasons_tenant_ref_key" ON "osi"."visit_reasons"("tenant_id" ASC, "reason_ref" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_tenant_profile_ref_key" ON "osi"."employee_profiles"("tenant_id" ASC, "profile_ref" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_assignments_replaces_key" ON "osi"."survey_assignments"("tenant_id" ASC, "replaces_assignment_id" ASC);

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_admin_fkey" FOREIGN KEY ("tenant_id", "decided_by_membership_id", "decided_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_assignment_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "osi"."survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_evaluator_fkey" FOREIGN KEY ("tenant_id", "evaluator_membership_id", "evaluator_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_logistics_fkey" FOREIGN KEY ("tenant_id", "logistics_revision_id") REFERENCES "osi"."logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_profile_fkey" FOREIGN KEY ("tenant_id", "evaluator_profile_id") REFERENCES "osi"."employee_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_reason_fkey" FOREIGN KEY ("tenant_id", "visit_reason_id") REFERENCES "osi"."visit_reasons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_requester_fkey" FOREIGN KEY ("tenant_id", "requested_by_membership_id", "requested_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."after_hours_visit_requests" ADD CONSTRAINT "after_hours_visit_requests_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_capabilities" ADD CONSTRAINT "operational_capabilities_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_capabilities" ADD CONSTRAINT "operational_capabilities_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_capability_assignments" ADD CONSTRAINT "operational_capability_assignments_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_capability_assignments" ADD CONSTRAINT "operational_capability_assignments_capability_fkey" FOREIGN KEY ("tenant_id", "capability_id") REFERENCES "osi"."operational_capabilities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_capability_assignments" ADD CONSTRAINT "operational_capability_assignments_profile_fkey" FOREIGN KEY ("tenant_id", "employee_profile_id") REFERENCES "osi"."employee_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_capability_assignments" ADD CONSTRAINT "operational_capability_assignments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_schedule_overrides" ADD CONSTRAINT "operational_schedule_overrides_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_schedule_overrides" ADD CONSTRAINT "operational_schedule_overrides_profile_fkey" FOREIGN KEY ("tenant_id", "employee_profile_id") REFERENCES "osi"."employee_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_schedule_overrides" ADD CONSTRAINT "operational_schedule_overrides_rule_fkey" FOREIGN KEY ("tenant_id", "logistics_rule_id") REFERENCES "osi"."logistics_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_schedule_overrides" ADD CONSTRAINT "operational_schedule_overrides_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_zone_assignments" ADD CONSTRAINT "operational_zone_assignments_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_zone_assignments" ADD CONSTRAINT "operational_zone_assignments_profile_fkey" FOREIGN KEY ("tenant_id", "employee_profile_id") REFERENCES "osi"."employee_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_zone_assignments" ADD CONSTRAINT "operational_zone_assignments_rule_fkey" FOREIGN KEY ("tenant_id", "logistics_rule_id") REFERENCES "osi"."logistics_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."operational_zone_assignments" ADD CONSTRAINT "operational_zone_assignments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."personnel_policy_commands" ADD CONSTRAINT "personnel_policy_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."personnel_policy_commands" ADD CONSTRAINT "personnel_policy_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."survey_assignments" ADD CONSTRAINT "survey_assignments_logistics_revision_fkey" FOREIGN KEY ("tenant_id", "logistics_revision_id") REFERENCES "osi"."logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."survey_assignments" ADD CONSTRAINT "survey_assignments_operational_policy_fkey" FOREIGN KEY ("tenant_id", "operational_policy_id") REFERENCES "osi"."visit_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."survey_assignments" ADD CONSTRAINT "survey_assignments_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_assignment_id") REFERENCES "osi"."survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."survey_assignments" ADD CONSTRAINT "survey_assignments_visit_reason_fkey" FOREIGN KEY ("tenant_id", "visit_reason_id") REFERENCES "osi"."visit_reasons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_events" ADD CONSTRAINT "visit_policy_events_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_events" ADD CONSTRAINT "visit_policy_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_versions" ADD CONSTRAINT "visit_policy_versions_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_versions" ADD CONSTRAINT "visit_policy_versions_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_policy_id") REFERENCES "osi"."visit_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_versions" ADD CONSTRAINT "visit_policy_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_windows" ADD CONSTRAINT "visit_policy_windows_policy_fkey" FOREIGN KEY ("tenant_id", "policy_id") REFERENCES "osi"."visit_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_windows" ADD CONSTRAINT "visit_policy_windows_rule_fkey" FOREIGN KEY ("tenant_id", "logistics_rule_id") REFERENCES "osi"."logistics_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_policy_windows" ADD CONSTRAINT "visit_policy_windows_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi"."visit_reasons" ADD CONSTRAINT "visit_reasons_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints which Prisma cannot express.
ALTER TABLE "osi"."employee_profiles"
  ADD CONSTRAINT "employee_profiles_operational_restrictions_check" CHECK (jsonb_typeof("operational_restrictions") = 'object'),
  ADD CONSTRAINT "employee_profiles_operational_period_check" CHECK ("operational_valid_to" IS NULL OR "operational_valid_from" IS NULL OR "operational_valid_to" > "operational_valid_from");

ALTER TABLE "osi"."operational_capabilities"
  ADD CONSTRAINT "operational_capabilities_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_-]{0,79}$'),
  ADD CONSTRAINT "operational_capabilities_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "operational_capabilities_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "osi"."operational_capability_assignments"
  ADD CONSTRAINT "operational_capability_assignments_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "operational_capability_assignments_restrictions_check" CHECK (jsonb_typeof("restrictions") = 'object'),
  ADD CONSTRAINT "operational_capability_assignments_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "osi"."operational_zone_assignments"
  ADD CONSTRAINT "operational_zone_assignments_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "operational_zone_assignments_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "osi"."visit_policy_versions"
  ADD CONSTRAINT "visit_policy_versions_values_check" CHECK ("version" > 0 AND "default_visit_minutes" > 0 AND "minimum_travel_buffer_minutes" >= 0 AND "virtual_preparation_minutes" >= 0),
  ADD CONSTRAINT "visit_policy_versions_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "visit_policy_versions_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "osi"."visit_policy_windows"
  ADD CONSTRAINT "visit_policy_windows_values_check" CHECK (
    "weekday" BETWEEN 0 AND 6
    AND "start_minute" BETWEEN 0 AND 1439
    AND "end_minute" BETWEEN 1 AND 1440
    AND "end_minute" > "start_minute"
    AND "capacity" > 0
    AND (("kind" = 'REGULAR' AND "calendar_date" IS NULL) OR ("kind" <> 'REGULAR' AND "calendar_date" IS NOT NULL))
    AND ("calendar_date" IS NULL OR EXTRACT(DOW FROM "calendar_date")::integer = "weekday")
  );

ALTER TABLE "osi"."visit_reasons"
  ADD CONSTRAINT "visit_reasons_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_-]{0,79}$'),
  ADD CONSTRAINT "visit_reasons_sort_check" CHECK ("sort_order" >= 0);

ALTER TABLE "osi"."operational_schedule_overrides"
  ADD CONSTRAINT "operational_schedule_overrides_interval_check" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "operational_schedule_overrides_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "operational_schedule_overrides_buffer_check" CHECK (("kind" = 'TRAVEL_BUFFER' AND "travel_buffer_minutes" IS NOT NULL AND "travel_buffer_minutes" >= 0) OR ("kind" <> 'TRAVEL_BUFFER' AND ("travel_buffer_minutes" IS NULL OR "travel_buffer_minutes" >= 0))),
  ADD CONSTRAINT "operational_schedule_overrides_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "osi"."after_hours_visit_requests"
  ADD CONSTRAINT "after_hours_visit_requests_interval_check" CHECK ("requested_end" > "requested_start"),
  ADD CONSTRAINT "after_hours_visit_requests_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "after_hours_visit_requests_admin_pair_check" CHECK (("decided_by_membership_id" IS NULL) = ("decided_by_user_id" IS NULL)),
  ADD CONSTRAINT "after_hours_visit_requests_alternative_pair_check" CHECK (("proposed_alternative_start" IS NULL) = ("proposed_alternative_end" IS NULL)),
  ADD CONSTRAINT "after_hours_visit_requests_alternative_interval_check" CHECK ("proposed_alternative_end" IS NULL OR "proposed_alternative_end" > "proposed_alternative_start"),
  ADD CONSTRAINT "after_hours_visit_requests_resources_check" CHECK (jsonb_typeof("required_resources_snapshot") = 'array'),
  ADD CONSTRAINT "after_hours_visit_requests_impact_check" CHECK (jsonb_typeof("impact_snapshot") = 'object'),
  ADD CONSTRAINT "after_hours_visit_requests_rules_check" CHECK (jsonb_typeof("violated_rules_snapshot") = 'array'),
  ADD CONSTRAINT "after_hours_visit_requests_decision_check" CHECK (("admin_decision" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_membership_id" IS NULL) OR ("admin_decision" <> 'PENDING' AND "decided_at" IS NOT NULL AND "decided_by_membership_id" IS NOT NULL)),
  ADD CONSTRAINT "after_hours_visit_requests_status_check" CHECK (("status" = 'APPROVED' AND "admin_decision" = 'APPROVED') OR ("status" = 'REJECTED' AND "admin_decision" = 'REJECTED') OR ("status" IN ('PENDING','CANCELLED','EXPIRED') AND "admin_decision" = 'PENDING'));

ALTER TABLE "osi"."survey_assignments"
  ADD CONSTRAINT "survey_assignments_operational_pairs_check" CHECK (("operational_policy_id" IS NULL OR "visit_reason_id" IS NOT NULL) AND "travel_buffer_minutes" >= 0),
  ADD CONSTRAINT "survey_assignments_resources_snapshot_check" CHECK (jsonb_typeof("resources_snapshot") = 'array'),
  ADD CONSTRAINT "survey_assignments_replacement_check" CHECK ("replaces_assignment_id" IS NULL OR "replaces_assignment_id" <> "id");

ALTER TABLE "osi"."personnel_policy_commands"
  ADD CONSTRAINT "personnel_policy_commands_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "personnel_policy_commands_result_check" CHECK (jsonb_typeof("result_json") = 'object');

ALTER TABLE "osi"."visit_policy_events"
  ADD CONSTRAINT "visit_policy_events_after_check" CHECK (jsonb_typeof("after_snapshot") = 'object'),
  ADD CONSTRAINT "visit_policy_events_before_check" CHECK ("before_snapshot" IS NULL OR jsonb_typeof("before_snapshot") = 'object');

-- Only one current authority may be active for each operational scope.
CREATE UNIQUE INDEX "operational_capability_assignments_active_key"
  ON "osi"."operational_capability_assignments" ("tenant_id", "employee_profile_id", "capability_id")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "operational_zone_assignments_active_key"
  ON "osi"."operational_zone_assignments" ("tenant_id", "employee_profile_id", "logistics_rule_id")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "visit_policy_versions_active_key"
  ON "osi"."visit_policy_versions" ("tenant_id")
  WHERE "state" = 'ACTIVE';
CREATE UNIQUE INDEX "visit_policy_windows_scope_null_safe_key"
  ON "osi"."visit_policy_windows" ("tenant_id", "policy_id", "weekday", "start_minute", "end_minute", "method", COALESCE("logistics_rule_id", ''), COALESCE("calendar_date", DATE '0001-01-01'));

-- Public references and tenant ownership never change after creation.
CREATE FUNCTION "osi"."personnel_public_identity_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id"
     OR to_jsonb(OLD) -> TG_ARGV[0] IS DISTINCT FROM to_jsonb(NEW) -> TG_ARGV[0] THEN
    RAISE EXCEPTION 'Personnel operational identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "osi"."personnel_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Personnel operational record is append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "osi"."personnel_policy_version_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Visit policy version is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id"
     OR OLD."policy_ref" IS DISTINCT FROM NEW."policy_ref"
     OR OLD."series_ref" IS DISTINCT FROM NEW."series_ref"
     OR OLD."version" IS DISTINCT FROM NEW."version"
     OR OLD."timezone" IS DISTINCT FROM NEW."timezone"
     OR OLD."default_visit_minutes" IS DISTINCT FROM NEW."default_visit_minutes"
     OR OLD."minimum_travel_buffer_minutes" IS DISTINCT FROM NEW."minimum_travel_buffer_minutes"
     OR OLD."virtual_preparation_minutes" IS DISTINCT FROM NEW."virtual_preparation_minutes"
     OR OLD."valid_from" IS DISTINCT FROM NEW."valid_from"
     OR OLD."replaces_policy_id" IS DISTINCT FROM NEW."replaces_policy_id"
     OR OLD."actor_membership_id" IS DISTINCT FROM NEW."actor_membership_id"
     OR OLD."actor_user_id" IS DISTINCT FROM NEW."actor_user_id"
     OR OLD."request_id" IS DISTINCT FROM NEW."request_id"
     OR OLD."payload_hash" IS DISTINCT FROM NEW."payload_hash"
     OR NOT (OLD."state" = 'ACTIVE' AND NEW."state" = 'RETIRED' AND OLD."valid_to" IS NULL AND NEW."valid_to" IS NOT NULL) THEN
    RAISE EXCEPTION 'Visit policy version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "osi"."survey_assignment_operational_snapshot_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."operational_policy_id" IS NOT NULL AND (
       OLD."operational_policy_id" IS DISTINCT FROM NEW."operational_policy_id"
       OR OLD."visit_reason_id" IS DISTINCT FROM NEW."visit_reason_id"
       OR OLD."logistics_revision_id" IS DISTINCT FROM NEW."logistics_revision_id"
       OR OLD."travel_buffer_minutes" IS DISTINCT FROM NEW."travel_buffer_minutes"
       OR OLD."resources_snapshot" IS DISTINCT FROM NEW."resources_snapshot"
       OR OLD."replaces_assignment_id" IS DISTINCT FROM NEW."replaces_assignment_id"
     ) THEN
    RAISE EXCEPTION 'Survey assignment operational snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "employee_profiles_profile_ref_immutable" BEFORE UPDATE ON "osi"."employee_profiles" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_public_identity_immutable"('profile_ref');
CREATE TRIGGER "operational_capabilities_ref_immutable" BEFORE UPDATE ON "osi"."operational_capabilities" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_public_identity_immutable"('capability_ref');
CREATE TRIGGER "operational_capability_assignments_ref_immutable" BEFORE UPDATE ON "osi"."operational_capability_assignments" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_public_identity_immutable"('assignment_ref');
CREATE TRIGGER "operational_zone_assignments_ref_immutable" BEFORE UPDATE ON "osi"."operational_zone_assignments" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_public_identity_immutable"('assignment_ref');
CREATE TRIGGER "operational_schedule_overrides_ref_immutable" BEFORE UPDATE ON "osi"."operational_schedule_overrides" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_public_identity_immutable"('override_ref');
CREATE TRIGGER "after_hours_visit_requests_ref_immutable" BEFORE UPDATE ON "osi"."after_hours_visit_requests" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_public_identity_immutable"('request_ref');
CREATE TRIGGER "visit_reasons_ref_immutable" BEFORE UPDATE ON "osi"."visit_reasons" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_public_identity_immutable"('reason_ref');
CREATE TRIGGER "survey_assignments_operational_snapshot_immutable" BEFORE UPDATE ON "osi"."survey_assignments" FOR EACH ROW EXECUTE FUNCTION "osi"."survey_assignment_operational_snapshot_immutable"();

CREATE TRIGGER "visit_policy_versions_guard" BEFORE UPDATE OR DELETE ON "osi"."visit_policy_versions" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_policy_version_guard"();
CREATE TRIGGER "visit_policy_windows_append_only" BEFORE UPDATE OR DELETE ON "osi"."visit_policy_windows" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_append_only"();
CREATE TRIGGER "visit_policy_events_append_only" BEFORE UPDATE OR DELETE ON "osi"."visit_policy_events" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_append_only"();
CREATE TRIGGER "personnel_policy_commands_append_only" BEFORE UPDATE OR DELETE ON "osi"."personnel_policy_commands" FOR EACH ROW EXECUTE FUNCTION "osi"."personnel_append_only"();
