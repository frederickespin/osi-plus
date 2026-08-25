import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const MIGRATION = "20260824010000_v17_client_public_ref_case_mutations";
const raw = process.env.V17_CRM_CASE_MUTATIONS_TEST_DATABASE_URL;
if (!raw) throw new Error("V17_CRM_CASE_MUTATIONS_ROLLBACK_TARGET_REQUIRED");
const url = new URL(raw);
const database = decodeURIComponent(url.pathname.slice(1));
if (!['postgres:', 'postgresql:'].includes(url.protocol)
  || url.hostname !== "127.0.0.1"
  || url.port !== "55439"
  || database !== "osi_v17_crm_case_mutations_local"
  || url.searchParams.get("schema") !== "osi"
  || /neon|pooler/i.test(raw)) throw new Error("V17_CRM_CASE_MUTATIONS_ROLLBACK_TARGET_REJECTED");

const migration15 = readFileSync(resolve("prisma/migrations/20260801015000_crm01b_pipeline_mutation_authority/migration.sql"), "utf8");
function oldFunction(name, triggerName, triggerKind = "CREATE TRIGGER") {
  const start = migration15.indexOf(`CREATE FUNCTION "osi"."${name}"()`);
  const next = migration15.indexOf(`${triggerKind} "${triggerName}"`, start);
  const end = migration15.indexOf(";", next) + 1;
  if (start < 0 || next < 0 || end <= 0) throw new Error(`V17_CRM_CASE_MUTATIONS_ROLLBACK_SOURCE_MISSING:${name}`);
  return [migration15.slice(start, next).trim(), migration15.slice(next, end).trim()];
}

const [validateFunction, validateTrigger] = oldFunction("pipeline_case_commands_validate_case_state", "pipeline_case_commands_validate_case_state_trigger");
const [coherentFunction, coherentTrigger] = oldFunction("pipeline_cases_require_coherent_command", "pipeline_cases_coherent_command_constraint", "CREATE CONSTRAINT TRIGGER");
const oldShape = `ALTER TABLE "osi"."pipeline_case_commands"
  ADD CONSTRAINT "pipeline_case_commands_version_step_check"
    CHECK ("expected_version" >= 1 AND "resulting_version" = "expected_version" + 1),
  ADD CONSTRAINT "pipeline_case_commands_command_shape_check"
    CHECK (
      CASE "command_type"
        WHEN 'ASSIGN_OWNER'::"osi"."PipelineCaseCommandType" THEN
          "previous_status" = "resulting_status"
          AND "resulting_owner_membership_id" IS NOT NULL
          AND ROW("previous_owner_membership_id", "previous_owner_user_id") IS DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
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
          AND ROW("previous_owner_membership_id", "previous_owner_user_id") IS NOT DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND (("resulting_status"::text = 'LOST' AND "reason_code" IS NOT NULL AND "reason_code" IN ('PRICE','COMPETITOR','NO_RESPONSE','CLIENT_CANCELLED','TIMING','SERVICE_UNAVAILABLE','DUPLICATE','OTHER')) OR ("resulting_status"::text <> 'LOST' AND "reason_code" IS NULL))
        WHEN 'REOPEN'::"osi"."PipelineCaseCommandType" THEN
          "previous_status"::text = 'LOST'
          AND "resulting_status"::text = 'NEW_INBOX'
          AND ROW("previous_owner_membership_id", "previous_owner_user_id") IS NOT DISTINCT FROM ROW("resulting_owner_membership_id", "resulting_owner_user_id")
          AND "reason_code" IS NOT NULL
        ELSE FALSE
      END
    )`;

const prisma = new PrismaClient({ datasourceUrl: raw });
try {
  const result = await prisma.$transaction(async (tx) => {
    const [identity] = await tx.$queryRawUnsafe(`SELECT current_database() AS database, current_schema() AS schema, inet_server_addr()::text AS address, inet_server_port() AS port, current_setting('neon.branch_id', true) AS neon_branch_id`);
    if (identity?.database !== database || identity?.schema !== "osi" || String(identity?.address).split("/")[0] !== "127.0.0.1" || Number(identity?.port) !== 55439 || identity?.neon_branch_id) throw new Error("V17_CRM_CASE_MUTATIONS_ROLLBACK_IDENTITY_REJECTED");
    const [state] = await tx.$queryRawUnsafe(`SELECT
      (SELECT COUNT(*)::integer FROM "osi"."_prisma_migrations" WHERE migration_name='${MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migration,
      (SELECT COUNT(*)::integer FROM "osi"."pipeline_case_commands" WHERE command_type::text IN ('CREATE','UPDATE')) AS new_commands`);
    if (state?.migration !== 1 || state?.new_commands !== 0) throw new Error("V17_CRM_CASE_MUTATIONS_ROLLBACK_PRECONDITION_FAILED");
    const statements = [
      `DROP TRIGGER "pipeline_case_commands_validate_case_state_trigger" ON "osi"."pipeline_case_commands"`,
      `DROP FUNCTION "osi"."pipeline_case_commands_validate_case_state"()`,
      `DROP TRIGGER "pipeline_cases_coherent_command_constraint" ON "osi"."osi_pipeline_cases"`,
      `DROP FUNCTION "osi"."pipeline_cases_require_coherent_command"()`,
      `ALTER TABLE "osi"."pipeline_case_commands" DROP CONSTRAINT "pipeline_case_commands_version_step_check", DROP CONSTRAINT "pipeline_case_commands_command_shape_check"`,
      `ALTER TABLE "osi"."pipeline_case_commands" ALTER COLUMN "command_type" TYPE TEXT USING "command_type"::text`,
      `DROP TYPE "osi"."PipelineCaseCommandType"`,
      `CREATE TYPE "osi"."PipelineCaseCommandType" AS ENUM ('TRANSITION','REOPEN','ASSIGN_OWNER','UNASSIGN_OWNER')`,
      `ALTER TABLE "osi"."pipeline_case_commands" ALTER COLUMN "command_type" TYPE "osi"."PipelineCaseCommandType" USING "command_type"::"osi"."PipelineCaseCommandType"`,
      oldShape,
      validateFunction,
      validateTrigger,
      coherentFunction,
      coherentTrigger,
      `DROP TRIGGER "osi_clients_public_ref_immutable" ON "osi"."osi_clients"`,
      `DROP FUNCTION "osi"."osi_clients_reject_public_ref_mutation"()`,
      `ALTER TABLE "osi"."osi_clients" DROP CONSTRAINT "osi_clients_tenant_id_public_ref_key"`,
      `ALTER TABLE "osi"."osi_clients" DROP COLUMN "public_ref"`,
      `ALTER TABLE "osi"."osi_pipeline_cases" DROP CONSTRAINT "osi_pipeline_cases_tenant_id_case_code_key"`,
      `CREATE UNIQUE INDEX "osi_pipeline_cases_caseCode_key" ON "osi"."osi_pipeline_cases" ("caseCode")`,
      `DELETE FROM "osi"."_prisma_migrations" WHERE migration_name='${MIGRATION}'`,
    ];
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    return { statements: statements.length };
  }, { maxWait: 5_000, timeout: 30_000 });
  process.stdout.write(`${JSON.stringify({ ok: true, database, migration: MIGRATION, ...result }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
