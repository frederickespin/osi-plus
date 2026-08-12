import { createCrm01b1LocalPrisma } from "./crm-01b1-local-target.mjs";

const MIGRATION = "20260801015000_crm01b_pipeline_mutation_authority";
const LEGACY_STATUSES = [
  "NEW_INBOX", "AWAITING_ICP", "GOVERNANCE_CONFIRMED", "REQUIREMENTS_CONFIRMED",
  "SURVEY_PLANNING", "SURVEY_SCHEDULED", "SURVEY_COMPLETED", "CRATING_ESTIMATE_PENDING",
  "PRICING_IN_PROGRESS", "INTERNAL_REVIEW", "QUOTE_SENT", "NEGOTIATION",
  "CHANGE_CONTROL", "APPROVED", "OPS_HANDOFF",
];

function invariant(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

if (process.env.CRM01B1_ALLOW_LOCAL_ROLLBACK !== "true") {
  throw new Error("CRM01B1_LOCAL_ROLLBACK_NOT_AUTHORIZED");
}

const { prisma, target } = await createCrm01b1LocalPrisma();
try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '2s'`);
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '30s'`);
    await tx.$executeRawUnsafe(`LOCK TABLE "osi"."pipeline_case_commands", "osi"."osi_projects", "osi"."osi_pipeline_cases" IN ACCESS EXCLUSIVE MODE`);
    const [commands, projects, cases, newStatuses, history] = await Promise.all([
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."pipeline_case_commands"`),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."osi_projects" WHERE "pipeline_case_id" IS NOT NULL`),
      tx.$queryRawUnsafe(`
        SELECT COUNT(*) FILTER (WHERE "version" <> 1)::integer AS wrong_version,
               COUNT(*) FILTER (WHERE "status_changed_at" IS NOT NULL)::integer AS changed_at,
               COUNT(*) FILTER (WHERE "loss_reason_code" IS NOT NULL)::integer AS loss_reason
        FROM "osi"."osi_pipeline_cases"
      `),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."osi_pipeline_cases" WHERE status::text IN ('QUOTE_DRAFT','WON','LOST')`),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM "osi"."_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, MIGRATION),
    ]);
    invariant(Number(commands[0].count) === 0, "CRM01B1_ROLLBACK_COMMANDS_NOT_EMPTY");
    invariant(Number(projects[0].count) === 0, "CRM01B1_ROLLBACK_PROJECT_LINKS_PRESENT");
    invariant(Number(cases[0].wrong_version) === 0, "CRM01B1_ROLLBACK_VERSION_CHANGED");
    invariant(Number(cases[0].changed_at) === 0, "CRM01B1_ROLLBACK_STATUS_DATE_PRESENT");
    invariant(Number(cases[0].loss_reason) === 0, "CRM01B1_ROLLBACK_LOSS_REASON_PRESENT");
    invariant(Number(newStatuses[0].count) === 0, "CRM01B1_ROLLBACK_NEW_STATUS_IN_USE");
    invariant(Number(history[0].count) === 1, "CRM01B1_ROLLBACK_HISTORY_INVALID");

    await tx.$executeRawUnsafe(`DROP TRIGGER "pipeline_cases_coherent_command_constraint" ON "osi"."osi_pipeline_cases"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_cases_require_coherent_command"()`);
    await tx.$executeRawUnsafe(`DROP TABLE "osi"."pipeline_case_commands"`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_case_commands_validate_case_state"()`);
    await tx.$executeRawUnsafe(`DROP FUNCTION "osi"."pipeline_case_commands_reject_mutation"()`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."PipelineCaseCommandType"`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."PipelineCaseEvidenceType"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_projects" DROP CONSTRAINT "osi_projects_tenant_id_pipeline_case_id_fkey"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_projects" DROP CONSTRAINT "osi_projects_pipeline_case_requires_tenant_check"`);
    await tx.$executeRawUnsafe(`DROP INDEX "osi"."osi_projects_tenant_id_pipeline_case_id_idx"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_projects" DROP COLUMN "pipeline_case_id"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP CONSTRAINT "osi_pipeline_cases_loss_reason_check"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP CONSTRAINT "osi_pipeline_cases_version_positive_check"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" DROP COLUMN "loss_reason_code", DROP COLUMN "status_changed_at", DROP COLUMN "version"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" ALTER COLUMN "status" DROP DEFAULT`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" ALTER COLUMN "status" TYPE TEXT USING "status"::text`);
    await tx.$executeRawUnsafe(`DROP TYPE "osi"."PipelineCaseStatus"`);
    await tx.$executeRawUnsafe(`CREATE TYPE "osi"."PipelineCaseStatus" AS ENUM (${LEGACY_STATUSES.map((status) => `'${status}'`).join(",")})`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" ALTER COLUMN "status" TYPE "osi"."PipelineCaseStatus" USING "status"::"osi"."PipelineCaseStatus"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "osi"."osi_pipeline_cases" ALTER COLUMN "status" SET DEFAULT 'NEW_INBOX'::"osi"."PipelineCaseStatus"`);
    const deleted = await tx.$executeRawUnsafe(`DELETE FROM "osi"."_prisma_migrations" WHERE migration_name = '${MIGRATION}'`);
    invariant(Number(deleted) === 1, "CRM01B1_ROLLBACK_HISTORY_DELETE_INVALID");
    return { commands: 0, projectLinks: 0, migrationRemoved: MIGRATION, restoredMigrationCount: 15 };
  }, { maxWait: 5_000, timeout: 60_000 });
  process.stdout.write(`${JSON.stringify({ ok: true, target, ...result }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { name: error.name, code: error.code || "CRM01B1_ROLLBACK_FAILED", message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
