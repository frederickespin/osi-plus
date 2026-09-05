import { PrismaClient } from "@prisma/client";

if (process.env.V17_QUOTE_LOCAL_ROLLBACK !== "YES" || !/^(?:postgresql|postgres):\/\/[^/]+\/(?:v17_quote_(?:test|replay|empty))(?:\?|$)/.test(process.env.DIRECT_URL || "")) {
  throw new Error("V17_QUOTE_LOCAL_ROLLBACK_GUARD");
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
try {
  const statements = [
    `DROP TABLE IF EXISTS "quote_client_decisions" CASCADE`, `DROP TABLE IF EXISTS "quote_dispatches" CASCADE`, `DROP TABLE IF EXISTS "quote_issues" CASCADE`, `DROP TABLE IF EXISTS "quote_lines" CASCADE`, `DROP TABLE IF EXISTS "quote_proposal_revisions" CASCADE`, `DROP TABLE IF EXISTS "quote_mutation_commands" CASCADE`, `DROP TABLE IF EXISTS "quote_proposals" CASCADE`, `DROP TABLE IF EXISTS "quote_reference_counters" CASCADE`,
    `DROP FUNCTION IF EXISTS quote_revision_case_guard() CASCADE`, `DROP FUNCTION IF EXISTS quote_proposal_state_guard() CASCADE`, `DROP FUNCTION IF EXISTS quote_append_only_guard() CASCADE`,
    `ALTER TABLE "osi_pipeline_case_quotes" DROP CONSTRAINT IF EXISTS "osi_pipeline_case_quotes_costing_revision_fkey"`, `ALTER TABLE "osi_pipeline_case_quotes" DROP CONSTRAINT IF EXISTS "osi_pipeline_case_quotes_tenant_case_fkey"`, `ALTER TABLE "osi_pipeline_case_quotes" DROP CONSTRAINT IF EXISTS "osi_pipeline_case_quotes_tenant_fkey"`, `ALTER TABLE "osi_pipeline_case_quotes" DROP CONSTRAINT IF EXISTS "quote_cycles_contract_check"`,
    `DROP INDEX IF EXISTS "osi_pipeline_case_quotes_tenant_id_caseId_version_idx"`, `DROP INDEX IF EXISTS "osi_pipeline_case_quotes_tenant_id_key"`, `DROP INDEX IF EXISTS "osi_pipeline_case_quotes_tenant_ref_key"`, `DROP INDEX IF EXISTS "osi_pipeline_case_quotes_case_cycle_key"`,
    `ALTER TABLE "osi_pipeline_case_quotes" DROP COLUMN IF EXISTS "contract_version", DROP COLUMN IF EXISTS "costing_revision_id", DROP COLUMN IF EXISTS "cycle_number", DROP COLUMN IF EXISTS "public_ref", DROP COLUMN IF EXISTS "tenant_id"`,
    `ALTER TABLE "osi_pipeline_case_quotes" ADD CONSTRAINT "osi_pipeline_case_quotes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "osi_pipeline_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE`, `CREATE INDEX IF NOT EXISTS "osi_pipeline_case_quotes_caseId_version_idx" ON "osi_pipeline_case_quotes"("caseId", "version")`,
    `DROP TYPE IF EXISTS "QuoteClientDecisionKind"`, `DROP TYPE IF EXISTS "QuoteDispatchChannel"`, `DROP TYPE IF EXISTS "QuoteLinePriceStatus"`, `DROP TYPE IF EXISTS "QuoteLineSourceKind"`, `DROP TYPE IF EXISTS "QuoteProposalState"`,
    `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260910010000_v17_quote'`,
  ];
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
  console.log(JSON.stringify({ ok: true, target: "LOCAL_ONLY", restoredMigrationCount: 28 }));
} finally {
  await prisma.$disconnect();
}
