import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const raw = process.env.V17_PERSONNEL_POLICIES_ROLLBACK_DATABASE_URL;
assert.ok(raw, "V17_PERSONNEL_POLICIES_ROLLBACK_DATABASE_URL_REQUIRED");
const target = new URL(raw);
assert.equal(target.protocol, "postgresql:");
assert.ok(
  new Set(["127.0.0.1", "localhost", "::1"]).has(target.hostname),
  "V17_PERSONNEL_POLICIES_ROLLBACK_LOCAL_ONLY",
);
assert.match(
  target.pathname.slice(1),
  /personnel/i,
  "V17_PERSONNEL_POLICIES_ROLLBACK_DATABASE_REJECTED",
);
assert.equal(
  target.searchParams.get("schema"),
  "osi",
  "V17_PERSONNEL_POLICIES_ROLLBACK_SCHEMA_REJECTED",
);
assert.equal(
  process.env.V17_PERSONNEL_POLICIES_ROLLBACK_CONFIRM,
  "YES",
  "V17_PERSONNEL_POLICIES_ROLLBACK_CONFIRM_REQUIRED",
);

const prisma = new PrismaClient({ datasourceUrl: raw });
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM "osi"."survey_assignments" WHERE "status" = 'SUPERSEDED')
          OR EXISTS (SELECT 1 FROM "osi"."survey_assignment_events" WHERE "event_type" IN ('EXCEPTION_REQUESTED','EVALUATOR_RESPONDED','AFTER_HOURS_APPROVED','AFTER_HOURS_REJECTED'))
          OR EXISTS (SELECT 1 FROM "osi"."communication_records" WHERE "milestone" IN ('AFTER_HOURS_APPROVED','AFTER_HOURS_REJECTED')) THEN
          RAISE EXCEPTION 'V17_PERSONNEL_POLICIES_ROLLBACK_DATA_PRESENT';
        END IF;
      END $$`);
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS
      "osi"."after_hours_visit_requests",
      "osi"."visit_policy_events",
      "osi"."personnel_policy_commands",
      "osi"."operational_schedule_overrides",
      "osi"."operational_zone_assignments",
      "osi"."operational_capability_assignments",
      "osi"."visit_policy_windows",
      "osi"."visit_reasons",
      "osi"."visit_policy_versions",
      "osi"."operational_capabilities" CASCADE`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."survey_assignments"
      DROP COLUMN IF EXISTS "client_confirmation",
      DROP COLUMN IF EXISTS "evaluator_confirmation",
      DROP COLUMN IF EXISTS "logistics_revision_id",
      DROP COLUMN IF EXISTS "operational_policy_id",
      DROP COLUMN IF EXISTS "replaces_assignment_id",
      DROP COLUMN IF EXISTS "resources_snapshot",
      DROP COLUMN IF EXISTS "travel_buffer_minutes",
      DROP COLUMN IF EXISTS "visit_reason_id"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."employee_profiles"
      DROP COLUMN IF EXISTS "profile_ref",
      DROP COLUMN IF EXISTS "operational_restrictions",
      DROP COLUMN IF EXISTS "operational_notes",
      DROP COLUMN IF EXISTS "operational_valid_from",
      DROP COLUMN IF EXISTS "operational_valid_to"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION IF EXISTS
      "osi"."personnel_public_identity_immutable"(),
      "osi"."personnel_append_only"(),
      "osi"."personnel_policy_version_guard"(),
      "osi"."survey_assignment_operational_snapshot_immutable"() CASCADE`);

    await tx.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "osi"."survey_assignments_slot_capacity_idx"`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "osi"."survey_assignments" ALTER COLUMN "status" DROP DEFAULT, ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "osi"."survey_assignment_events" ALTER COLUMN "event_type" TYPE text USING "event_type"::text`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "osi"."communication_records" ALTER COLUMN "milestone" TYPE text USING "milestone"::text`,
    );
    await tx.$executeRawUnsafe(
      `DROP TYPE "osi"."SurveyAssignmentStatus", "osi"."SurveySchedulingEventType", "osi"."CommunicationMilestone"`,
    );
    await tx.$executeRawUnsafe(
      `CREATE TYPE "osi"."SurveyAssignmentStatus" AS ENUM ('ASSIGNED','ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED')`,
    );
    await tx.$executeRawUnsafe(
      `CREATE TYPE "osi"."SurveySchedulingEventType" AS ENUM ('METHOD_DECIDED','SCHEDULED','RESCHEDULED','CANCELLED','EVALUATOR_CHANGED','ROUTE_INVALIDATED','VISIT_FEE_CHANGED','COMMUNICATION_PREPARED','COMMUNICATION_RECORDED','SURVEY_PUBLISHED')`,
    );
    await tx.$executeRawUnsafe(
      `CREATE TYPE "osi"."CommunicationMilestone" AS ENUM ('VISIT_CONFIRMATION','EVALUATOR_ASSIGNMENT','SURVEY_PIC_CLIENT','SURVEY_PIC_EVALUATOR','VISIT_RESCHEDULED','VISIT_CANCELLED','QUOTE_SENT','FOLLOW_UP_1','FOLLOW_UP_2','EXPIRY_REMINDER','QUOTE_ACCEPTED','QUOTE_REJECTED','CLIENT_INFORMATION_REQUEST','DOCUMENT_REQUEST','BOOKER_NOTIFICATION','AGENT_NOTIFICATION','LEAD_ACCOUNT_NOTIFICATION')`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "osi"."survey_assignments" ALTER COLUMN "status" TYPE "osi"."SurveyAssignmentStatus" USING "status"::"osi"."SurveyAssignmentStatus", ALTER COLUMN "status" SET DEFAULT 'ASSIGNED'`,
    );
    await tx.$executeRawUnsafe(
      `CREATE INDEX "survey_assignments_slot_capacity_idx" ON "osi"."survey_assignments"("tenant_id", "schedule_policy_id", "zone_code", "slot_key", "scheduled_start") WHERE "status" <> 'CANCELLED' AND "route_invalidated_at" IS NULL`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "osi"."survey_assignment_events" ALTER COLUMN "event_type" TYPE "osi"."SurveySchedulingEventType" USING "event_type"::"osi"."SurveySchedulingEventType"`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "osi"."communication_records" ALTER COLUMN "milestone" TYPE "osi"."CommunicationMilestone" USING "milestone"::"osi"."CommunicationMilestone"`,
    );

    for (const type of [
      "AfterHoursVisitRequestStatus",
      "OperationalCapabilityAssignmentStatus",
      "OperationalRecordStatus",
      "OperationalScheduleOverrideKind",
      "VisitAdminDecision",
      "VisitClientConfirmation",
      "VisitEvaluatorConfirmation",
      "VisitEvaluatorResponse",
      "VisitPolicyEventType",
      "VisitPolicyState",
      "VisitPolicyWindowKind",
      "VisitReasonKind",
      "VisitRequestOrigin",
    ]) {
      await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS "osi"."${type}"`);
    }
    await tx.$executeRawUnsafe(
      `DELETE FROM "osi"."_prisma_migrations" WHERE "migration_name"='20260914010000_v17_personnel_operational_policies'`,
    );
  });
  const [status] = await prisma.$queryRawUnsafe(`SELECT
    (SELECT count(*)::int FROM "osi"."_prisma_migrations") AS "migrations",
    to_regclass('osi.visit_policy_versions') IS NULL AS "tablesAbsent",
    NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='employee_profiles' AND column_name='profile_ref') AS "profileRefAbsent",
    NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='osi' AND table_name='survey_assignments' AND column_name='operational_policy_id') AS "assignmentPolicyAbsent"`);
  assert.deepEqual(status, {
    migrations: 32,
    tablesAbsent: true,
    profileRefAbsent: true,
    assignmentPolicyAbsent: true,
  });
  process.stdout.write(
    `${JSON.stringify({ ok: true, rolledBackTo: 32, localOnly: true })}\n`,
  );
} finally {
  await prisma.$disconnect();
}
