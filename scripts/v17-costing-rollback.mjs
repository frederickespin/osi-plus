import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const raw = process.env.V17_COSTING_TEST_DATABASE_URL || process.env.DATABASE_URL;
assert.ok(raw, "URL local requerida"); const url = new URL(raw); assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname)); assert.match(url.pathname, /costing/i); assert.equal(url.searchParams.get("schema"), "osi");
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
try {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "osi"."costing_margin_authorizations", "osi"."costing_overrides", "osi"."costing_issues", "osi"."costing_lines", "osi"."costing_revisions", "osi"."costing_calculations", "osi"."costing_exchange_rates", "osi"."costing_rules", "osi"."costing_mutation_commands" CASCADE`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi".costing_reject_mutation(), "osi".costing_assert_rule_identity_immutable(), "osi".costing_assert_rate_identity_immutable(), "osi".costing_assert_issue_resolution_only()`);
  for (const type of ["CostingAuthorizationDecision", "CostingOverrideStatus", "CostingOverrideKind", "CostingPriceStatus", "CostingIssueStatus", "CostingIssueSeverity", "CostingRevisionStatus", "CostingCalculationStatus", "CostingRuleState", "CostingEconomicClass", "CostingSource", "CostingFamily"]) await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "osi"."${type}"`);
  await prisma.$executeRaw`DELETE FROM "osi"."_prisma_migrations" WHERE migration_name='20260909010000_v17_costing'`;
  const absent = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema='osi' AND table_name LIKE 'costing_%'`;
  assert.equal(absent[0].count, 0);
  const migrations = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "osi"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(migrations[0].count, 27);
  process.stdout.write(JSON.stringify({ ok: true, rolledBack: "28→27", localOnly: true }) + "\n");
} finally { await prisma.$disconnect(); }
