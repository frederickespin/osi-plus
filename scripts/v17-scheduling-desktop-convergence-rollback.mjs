const raw = process.env.V17_SCHEDULING_TEST_DATABASE_URL;
if (!raw) throw new Error("V17_SCHEDULING_TEST_DATABASE_URL_REQUIRED");
const target = new URL(raw);
if (target.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "55444" || target.pathname !== "/v17_scheduling_11b" || target.searchParams.get("schema") !== "osi" || process.env.V17_SCHEDULING_LOCAL_ROLLBACK !== "YES") throw new Error("V17_SCHEDULING_LOCAL_ROLLBACK_GUARD");

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: raw });
const tables = ["survey_communication_records", "survey_visit_fees", "survey_assignment_events", "survey_schedule_policy_versions", "survey_evaluation_decisions"];
const types = ["SurveyCommunicationStatus", "SurveyCommunicationChannel", "SurveyCommunicationAudience", "SurveyFeePaymentStatus", "SurveyFeeApprovalStatus", "SurveyFeeCommunicationStatus", "SurveyVisitFeeDisposition", "SurveySchedulingEventType", "SurveySchedulePolicyState", "SurveyScheduleProfile", "SurveyInformationSource", "SurveyEvaluationState", "SurveyEvaluationMethod"];
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS "survey_assignment_public_identity_immutable" ON "osi"."survey_assignments"');
    await tx.$executeRawUnsafe('DROP FUNCTION IF EXISTS "osi"."survey_assignment_public_identity_immutable"()');
    for (const table of tables) await tx.$executeRawUnsafe(`DROP TABLE "osi"."${table}" CASCADE`);
    await tx.$executeRawUnsafe('DROP FUNCTION IF EXISTS "osi"."survey_scheduling_append_only"() CASCADE');
    await tx.$executeRawUnsafe('ALTER TABLE "osi"."survey_assignments" DROP COLUMN "evaluation_decision_id", DROP COLUMN "route_invalidated_at", DROP COLUMN "schedule_policy_id", DROP COLUMN "schedule_profile", DROP COLUMN "slot_key", DROP COLUMN "zone_code"');
    for (const type of types) await tx.$executeRawUnsafe(`DROP TYPE "osi"."${type}"`);
    await tx.$executeRawUnsafe('DELETE FROM "osi"."_prisma_migrations" WHERE "migration_name" = \'20260911010000_v17_scheduling_desktop_convergence\'');
  });
  const [migrations, residue] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM "osi"."_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL'),
    prisma.$queryRawUnsafe("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='osi' AND table_name IN ('survey_communication_records','survey_visit_fees','survey_assignment_events','survey_schedule_policy_versions','survey_evaluation_decisions')"),
  ]);
  if (migrations[0]?.count !== 29 || residue[0]?.count !== 0) throw new Error("V17_SCHEDULING_ROLLBACK_INCOMPLETE");
  process.stdout.write(`${JSON.stringify({ ok: true, target: "LOCAL_ONLY", restoredMigrations: "29/29", residue: 0 })}\n`);
} finally { await prisma.$disconnect(); }
