import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const raw = process.env.V17_CLIENT_TEMPORARY_PORTAL_ROLLBACK_DATABASE_URL;
assert.ok(raw, "V17_CLIENT_TEMPORARY_PORTAL_ROLLBACK_DATABASE_URL_REQUIRED");
const target = new URL(raw);
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname) && target.port === "55439" && target.pathname === "/v17_client_portal_16a" && target.searchParams.get("schema") === "osi" && process.env.V17_CLIENT_TEMPORARY_PORTAL_ROLLBACK_CONFIRM === "YES", "V17_CLIENT_TEMPORARY_PORTAL_ROLLBACK_LOCAL_ONLY");
const prisma = new PrismaClient({ datasourceUrl: raw });
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS
      "osi"."client_temporary_qr_confirmations",
      "osi"."client_survey_contribution_assets",
      "osi"."client_survey_contribution_items",
      "osi"."client_survey_contributions",
      "osi"."client_temporary_visit_responses",
      "osi"."client_temporary_access_commands",
      "osi"."client_temporary_access_events",
      "osi"."client_temporary_access_grants",
      "osi"."client_temporary_accesses" CASCADE`);
    await tx.$executeRawUnsafe(`DROP FUNCTION IF EXISTS
      "osi"."client_temporary_mini_limit_guard"(),
      "osi"."client_temporary_append_only_guard"(),
      "osi"."client_temporary_access_immutable_guard"() CASCADE`);
    await tx.$executeRawUnsafe(`DROP TYPE IF EXISTS
      "osi"."ClientTemporaryQrResult",
      "osi"."ClientSurveyDocumentType",
      "osi"."ClientSurveyAssetCategory",
      "osi"."ClientSurveyInformationSource",
      "osi"."ClientSurveyContributionStatus",
      "osi"."ClientTemporaryVisitResponseState",
      "osi"."ClientTemporaryActorKind",
      "osi"."ClientTemporaryAccessEventType",
      "osi"."ClientTemporaryAccessScope",
      "osi"."ClientTemporaryAccessStatus",
      "osi"."ClientTemporaryAccessPurpose" CASCADE`);
    await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS "osi"."survey_assignments_tenant_id_case_key", "osi"."communication_records_tenant_id_key"`);
    await tx.$executeRaw`DELETE FROM "osi"."_prisma_migrations" WHERE migration_name='20260916010000_v17_client_temporary_portal'`;
  });
  const count = await prisma.$queryRaw`SELECT count(*)::int AS count FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count=1`;
  assert.equal(count[0].count, 34);
  process.stdout.write(`${JSON.stringify({ ok: true, rolledBackTo: "34/34", target: "local-only" })}\n`);
} finally { await prisma.$disconnect(); }
