import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const raw = process.env.V17_LOGISTICS_TEST_DATABASE_URL || process.env.DATABASE_URL; assert.ok(raw, "URL local requerida"); const url = new URL(raw); assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname)); assert.match(url.pathname, /logistics/i); assert.equal(url.searchParams.get("schema"), "osi");
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
try {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "osi"."logistics_plan_overrides", "osi"."logistics_plan_issues", "osi"."logistics_plan_items", "osi"."logistics_plan_revisions", "osi"."logistics_plans", "osi"."logistics_calculations", "osi"."logistics_rules", "osi"."logistics_mutation_commands" CASCADE`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "osi".logistics_reject_mutation(), "osi".logistics_assert_rule_identity_immutable(), "osi".logistics_assert_plan_identity_immutable(), "osi".logistics_assert_issue_resolution_only()`);
  for (const type of ["LogisticsIssueStatus", "LogisticsIssueSeverity", "LogisticsSource", "LogisticsPriceStatus", "LogisticsAvailabilityStatus", "LogisticsPlanItemFamily", "LogisticsPlanRevisionStatus", "LogisticsPlanStatus", "LogisticsCalculationStatus", "LogisticsRuleState", "LogisticsRuleFamily"]) await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "osi"."${type}"`);
  await prisma.$executeRaw`DELETE FROM "osi"."_prisma_migrations" WHERE migration_name = '20260908010000_v17_logistics_engine'`;
  const absent = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema='osi' AND table_name LIKE 'logistics_plan%'`; assert.equal(absent[0].count, 0);
  process.stdout.write(JSON.stringify({ ok: true, rolledBackTo: 26, localOnly: true }) + "\n");
} finally { await prisma.$disconnect(); }
